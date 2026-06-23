import type {
  Artefact,
  ArtefactListResponse,
  ArtefactVersionHistoryResponse,
  EditArtefactRequest,
  FinaliseArtefactRequest,
  RestoreArtefactVersionRequest,
  UpdateArtefactStatusRequest,
  UpdateNotesRequest,
  UpsertArtefactReviewRequest,
} from '@acme/shared';
import {
  ArtefactStatus,
  MessageStatus,
  PdpGoalStatus,
  QuotaErrorCode,
  UserRole,
  VersionHistoryEntity,
} from '@acme/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { ClientSession, Model, Types } from 'mongoose';
import { AnalysisRunsService } from '../analysis-runs/analysis-runs.service';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { ARTEFACT_STATE_CHANGED, type ArtefactStateChangedEvent } from '../common/events';
import { nanoidAlphanumeric } from '../common/utils/nanoid.util';
import { isErr } from '../common/utils/result.util';
import { runWithSession } from '../common/utils/run-with-session.util';
import { isNotNull } from '../common/utils/type-guards.util';
import { GUEST_ARTEFACT_LIMIT, isGuestAtArtefactLimit } from '../config/quota.config';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { ConversationsService } from '../conversations/conversations.service';
import { TransactionService } from '../database';
import {
  CreatePdpGoalData,
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
  UpdatePdpGoalActionData,
} from '../pdp-goals/pdp-goals.repository.interface';
import { PdpGoalsService } from '../pdp-goals/pdp-goals.service';
import { VersionHistoryService } from '../version-history';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
  UpdateArtefactData,
} from './artefacts.repository.interface';
import { getSpecialtyConfig } from '../specialties/specialty.registry';
import { CreateArtefactDto, ListArtefactsDto } from './dto';
import { toArtefactDto } from './mappers/artefact.mapper';
import type { Artefact as ArtefactSchema } from './schemas/artefact.schema';
import { createInternalArtefactId } from './utils/artefact-id.util';
import { reconcileNotes } from './utils/notes-reconcile.util';

function generateDefaultTitle(): string {
  return `Log Entry - ${format(new Date(), 'dd/MM')}`;
}

