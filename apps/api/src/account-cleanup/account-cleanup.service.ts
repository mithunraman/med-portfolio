import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
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
import { SessionRevokedReason } from '@acme/shared';
import { isErr } from '../common/utils/result.util';
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
import { StorageService } from '../storage/storage.service';
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
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    private readonly storageService: StorageService
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

      this.logger.log(`Found ${users.length} user(s) ready for anonymization`);

      for (const user of users) {
        await this.anonymizeUser(user._id);
      }
    } finally {
      this.processing = false;
    }
  }

  async triggerAnonymization(userId: string): Promise<void> {
    await this.anonymizeUser(new Types.ObjectId(userId));
  }

  private async anonymizeUser(userId: Types.ObjectId): Promise<void> {
    const start = Date.now();
    this.logger.log(`Starting anonymization for user ${userId}`);

    // Resolve conversation IDs once — used by outbox and analysis runs
    const convResult = await this.conversationsRepo.findConversationIdsByUser(userId);
    const conversationIds = isErr(convResult) ? [] : convResult.value;

    const steps: Array<{ name: string; fn: () => Promise<void> }> = [
      { name: 'outbox', fn: () => this.cancelOutboxEntries(userId, conversationIds) },
      { name: 'analysisRuns', fn: () => this.anonymizeAnalysisRuns(conversationIds) },
      { name: 'media', fn: () => this.deleteMediaFiles(userId) },
      { name: 'conversations', fn: () => this.anonymizeConversations(userId) },
      { name: 'artefacts', fn: () => this.anonymizeArtefacts(userId) },
      { name: 'pdpGoals', fn: () => this.anonymizePdpGoals(userId) },
      { name: 'reviewPeriods', fn: () => this.anonymizeReviewPeriods(userId) },
      { name: 'items', fn: () => this.anonymizeItems(userId) },
      { name: 'versionHistory', fn: () => this.deleteVersionHistory(userId) },
      { name: 'user', fn: () => this.anonymizeUserRecord(userId) },
    ];

    let allSucceeded = true;

    for (const step of steps) {
      try {
        await step.fn();
      } catch (error) {
        allSucceeded = false;
        this.logger.error(`Anonymization step "${step.name}" failed for user ${userId}: ${error}`);
      }
    }

    if (allSucceeded) {
      const duration = Date.now() - start;
      this.logger.log(`Anonymization complete for user ${userId} in ${duration}ms`);
    } else {
      this.logger.warn(`Anonymization partially failed for user ${userId}, will retry next cycle`);
    }
  }

  private async cancelOutboxEntries(
    userId: Types.ObjectId,
    conversationIds: Types.ObjectId[]
  ): Promise<void> {
    const convIdStrings = conversationIds.map((id) => id.toString());
    const result = await this.outboxRepo.cancelByUser(userId, convIdStrings);
    if (isErr(result)) throw new Error(result.error.message);
    if (result.value > 0) {
      this.logger.log(`Cancelled ${result.value} outbox entries for user ${userId}`);
    }
  }

  private async anonymizeAnalysisRuns(conversationIds: Types.ObjectId[]): Promise<void> {
    if (conversationIds.length === 0) return;
    const result = await this.analysisRunsRepo.anonymizeByConversationIds(conversationIds);
    if (isErr(result)) throw new Error(result.error.message);
  }

  private async deleteMediaFiles(userId: Types.ObjectId): Promise<void> {
    const findResult = await this.mediaRepo.findByUser(userId);
    if (isErr(findResult)) throw new Error(findResult.error.message);

    for (const item of findResult.value) {
      try {
        await this.storageService.deleteObject(item.bucket, item.key);
      } catch (error) {
        this.logger.warn(`Failed to delete S3 object ${item.key}: ${error}`);
      }
    }

    const result = await this.mediaRepo.anonymizeByUser(userId);
    if (isErr(result)) throw new Error(result.error.message);
  }

  private async anonymizeConversations(userId: Types.ObjectId): Promise<void> {
    const result = await this.conversationsRepo.anonymizeByUser(userId);
    if (isErr(result)) throw new Error(result.error.message);
  }

  private async anonymizeArtefacts(userId: Types.ObjectId): Promise<void> {
    const result = await this.artefactsRepo.anonymizeByUser(userId);
    if (isErr(result)) throw new Error(result.error.message);
  }

  private async anonymizePdpGoals(userId: Types.ObjectId): Promise<void> {
    const result = await this.pdpGoalsRepo.anonymizeByUser(userId);
    if (isErr(result)) throw new Error(result.error.message);
  }

  private async anonymizeReviewPeriods(userId: Types.ObjectId): Promise<void> {
    const result = await this.reviewPeriodsRepo.anonymizeByUser(userId);
    if (isErr(result)) throw new Error(result.error.message);
  }

  private async anonymizeItems(userId: Types.ObjectId): Promise<void> {
    const result = await this.itemsRepo.anonymizeByUser(userId);
    if (isErr(result)) throw new Error(result.error.message);
  }

  private async deleteVersionHistory(userId: Types.ObjectId): Promise<void> {
    const result = await this.versionHistoryRepo.deleteByUser(userId);
    if (isErr(result)) throw new Error(result.error.message);
    if (result.value > 0) {
      this.logger.log(`Deleted ${result.value} version history entries for user ${userId}`);
    }
  }

  private async anonymizeUserRecord(userId: Types.ObjectId): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          name: 'Deleted User',
          email: `deleted-${userId.toString()}@removed.local`,
          specialty: null,
          trainingStage: null,
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          anonymizedAt: new Date(),
        },
      }
    );
    await this.sessionRepo.revokeAllByUser(userId.toString(), SessionRevokedReason.LOGOUT_ALL);
  }
}
