import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { SessionRevokedReason } from '@acme/shared';
import {
  ANALYSIS_RUNS_REPOSITORY,
  IAnalysisRunsRepository,
} from '../analysis-runs/analysis-runs.repository.interface';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../artefacts/artefacts.repository.interface';
import { User, UserDocument } from '../auth/schemas/user.schema';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../auth/sessions.repository.interface';
import { isErr, unwrapVoid } from '../common/utils/result.util';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { IItemsRepository, ITEMS_REPOSITORY } from '../items/items.repository.interface';
import { IMediaRepository, MEDIA_REPOSITORY } from '../media/media.repository.interface';
import { IOutboxRepository, OUTBOX_REPOSITORY } from '../outbox/outbox.repository.interface';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
} from '../pdp-goals/pdp-goals.repository.interface';
import {
  IReviewPeriodsRepository,
  REVIEW_PERIODS_REPOSITORY,
} from '../review-periods/review-periods.repository.interface';
import {
  IVersionHistoryRepository,
  VERSION_HISTORY_REPOSITORY,
} from '../version-history/version-history.repository.interface';

@Injectable()
export class AccountCleanupService {
  private readonly logger = new Logger(AccountCleanupService.name);
  private processing = false;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(ARTEFACTS_REPOSITORY) private readonly artefactsRepo: IArtefactsRepository,
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversationsRepo: IConversationsRepository,
    @Inject(MEDIA_REPOSITORY) private readonly mediaRepo: IMediaRepository,
    @Inject(PDP_GOALS_REPOSITORY) private readonly pdpGoalsRepo: IPdpGoalsRepository,
    @Inject(REVIEW_PERIODS_REPOSITORY) private readonly reviewPeriodsRepo: IReviewPeriodsRepository,
    @Inject(ANALYSIS_RUNS_REPOSITORY) private readonly analysisRunsRepo: IAnalysisRunsRepository,
    @Inject(ITEMS_REPOSITORY) private readonly itemsRepo: IItemsRepository,
    @Inject(VERSION_HISTORY_REPOSITORY)
    private readonly versionHistoryRepo: IVersionHistoryRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: IOutboxRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository
  ) {}

  @Cron('0 0 5 * * *') // Daily at 5:00 AM
  async processExpiredDeletions(): Promise<void> {
    if (this.processing) {
      this.logger.debug('Cleanup already in progress, skipping');
      return;
    }

    this.processing = true;
    try {
      const users = await this.userModel
        .find({
          deletionScheduledFor: { $lte: new Date() },
          anonymizedAt: null,
        })
        .select('_id')
        .lean();

      if (users.length === 0) return;

      this.logger.log(`Found ${users.length} user(s) ready for deletion`);

      // Per-user isolation. A deliberate gate refusal (ForbiddenException)
      // halts the batch — that user matched the cron query but failed the
      // in-flight deletionRequestedAt check, surfacing inconsistent state.
      // All other throws (transient Mongo errors in findById / lock writes /
      // resolver / mark write) are logged and skipped; the user remains in
      // the cron query and gets retried on the next 5 AM tick.
      for (const user of users) {
        try {
          await this.executeDeletion(user._id);
        } catch (e) {
          if (e instanceof ForbiddenException) throw e;
          this.logger.error(
            `Deletion threw for user ${user._id.toString()}: ${e instanceof Error ? e.message : e}`
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Admin/manual entry point. Goes through the same safety gate and
   * three-step flow as the scheduled cron path.
   */
  async triggerDeletion(userId: string): Promise<void> {
    await this.executeDeletion(new Types.ObjectId(userId));
  }

  // ---------------------------------------------------------------------------
  // Three-step deletion flow
  //
  // 1. lockAccountForDeletion — revoke sessions + wipe PII (no anonymizedAt).
  //    Closes the mid-purge write race; removes recognizable identifiers fast.
  // 2. purge*ForAccountDeletion — independent bulk tombstones, run in parallel.
  // 3. markAccountAnonymized — single completion marker, only on full success.
  //
  // Every step is idempotent; partial failure leaves anonymizedAt null so the
  // next cron pass retries from step 1.
  // ---------------------------------------------------------------------------

  private async executeDeletion(userId: Types.ObjectId): Promise<void> {
    await this.assertUserMarkedForDeletion(userId);

    const start = Date.now();
    this.logger.log(`Starting deletion for user ${userId.toString()}`);

    // STEP 1 — lock the account.
    await this.lockAccountForDeletion(userId);

    // Resolver — used by analysis-runs and outbox steps. Runs AFTER lock so
    // the account is already PII-wiped on this attempt. Throws on failure
    // (rather than returning [], which would silently no-op the analysis-runs
    // step — analysis_runs has no userId, conversationIds is the only handle).
    const conversationIds = await this.resolveConversationIds(userId);

    // STEP 2 — purge data concurrently. Independent bulk writes, each idempotent.
    // Trivial steps inline directly; the two named methods below carry real
    // logic (outbox: id-to-string adapter, analysisRuns: empty-list guard).
    const steps: Array<{ name: string; fn: () => Promise<unknown> }> = [
      { name: 'outbox',         fn: () => this.purgeOutboxEntriesForAccountDeletion(userId, conversationIds) },
      { name: 'analysisRuns',   fn: () => this.purgeAnalysisRunsForAccountDeletion(conversationIds) },
      { name: 'media',          fn: async () => unwrapVoid(await this.mediaRepo.markPendingDeleteByUser(userId.toString())) },
      { name: 'conversations',  fn: async () => unwrapVoid(await this.conversationsRepo.markDeletedByUserId(userId)) },
      { name: 'artefacts',      fn: async () => unwrapVoid(await this.artefactsRepo.markDeletedByUserId(userId)) },
      { name: 'pdpGoals',       fn: async () => unwrapVoid(await this.pdpGoalsRepo.markDeletedByUserId(userId)) },
      { name: 'reviewPeriods',  fn: async () => unwrapVoid(await this.reviewPeriodsRepo.markDeletedByUserId(userId)) },
      { name: 'items',          fn: async () => unwrapVoid(await this.itemsRepo.markDeletedByUserId(userId)) },
      // HARD delete (deleteMany), not a tombstone — snapshots contain PII and have
      // no recovery value once their parent entity is gone. Do not "normalize" to
      // markDeletedByUserId; the verb difference is intentional.
      { name: 'versionHistory', fn: async () => unwrapVoid(await this.versionHistoryRepo.deleteByUserId(userId)) },
    ];

    const results = await Promise.allSettled(steps.map((s) => s.fn()));

    const failures = results.flatMap((r, i) =>
      r.status === 'rejected' ? [{ name: steps[i].name, reason: r.reason }] : []
    );

    if (failures.length === 0) {
      // STEP 3 — completion marker. Closes the retry loop.
      await this.markAccountAnonymized(userId);
      this.logger.log(
        `Deletion complete for user ${userId.toString()} in ${Date.now() - start}ms`
      );
      return;
    }

    for (const f of failures) {
      this.logger.error(
        `purge step "${f.name}" failed for user ${userId.toString()}: ${f.reason}`
      );
    }
    this.logger.warn(
      `Deletion partial for user ${userId.toString()}: ${failures.length}/${steps.length} steps failed (${failures.map((f) => f.name).join(', ')}) in ${Date.now() - start}ms`
    );
  }

  /**
   * Safety contract: every cleanup path must go through this gate.
   * Refuses unless the user has explicitly requested deletion and has not
   * already been anonymized. Wrong-userId calls, future admin bypasses, and
   * replay against completed users all fail loudly.
   */
  private async assertUserMarkedForDeletion(userId: Types.ObjectId): Promise<void> {
    const user = await this.userModel
      .findById(userId)
      .select('deletionRequestedAt anonymizedAt')
      .lean();

    if (!user) {
      throw new ForbiddenException(`cleanup: user ${userId.toString()} not found`);
    }
    if (user.anonymizedAt) {
      throw new ForbiddenException(
        `cleanup: user ${userId.toString()} already anonymized`
      );
    }
    if (!user.deletionRequestedAt) {
      throw new ForbiddenException(
        `cleanup: user ${userId.toString()} has not requested deletion`
      );
    }
  }

  /**
   * Resolve the user's conversation IDs for the analysis-runs and outbox
   * steps. Throws on lookup failure so the user is left in the retry set
   * rather than falsely marked complete — analysis_runs has no userId, so
   * an empty list silently no-ops the step and orphans those documents.
   */
  private async resolveConversationIds(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const result = await this.conversationsRepo.findConversationIdsByUser(userId);
    if (isErr(result)) {
      throw new Error(
        `failed to resolve conversation ids for user ${userId.toString()}: ${result.error.message}`
      );
    }
    return result.value;
  }

  // ── STEP 1 ─────────────────────────────────────────────────────────────────

  /**
   * Revoke active sessions and wipe PII on the user record. Idempotent —
   * safe to re-run on retry. Does NOT set anonymizedAt; that is the
   * completion marker written only after every purge succeeds.
   */
  private async lockAccountForDeletion(userId: Types.ObjectId): Promise<void> {
    unwrapVoid(
      await this.sessionRepo.revokeAllByUser(
        userId.toString(),
        SessionRevokedReason.LOGOUT_ALL
      )
    );

    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          name: 'Deleted User',
          email: `deleted-${userId.toString()}@removed.local`,
          specialty: null,
          trainingStage: null,
        },
      }
    );
  }

  // ── STEP 2 ─ purge primitives ──────────────────────────────────────────────

  private async purgeOutboxEntriesForAccountDeletion(
    userId: Types.ObjectId,
    conversationIds: Types.ObjectId[]
  ): Promise<void> {
    const convIdStrings = conversationIds.map((id) => id.toString());
    unwrapVoid(await this.outboxRepo.cancelByUser(userId, convIdStrings));
  }

  private async purgeAnalysisRunsForAccountDeletion(
    conversationIds: Types.ObjectId[]
  ): Promise<void> {
    if (conversationIds.length === 0) return;
    unwrapVoid(await this.analysisRunsRepo.markDeletedByConversationIds(conversationIds));
  }

  // ── STEP 3 ─────────────────────────────────────────────────────────────────

  /**
   * Completion marker. Writes anonymizedAt and clears the deletion-request
   * fields so the cron query no longer matches this user. Runs only after
   * every step in STEP 2 succeeds.
   */
  private async markAccountAnonymized(userId: Types.ObjectId): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          anonymizedAt: new Date(),
        },
      }
    );
  }
}