@Injectable()
export class ArtefactsService {
  constructor(
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository,
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    @Inject(PDP_GOALS_REPOSITORY)
    private readonly pdpGoalsRepository: IPdpGoalsRepository,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly transactionService: TransactionService,
    private readonly versionHistoryService: VersionHistoryService,
    private readonly conversationsService: ConversationsService,
    private readonly pdpGoalsService: PdpGoalsService,
    private readonly analysisRunsService: AnalysisRunsService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async createArtefact(userId: string, dto: CreateArtefactDto): Promise<Artefact> {
    const artefactId = createInternalArtefactId(userId, dto.artefactId);

    // Look up user to get specialty and training stage
    const user = await this.userModel.findById(new Types.ObjectId(userId)).lean();
    if (!user) throw new NotFoundException('User not found');
    if (!user.specialty || !user.trainingStage) {
      throw new BadRequestException('User must complete onboarding before creating entries');
    }

    const { specialty, trainingStage } = user;

    return this.transactionService.withTransaction(
      async (session) => {
        await this.assertGuestWithinArtefactLimit(user.role, userId, session);

        // Create artefact
        const defaultTitle = generateDefaultTitle();

        const artefactResult = await this.artefactsRepository.upsertArtefact(
          {
            artefactId,
            userId: new Types.ObjectId(userId),
            specialty,
            title: defaultTitle,
            trainingStage,
          },
          session
        );

        if (isErr(artefactResult)) {
          throw new InternalServerErrorException(artefactResult.error.message);
        }

        const artefact = artefactResult.value;

        // Check if an active conversation already exists for this artefact
        const existingConversationResult =
          await this.conversationsRepository.findActiveConversationByArtefact(
            artefact._id,
            artefact.userId,
            session
          );

        if (isErr(existingConversationResult)) {
          throw new InternalServerErrorException(existingConversationResult.error.message);
        }

        if (existingConversationResult.value) {
          return toArtefactDto(artefact, existingConversationResult.value);
        }

        // Create new conversation for this artefact
        const conversationResult = await this.conversationsRepository.createConversation(
          {
            userId: new Types.ObjectId(userId),
            artefact: artefact._id,
            title: defaultTitle,
          },
          session
        );

        if (isErr(conversationResult)) {
          throw new InternalServerErrorException(conversationResult.error.message);
        }

        return toArtefactDto(artefact, conversationResult.value);
      },
      { context: 'createArtefact' }
    );
  }

  async deleteArtefact(userId: string, xid: string): Promise<{ message: string }> {
    const userOid = new Types.ObjectId(userId);

    await this.transactionService.withTransaction(
      async (session) => {
        const artefact = await this.findOrThrow(xid, userOid, session);

        // While the entry is still in progress, an analysis run may be executing
        // (PENDING/RUNNING). Deleting underneath it would resurrect the tombstoned
        // analysis_run doc when the worker writes its terminal status. A run parked
        // at an interrupt (AWAITING_INPUT) has no worker attached and is safe to
        // delete, so we check findExecutingRun, not findActiveRun.
        if (artefact.status === ArtefactStatus.IN_CONVERSATION) {
          const convIdsResult = await this.conversationsRepository.findIdsByArtefactIds(
            [artefact._id],
            session
          );
          if (isErr(convIdsResult)) {
            throw new InternalServerErrorException(convIdsResult.error.message);
          }
          for (const convId of convIdsResult.value) {
            const executingRun = await this.analysisRunsService.findExecutingRun(convId, session);
            if (executingRun) {
              throw new ConflictException('Cannot delete entry while analysis is in progress');
            }
          }
        }

        await this.deleteByIds([artefact._id], session);
      },
      { context: `deleteArtefact:${xid}` }
    );

    this.emitStateChanged(userId);
    return { message: 'Entry deleted successfully' };
  }

  async getArtefact(userId: string, xid: string): Promise<Artefact> {
    const artefactResult = await this.artefactsRepository.findByXid(
      xid,
      new Types.ObjectId(userId)
    );

    if (isErr(artefactResult)) {
      throw new InternalServerErrorException(artefactResult.error.message);
    }

    if (!artefactResult.value) {
      throw new NotFoundException('Artefact not found');
    }

    const artefact = artefactResult.value;

    const [conversationResult, pdpGoalsResult, versionCount] = await Promise.all([
      this.conversationsRepository.findActiveConversationByArtefact(artefact._id, artefact.userId),
      this.pdpGoalsRepository.findByArtefactId(artefact._id, artefact.userId),
      this.versionHistoryService.countVersions(
        VersionHistoryEntity.ARTEFACT,
        artefact._id,
        artefact.userId
      ),
    ]);

    if (isErr(conversationResult)) {
      throw new InternalServerErrorException(conversationResult.error.message);
    }
    if (!conversationResult.value) {
      throw new NotFoundException('Conversation not found for artefact');
    }
    if (isErr(pdpGoalsResult)) {
      throw new InternalServerErrorException(pdpGoalsResult.error.message);
    }

    return toArtefactDto(artefact, conversationResult.value, pdpGoalsResult.value, versionCount);
  }

  async updateArtefactStatus(
    userId: string,
    xid: string,
    dto: UpdateArtefactStatusRequest
  ): Promise<Artefact> {
    const artefact = await this.transactionService.withTransaction(
      async (session) => {
        const artefactDoc = await this.findOrThrow(xid, new Types.ObjectId(userId), session);

        if (dto.status === ArtefactStatus.ARCHIVED) {
          return this.archiveArtefact(artefactDoc, dto.archivePdpGoals ?? false, session);
        }

        // Simple status update (non-archive transitions)
        const updateResult = await this.artefactsRepository.updateArtefactById(
          artefactDoc._id,
          artefactDoc.userId,
          { status: dto.status },
          session
        );

        if (isErr(updateResult)) {
          throw new InternalServerErrorException(updateResult.error.message);
        }

        return this.buildArtefactDto(updateResult.value._id, updateResult.value, session);
      },
      { context: `updateArtefactStatus:${xid}` }
    );

    if (dto.status === ArtefactStatus.ARCHIVED) {
      this.emitStateChanged(userId);
    }

    return artefact;
  }

  async finaliseArtefact(
    userId: string,
    xid: string,
    dto: FinaliseArtefactRequest
  ): Promise<Artefact> {
    const userOid = new Types.ObjectId(userId);
    const artefact = await this.transactionService.withTransaction(
      async (session) => {
        const artefactDoc = await this.findOrThrow(xid, userOid, session);

        if (artefactDoc.status !== ArtefactStatus.IN_REVIEW) {
          throw new BadRequestException('Artefact must be in IN_REVIEW status to finalise');
        }

        // 1. Set artefact to COMPLETED
        const updateResult = await this.artefactsRepository.updateArtefactById(
          artefactDoc._id,
          userOid,
          { status: ArtefactStatus.COMPLETED, completedAt: new Date() },
          session
        );

        if (isErr(updateResult)) {
          throw new InternalServerErrorException(updateResult.error.message);
        }

        // 2. Apply PDP goal selections (business logic)
        for (const selection of dto.pdpGoalSelections) {
          if (selection.selected) {
            if (!selection.reviewDate) {
              throw new BadRequestException(
                `Review date is required for selected goal ${selection.goalId}`
              );
            }

            const actionUpdates: UpdatePdpGoalActionData[] = (selection.actions ?? []).map((a) => ({
              actionXid: a.actionId,
              status: a.selected ? PdpGoalStatus.STARTED : PdpGoalStatus.ARCHIVED,
            }));

            const result = await this.pdpGoalsRepository.updateGoal(
              selection.goalId,
              userOid,
              {
                status: PdpGoalStatus.STARTED,
                reviewDate: new Date(selection.reviewDate),
              },
              actionUpdates,
              session
            );

            if (isErr(result)) {
              if (result.error.code === 'NOT_FOUND') {
                throw new NotFoundException(`PDP goal not found: ${selection.goalId}`);
              }
              throw new InternalServerErrorException(result.error.message);
            }
          } else {
            // Unselected goal → ARCHIVED (cascades to all actions)
            const result = await this.pdpGoalsRepository.updateGoal(
              selection.goalId,
              userOid,
              { status: PdpGoalStatus.ARCHIVED },
              undefined, // no specific action updates → cascades status to all actions
              session
            );

            if (isErr(result)) {
              if (result.error.code === 'NOT_FOUND') {
                throw new NotFoundException(`PDP goal not found: ${selection.goalId}`);
              }
              throw new InternalServerErrorException(result.error.message);
            }
          }
        }

        return this.buildArtefactDto(updateResult.value._id, updateResult.value, session);
      },
      { context: 'finaliseArtefact' }
    );

    this.emitStateChanged(userId);
    return artefact;
  }

  private async findOrThrow(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<ArtefactSchema> {
    const findResult = await this.artefactsRepository.findByXid(xid, userId, session);
    if (isErr(findResult)) throw new InternalServerErrorException(findResult.error.message);
    if (!findResult.value) throw new NotFoundException('Artefact not found');
    return findResult.value;
  }

  // Assumes lifetime counting via soft-delete: DELETED rows still occupy a slot.
  // Add a monotonic counter on User if a hard-delete path is ever introduced.
  private async assertGuestWithinArtefactLimit(
    role: UserRole,
    userId: string,
    session?: ClientSession
  ): Promise<void> {
    if (role !== UserRole.USER_GUEST) return;

    const countResult = await this.artefactsRepository.countByUser(userId, undefined, session);
    if (isErr(countResult)) {
      throw new InternalServerErrorException(countResult.error.message);
    }

    if (isGuestAtArtefactLimit(role, countResult.value)) {
      throw new ForbiddenException({
        code: QuotaErrorCode.GUEST_ARTEFACT_LIMIT_REACHED,
        limit: GUEST_ARTEFACT_LIMIT,
        message: `Guest accounts are limited to ${GUEST_ARTEFACT_LIMIT} artefacts. Upgrade to continue.`,
      });
    }
  }

  private async archiveArtefact(
    artefactDoc: ArtefactSchema,
    archiveActivePdpGoals: boolean,
    parentSession?: ClientSession
  ): Promise<Artefact> {
    const doArchive = async (session: ClientSession) => {
      // 1. Set artefact status to ARCHIVED
      const updateResult = await this.artefactsRepository.updateArtefactById(
        artefactDoc._id,
        artefactDoc.userId,
        { status: ArtefactStatus.ARCHIVED },
        session
      );

      if (isErr(updateResult)) {
        throw new InternalServerErrorException(updateResult.error.message);
      }

      // 2. Always archive PENDING goals
      const pendingResult = await this.pdpGoalsRepository.updateManyByArtefactId(
        artefactDoc._id,
        { statuses: [PdpGoalStatus.NOT_STARTED] },
        { status: PdpGoalStatus.ARCHIVED },
        session
      );

      if (isErr(pendingResult)) {
        throw new InternalServerErrorException(pendingResult.error.message);
      }

      // 3. Optionally archive ACTIVE + COMPLETED goals (user chose to)
      if (archiveActivePdpGoals) {
        const activeResult = await this.pdpGoalsRepository.updateManyByArtefactId(
          artefactDoc._id,
          { statuses: [PdpGoalStatus.STARTED, PdpGoalStatus.COMPLETED] },
          { status: PdpGoalStatus.ARCHIVED },
          session
        );

        if (isErr(activeResult)) {
          throw new InternalServerErrorException(activeResult.error.message);
        }
      }

      return this.buildArtefactDto(updateResult.value._id, updateResult.value, session);
    };

    const artefact = parentSession
      ? await doArchive(parentSession)
      : await this.transactionService.withTransaction(doArchive, { context: 'archiveArtefact' });

    // Only emit if we own the transaction — callers with a parentSession
    // must emit after their transaction commits to avoid stale events on rollback.
    if (!parentSession) {
      this.emitStateChanged(artefactDoc.userId.toString());
    }
    return artefact;
  }

  async editArtefact(userId: string, xid: string, dto: EditArtefactRequest): Promise<Artefact> {
    if (
      dto.title === undefined &&
      dto.composedDocument === undefined &&
      dto.capabilities === undefined
    ) {
      throw new BadRequestException('No editable fields provided');
    }

    return this.transactionService.withTransaction(
      async (session) => {
        const artefactDoc = await this.findOrThrow(xid, new Types.ObjectId(userId), session);

        if (artefactDoc.status !== ArtefactStatus.IN_REVIEW) {
          throw new BadRequestException('Artefact can only be edited in IN_REVIEW status');
        }

        const editData: UpdateArtefactData = {};
        if (dto.title !== undefined) editData.title = dto.title;
        if (dto.composedDocument !== undefined) {
          // Each edit targets a section by id and overwrites its text; label and
          // order stay server-owned. Edits to unknown section ids are ignored.
          const edits = new Map(dto.composedDocument.map((e) => [e.sectionId, e.text]));
          editData.composedDocument = (artefactDoc.composedDocument ?? []).map((s) =>
            edits.has(s.sectionId) ? { ...s, text: edits.get(s.sectionId)! } : s
          );
        }
        if (dto.capabilities !== undefined) {
          // Each edit targets a capability by code and overwrites only its
          // justification; code and evidence stay server-owned. Edits to unknown
          // codes are ignored. The name is never persisted (derived in the mapper).
          const edits = new Map(dto.capabilities.map((e) => [e.code, e.justification]));
          editData.capabilities = (artefactDoc.capabilities ?? []).map((c) =>
            edits.has(c.code) ? { ...c, justification: edits.get(c.code)! } : c
          );
        }

        // Snapshots are { title, composedDocument, capabilities } — the embedded
        // review is intentionally not versioned, so editing/restoring never touches it.
        await this.versionHistoryService.createVersion(
          VersionHistoryEntity.ARTEFACT,
          artefactDoc._id,
          new Types.ObjectId(userId),
          {
            title: artefactDoc.title,
            composedDocument: artefactDoc.composedDocument,
            capabilities: artefactDoc.capabilities,
          },
          session
        );

        const updateResult = await this.artefactsRepository.updateArtefactById(
          artefactDoc._id,
          artefactDoc.userId,
          editData,
          session
        );

        if (isErr(updateResult)) {
          throw new InternalServerErrorException(updateResult.error.message);
        }

        return this.buildArtefactDto(updateResult.value._id, updateResult.value, session);
      },
      { context: 'editArtefact' }
    );
  }

  async upsertReview(
    userId: string,
    xid: string,
    dto: UpsertArtefactReviewRequest
  ): Promise<Artefact> {
    const userOid = new Types.ObjectId(userId);

    // Ownership + liveness are enforced atomically in the repo's { xid, userId, live }
    // filter, so there's no prior read and no transaction — it's a single-doc upsert.
    const updateResult = await this.artefactsRepository.upsertReview(xid, userOid, {
      rating: dto.rating,
      comment: dto.comment ?? null,
    });

    if (isErr(updateResult)) {
      if (updateResult.error.code === 'NOT_FOUND') {
        throw new NotFoundException('Artefact not found');
      }
      throw new InternalServerErrorException(updateResult.error.message);
    }

    const artefact = updateResult.value;

    return this.buildArtefactDto(artefact._id, artefact);
  }

  async replaceNotes(userId: string, xid: string, dto: UpdateNotesRequest): Promise<Artefact> {
    const userOid = new Types.ObjectId(userId);

    // A prior read is required to preserve each surviving note's createdAt across
    // the array-replace. No transaction/snapshot: notes aren't versioned and the
    // write is a single atomic document update.
    //
    // Concurrency: notes are last-write-wins by design (the chosen array-replace
    // contract). The request IS the full desired array, so a writer whose client
    // never saw a concurrently-added note will drop it on reconcile regardless of
    // isolation — a transaction here would not change that. If real concurrent
    // multi-device editing ever matters, escalate to granular per-note endpoints
    // or an optimistic-concurrency version token, not a transaction.
    const artefactDoc = await this.findOrThrow(xid, userOid);

    // Notes are editable throughout an entry's life except once archived. This
    // check yields a clean 400 in the common case; the repo write filter enforces
    // the same rule atomically to cover an archive that races this read.
    if (artefactDoc.status === ArtefactStatus.ARCHIVED) {
      throw new BadRequestException('Notes cannot be edited on an archived entry');
    }

    // Server owns note identity and timestamps; the request is the full desired array.
    const notes = reconcileNotes(artefactDoc.notes ?? [], dto.notes, new Date());

    // Pass the domain string to the repo (it converts internally). userOid above
    // is only needed by the existing findOrThrow helper, which still takes ObjectId.
    const updateResult = await this.artefactsRepository.replaceNotes(xid, userId, notes);

    if (isErr(updateResult)) {
      if (updateResult.error.code === 'NOT_FOUND') {
        throw new NotFoundException('Artefact not found');
      }
      throw new InternalServerErrorException(updateResult.error.message);
    }

    return this.buildArtefactDto(updateResult.value._id, updateResult.value);
  }

  async getVersionHistory(userId: string, xid: string): Promise<ArtefactVersionHistoryResponse> {
    const artefact = await this.findOrThrow(xid, new Types.ObjectId(userId));

    const versions = await this.versionHistoryService.getVersions(
      VersionHistoryEntity.ARTEFACT,
      artefact._id,
      artefact.userId
    );

    // Capabilities are snapshotted in their persisted shape ({ code, evidence,
    // justification }); project to the preview shape — enrich the name from the
    // registry (as the mapper does) and drop the evidence quote (provenance).
    const capabilityNameMap = new Map(
      getSpecialtyConfig(artefact.specialty).capabilities.map((c) => [c.code, c.name])
    );

    return {
      versions: versions.map((v) => ({
        version: v.version,
        timestamp: v.timestamp.toISOString(),
        title: (v.snapshot.title as string) ?? null,
        composedDocument:
          (v.snapshot.composedDocument as Array<{
            sectionId: string;
            label: string;
            text: string;
          }>) ?? null,
        capabilities:
          (v.snapshot.capabilities as Array<{ code: string; justification?: string }>)?.map(
            (c) => ({
              code: c.code,
              name: capabilityNameMap.get(c.code) ?? c.code,
              justification: c.justification ?? '',
            })
          ) ?? null,
      })),
    };
  }

  async restoreVersion(
    userId: string,
    xid: string,
    dto: RestoreArtefactVersionRequest
  ): Promise<Artefact> {
    return this.transactionService.withTransaction(
      async (session) => {
        const artefactDoc = await this.findOrThrow(xid, new Types.ObjectId(userId), session);

        if (artefactDoc.status !== ArtefactStatus.IN_REVIEW) {
          throw new BadRequestException('Artefact can only be restored in IN_REVIEW status');
        }

        const targetVersion = await this.versionHistoryService.getVersion(
          VersionHistoryEntity.ARTEFACT,
          artefactDoc._id,
          artefactDoc.userId,
          dto.version,
          session
        );

        if (!targetVersion) {
          throw new NotFoundException('Version not found');
        }

        // Snapshot current state before restoring
        await this.versionHistoryService.createVersion(
          VersionHistoryEntity.ARTEFACT,
          artefactDoc._id,
          new Types.ObjectId(userId),
          {
            title: artefactDoc.title,
            composedDocument: artefactDoc.composedDocument,
            capabilities: artefactDoc.capabilities,
          },
          session
        );

        const editData: UpdateArtefactData = {};
        if (targetVersion.snapshot.title !== undefined) {
          editData.title = targetVersion.snapshot.title as string;
        }
        // Snapshots are untyped (Record<string, unknown>); assert back to the repo
        // field types rather than re-declaring their shapes inline.
        if (targetVersion.snapshot.composedDocument !== undefined) {
          editData.composedDocument =
            targetVersion.snapshot.composedDocument as UpdateArtefactData['composedDocument'];
        }
        // Versions created before capability editing won't carry this key; the
        // guard leaves today's capabilities untouched in that case (no backfill).
        if (targetVersion.snapshot.capabilities !== undefined) {
          editData.capabilities =
            targetVersion.snapshot.capabilities as UpdateArtefactData['capabilities'];
        }

        const updateResult = await this.artefactsRepository.updateArtefactById(
          artefactDoc._id,
          artefactDoc.userId,
          editData,
          session
        );

        if (isErr(updateResult)) {
          throw new InternalServerErrorException(updateResult.error.message);
        }

        return this.buildArtefactDto(updateResult.value._id, updateResult.value, session);
      },
      { context: 'restoreVersion' }
    );
  }

  private async buildArtefactDto(
    artefactId: Types.ObjectId,
    artefactDoc: ArtefactSchema,
    session?: ClientSession
  ): Promise<Artefact> {
    // versionCount is computed here (not threaded in by callers) so every
    // mutation response carries the accurate count. Mongo forbids concurrent ops
    // on one session — runWithSession serialises these reads inside a transaction
    // and parallelises them otherwise.
    const [conversationResult, pdpGoalsResult, versionCount] = await runWithSession(
      [
        () =>
          this.conversationsRepository.findActiveConversationByArtefact(
            artefactId,
            artefactDoc.userId,
            session
          ),
        () => this.pdpGoalsRepository.findByArtefactId(artefactId, artefactDoc.userId, session),
        () =>
          this.versionHistoryService.countVersions(
            VersionHistoryEntity.ARTEFACT,
            artefactId,
            artefactDoc.userId,
            session
          ),
      ],
      session
    );

    if (isErr(conversationResult) || !conversationResult.value) {
      throw new InternalServerErrorException('Conversation not found');
    }
    if (isErr(pdpGoalsResult)) {
      throw new InternalServerErrorException(pdpGoalsResult.error.message);
    }

    return toArtefactDto(artefactDoc, conversationResult.value, pdpGoalsResult.value, versionCount);
  }

  async duplicateToReview(userId: string, role: UserRole, xid: string): Promise<Artefact> {
    const userOid = new Types.ObjectId(userId);

    return this.transactionService.withTransaction(
      async (session) => {
        await this.assertGuestWithinArtefactLimit(role, userId, session);

        const sourceArtefact = await this.findOrThrow(xid, userOid, session);

        if (sourceArtefact.status !== ArtefactStatus.COMPLETED) {
          throw new BadRequestException('Only COMPLETED artefacts can be cloned');
        }

        // Fetch source conversation and messages
        const convResult = await this.conversationsRepository.findActiveConversationByArtefact(
          sourceArtefact._id,
          userOid,
          session
        );
        if (isErr(convResult)) throw new InternalServerErrorException(convResult.error.message);
        if (!convResult.value) throw new NotFoundException('Source conversation not found');

        const messagesResult = await this.conversationsRepository.listMessages(
          { conversation: convResult.value._id },
          session
        );
        if (isErr(messagesResult))
          throw new InternalServerErrorException(messagesResult.error.message);

        // Fetch source PDP goals
        const goalsResult = await this.pdpGoalsRepository.findByArtefactId(
          sourceArtefact._id,
          userOid,
          session
        );
        if (isErr(goalsResult)) throw new InternalServerErrorException(goalsResult.error.message);

        // Create new artefact
        const newArtefactResult = await this.artefactsRepository.upsertArtefact(
          {
            artefactId: createInternalArtefactId(userId, nanoidAlphanumeric()),
            userId: new Types.ObjectId(userId),
            specialty: sourceArtefact.specialty,
            trainingStage: sourceArtefact.trainingStage ?? '',
            title: `Copy of ${sourceArtefact.title}`.slice(0, 200),
          },
          session
        );
        if (isErr(newArtefactResult))
          throw new InternalServerErrorException(newArtefactResult.error.message);

        const newArtefact = newArtefactResult.value;

        // Update new artefact to IN_REVIEW with cloned content
        const updateResult = await this.artefactsRepository.updateArtefactById(
          newArtefact._id,
          userOid,
          {
            status: ArtefactStatus.IN_REVIEW,
            artefactType: sourceArtefact.artefactType ?? null,
            composedDocument: sourceArtefact.composedDocument ?? null,
            capabilities: sourceArtefact.capabilities ?? null,
            tags: sourceArtefact.tags ?? null,
          },
          session
        );
        if (isErr(updateResult)) throw new InternalServerErrorException(updateResult.error.message);

        // Create new conversation
        const newConvResult = await this.conversationsRepository.createConversation(
          {
            userId: new Types.ObjectId(userId),
            artefact: newArtefact._id,
            title: `Copy of ${convResult.value.title}`.slice(0, 200),
          },
          session
        );
        if (isErr(newConvResult))
          throw new InternalServerErrorException(newConvResult.error.message);

        const newConversation = newConvResult.value;

        // Clone messages sequentially
        for (const msg of messagesResult.value.messages) {
          const msgResult = await this.conversationsRepository.createMessage(
            {
              conversation: newConversation._id,
              userId: new Types.ObjectId(userId),
              role: msg.role,
              messageType: msg.messageType,
              content: msg.content ?? null,
              status: MessageStatus.COMPLETE,
              idempotencyKey: nanoidAlphanumeric(),
            },
            session
          );
          if (isErr(msgResult)) throw new InternalServerErrorException(msgResult.error.message);
        }

        // Clone non-archived PDP goals (reset to NOT_STARTED)
        const nonArchivedGoals = goalsResult.value.filter(
          (g) => g.status !== PdpGoalStatus.ARCHIVED
        );
        if (nonArchivedGoals.length > 0) {
          const goalsToCreate: CreatePdpGoalData[] = nonArchivedGoals.map((g) => ({
            userId: new Types.ObjectId(userId),
            artefactId: newArtefact._id,
            goal: g.goal,
            actions: g.actions
              .filter((a) => a.status !== PdpGoalStatus.ARCHIVED)
              .map((a) => ({
                action: a.action,
                intendedEvidence: a.intendedEvidence,
              })),
          }));

          const createGoalsResult = await this.pdpGoalsRepository.create(goalsToCreate, session);
          if (isErr(createGoalsResult))
            throw new InternalServerErrorException(createGoalsResult.error.message);
        }

        return this.buildArtefactDto(updateResult.value._id, updateResult.value, session);
      },
      { context: 'cloneArtefact' }
    );
  }

  async listArtefacts(userId: string, query: ListArtefactsDto): Promise<ArtefactListResponse> {
    const limit = query.limit || 20;
    const cursor = query.cursor ? new Types.ObjectId(query.cursor) : undefined;

    const result = await this.artefactsRepository.listArtefacts({
      userId: new Types.ObjectId(userId),
      status: query.status,
      cursor,
      limit,
    });

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    const artefacts = result.value.artefacts;
    const hasMore = artefacts.length === limit;
    const nextCursor = hasMore ? artefacts[artefacts.length - 1]._id.toString() : null;

    if (artefacts.length === 0) {
      return { artefacts: [], nextCursor, limit };
    }

    // Batch-fetch conversations and PDP actions for all artefacts
    const artefactIds = artefacts.map((a) => a._id);

    const [conversationsResult, pdpGoalsResult] = await Promise.all([
      this.conversationsRepository.findActiveConversationsByArtefacts(
        artefactIds,
        new Types.ObjectId(userId)
      ),
      this.pdpGoalsRepository.findByArtefactIds(artefactIds, new Types.ObjectId(userId)),
    ]);

    if (isErr(conversationsResult)) {
      throw new InternalServerErrorException(conversationsResult.error.message);
    }
    if (isErr(pdpGoalsResult)) {
      throw new InternalServerErrorException(pdpGoalsResult.error.message);
    }

    const conversationMap = conversationsResult.value;
    const pdpGoalsMap = pdpGoalsResult.value;

    const artefactsWithConversations = artefacts
      .map((artefact) => {
        const conversation = conversationMap.get(artefact._id.toString());
        if (!conversation) {
          return null;
        }
        const pdpGoals = pdpGoalsMap.get(artefact._id.toString()) || [];
        return toArtefactDto(artefact, conversation, pdpGoals);
      })
      .filter(isNotNull);

    return {
      artefacts: artefactsWithConversations,
      nextCursor,
      limit,
    };
  }

  private emitStateChanged(userId: string): void {
    this.eventEmitter.emit(ARTEFACT_STATE_CHANGED, { userId } satisfies ArtefactStateChangedEvent);
  }

  // ---------------------------------------------------------------------------
  // Cascade primitives
  //
  // Bulk tombstone operations used both by user-triggered deletes and by
  // higher-layer cascades (account cleanup).
  //
  // All primitives:
  // - accept a `session?: ClientSession` so callers control transaction scope
  // - perform a single bulk write per affected collection
  // - are idempotent (filter `status: { $ne: DELETED }`)
  // - tombstone the parent FIRST, then cascade children
  // ---------------------------------------------------------------------------

  /**
   * Bulk tombstone artefacts and cascade into conversations, PDP goals,
   * analysis runs, and version history.
   */
  async deleteByIds(ids: Types.ObjectId[], session?: ClientSession): Promise<void> {
    if (ids.length === 0) return;
    // Intentionally sequential — Mongo forbids concurrent ops on a single session.
    const result = await this.artefactsRepository.markDeleted(ids, session);
    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    await this.conversationsService.deleteByArtefactIds(ids, session);
    await this.pdpGoalsService.deleteByArtefactIds(ids, session);
    await this.analysisRunsService.deleteByArtefactIds(ids, session);
    await this.versionHistoryService.anonymizeByEntity(VersionHistoryEntity.ARTEFACT, ids, session);
  }
}
