import type {
  Artefact,
  ArtefactListResponse,
  ArtefactVersionHistoryResponse,
  EditArtefactRequest,
  FinaliseArtefactRequest,
  RestoreArtefactVersionRequest,
  UpdateArtefactStatusRequest,
} from '@acme/shared';
import { ArtefactStatus, MessageStatus, PdpGoalStatus } from '@acme/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { ClientSession, Model, Types } from 'mongoose';
import { ARTEFACT_STATE_CHANGED, type ArtefactStateChangedEvent } from '../common/events';
import { nanoidAlphanumeric } from '../common/utils/nanoid.util';
import { isErr } from '../common/utils/result.util';
import { isNotNull } from '../common/utils/type-guards.util';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { TransactionService } from '../database';
import {
  CreatePdpGoalData,
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
  UpdatePdpGoalActionData,
} from '../pdp-goals/pdp-goals.repository.interface';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { VersionHistoryService } from '../version-history';
import { ARTEFACTS_REPOSITORY, IArtefactsRepository } from './artefacts.repository.interface';
import { CreateArtefactDto, ListArtefactsDto } from './dto';
import { toArtefactDto } from './mappers/artefact.mapper';
import type { Artefact as ArtefactSchema } from './schemas/artefact.schema';
import { createInternalArtefactId } from './utils/artefact-id.util';

function generateDefaultTitle(): string {
  return `Log Entry - ${format(new Date(), 'dd/MM')}`;
}

@Injectable()
export class ArtefactsService {
  private static readonly ENTITY_TYPE = 'artefact';

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
      this.conversationsRepository.findActiveConversationByArtefact(artefact._id),
      this.pdpGoalsRepository.findByArtefactId(artefact._id),
      this.versionHistoryService.countVersions(ArtefactsService.ENTITY_TYPE, artefact._id),
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
    const findResult = await this.artefactsRepository.findByXid(xid, new Types.ObjectId(userId));

    if (isErr(findResult)) {
      throw new InternalServerErrorException(findResult.error.message);
    }
    if (!findResult.value) {
      throw new NotFoundException('Artefact not found');
    }

    const artefactDoc = findResult.value;

    if (dto.status === ArtefactStatus.ARCHIVED) {
      return this.archiveArtefact(artefactDoc, dto.archivePdpGoals ?? false);
    }

    // Simple status update (non-archive transitions)
    const updateResult = await this.artefactsRepository.updateArtefactById(artefactDoc._id, {
      status: dto.status,
    });

    if (isErr(updateResult)) {
      throw new InternalServerErrorException(updateResult.error.message);
    }

    return this.buildArtefactDto(updateResult.value._id, updateResult.value);
  }

  async finaliseArtefact(
    userId: string,
    xid: string,
    dto: FinaliseArtefactRequest
  ): Promise<Artefact> {
    const findResult = await this.artefactsRepository.findByXid(xid, new Types.ObjectId(userId));

    if (isErr(findResult)) {
      throw new InternalServerErrorException(findResult.error.message);
    }
    if (!findResult.value) {
      throw new NotFoundException('Artefact not found');
    }

    const artefactDoc = findResult.value;

    if (artefactDoc.status !== ArtefactStatus.IN_REVIEW) {
      throw new BadRequestException('Artefact must be in IN_REVIEW status to finalise');
    }

    const artefact = await this.transactionService.withTransaction(
      async (session) => {
        // 1. Set artefact to COMPLETED
        const updateResult = await this.artefactsRepository.updateArtefactById(
          artefactDoc._id,
          { status: ArtefactStatus.COMPLETED, completedAt: new Date() },
          session
        );

        if (isErr(updateResult)) {
          throw new InternalServerErrorException(updateResult.error.message);
        }

        // 2. Apply PDP goal selections (business logic)
        for (const selection of dto.pdpGoalSelections) {
          if (selection.selected) {
            // Selected goal → ACTIVE with review date, per-action status based on selection
            const actionUpdates: UpdatePdpGoalActionData[] = (selection.actions ?? []).map((a) => ({
              actionXid: a.actionId,
              status: a.selected ? PdpGoalStatus.STARTED : PdpGoalStatus.ARCHIVED,
            }));

            const result = await this.pdpGoalsRepository.updateGoal(
              selection.goalId,
              {
                status: PdpGoalStatus.STARTED,
                reviewDate: selection.reviewDate ? new Date(selection.reviewDate) : null,
              },
              actionUpdates,
              session
            );

            if (isErr(result)) {
              throw new InternalServerErrorException(result.error.message);
            }
          } else {
            // Unselected goal → ARCHIVED (cascades to all actions)
            const result = await this.pdpGoalsRepository.updateGoal(
              selection.goalId,
              { status: PdpGoalStatus.ARCHIVED },
              undefined, // no specific action updates → cascades status to all actions
              session
            );

            if (isErr(result)) {
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

  private async archiveArtefact(
    artefactDoc: ArtefactSchema,
    archiveActivePdpGoals: boolean
  ): Promise<Artefact> {
    const artefact = await this.transactionService.withTransaction(
      async (session) => {
        // 1. Set artefact status to ARCHIVED
        const updateResult = await this.artefactsRepository.updateArtefactById(
          artefactDoc._id,
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
      },
      { context: 'archiveArtefact' }
    );

    this.emitStateChanged(artefactDoc.userId.toString());
    return artefact;
  }

  async editArtefact(userId: string, xid: string, dto: EditArtefactRequest): Promise<Artefact> {
    const findResult = await this.artefactsRepository.findByXid(xid, new Types.ObjectId(userId));

    if (isErr(findResult)) {
      throw new InternalServerErrorException(findResult.error.message);
    }
    if (!findResult.value) {
      throw new NotFoundException('Artefact not found');
    }

    const artefactDoc = findResult.value;

    if (artefactDoc.status !== ArtefactStatus.IN_REVIEW) {
      throw new BadRequestException('Artefact can only be edited in IN_REVIEW status');
    }

    const editData: { title?: string; reflection?: Array<{ title: string; text: string }> } = {};
    if (dto.title !== undefined) editData.title = dto.title;
    if (dto.reflection !== undefined) editData.reflection = dto.reflection;

    if (Object.keys(editData).length === 0) {
      throw new BadRequestException('No editable fields provided');
    }

    return this.transactionService.withTransaction(
      async (session) => {
        await this.versionHistoryService.createVersion(
          ArtefactsService.ENTITY_TYPE,
          artefactDoc._id,
          new Types.ObjectId(userId),
          {
            title: artefactDoc.title,
            reflection: artefactDoc.reflection,
          },
          session
        );

        const updateResult = await this.artefactsRepository.updateArtefactById(
          artefactDoc._id,
          editData,
          session
        );

        if (isErr(updateResult)) {
          throw new InternalServerErrorException(updateResult.error.message);
        }

        const versionCount = await this.versionHistoryService.countVersions(
          ArtefactsService.ENTITY_TYPE,
          artefactDoc._id,
          session
        );

        return this.buildArtefactDto(
          updateResult.value._id,
          updateResult.value,
          session,
          versionCount
        );
      },
      { context: 'editArtefact' }
    );
  }

  async getVersionHistory(userId: string, xid: string): Promise<ArtefactVersionHistoryResponse> {
    const findResult = await this.artefactsRepository.findByXid(xid, new Types.ObjectId(userId));

    if (isErr(findResult)) {
      throw new InternalServerErrorException(findResult.error.message);
    }
    if (!findResult.value) {
      throw new NotFoundException('Artefact not found');
    }

    const versions = await this.versionHistoryService.getVersions(
      ArtefactsService.ENTITY_TYPE,
      findResult.value._id
    );

    return {
      versions: versions.map((v) => ({
        version: v.version,
        timestamp: v.timestamp.toISOString(),
        title: (v.snapshot.title as string) ?? null,
        reflection: (v.snapshot.reflection as Array<{ title: string; text: string }>) ?? null,
      })),
    };
  }

  async restoreVersion(
    userId: string,
    xid: string,
    dto: RestoreArtefactVersionRequest
  ): Promise<Artefact> {
    const findResult = await this.artefactsRepository.findByXid(xid, new Types.ObjectId(userId));

    if (isErr(findResult)) {
      throw new InternalServerErrorException(findResult.error.message);
    }
    if (!findResult.value) {
      throw new NotFoundException('Artefact not found');
    }

    const artefactDoc = findResult.value;

    if (artefactDoc.status !== ArtefactStatus.IN_REVIEW) {
      throw new BadRequestException('Artefact can only be restored in IN_REVIEW status');
    }

    const targetVersion = await this.versionHistoryService.getVersion(
      ArtefactsService.ENTITY_TYPE,
      artefactDoc._id,
      dto.version
    );

    if (!targetVersion) {
      throw new NotFoundException('Version not found');
    }

    return this.transactionService.withTransaction(
      async (session) => {
        // Snapshot current state before restoring
        await this.versionHistoryService.createVersion(
          ArtefactsService.ENTITY_TYPE,
          artefactDoc._id,
          new Types.ObjectId(userId),
          {
            title: artefactDoc.title,
            reflection: artefactDoc.reflection,
          },
          session
        );

        const editData: { title?: string; reflection?: Array<{ title: string; text: string }> } =
          {};
        if (targetVersion.snapshot.title !== undefined) {
          editData.title = targetVersion.snapshot.title as string;
        }
        if (targetVersion.snapshot.reflection !== undefined) {
          editData.reflection = targetVersion.snapshot.reflection as Array<{
            title: string;
            text: string;
          }>;
        }

        const updateResult = await this.artefactsRepository.updateArtefactById(
          artefactDoc._id,
          editData,
          session
        );

        if (isErr(updateResult)) {
          throw new InternalServerErrorException(updateResult.error.message);
        }

        const versionCount = await this.versionHistoryService.countVersions(
          ArtefactsService.ENTITY_TYPE,
          artefactDoc._id,
          session
        );

        return this.buildArtefactDto(
          updateResult.value._id,
          updateResult.value,
          session,
          versionCount
        );
      },
      { context: 'restoreVersion' }
    );
  }

  private async buildArtefactDto(
    artefactId: Types.ObjectId,
    artefactDoc: ArtefactSchema,
    session?: ClientSession,
    versionCount?: number
  ): Promise<Artefact> {
    const [conversationResult, pdpGoalsResult] = await Promise.all([
      this.conversationsRepository.findActiveConversationByArtefact(artefactId, session),
      this.pdpGoalsRepository.findByArtefactId(artefactId, session),
    ]);

    if (isErr(conversationResult) || !conversationResult.value) {
      throw new InternalServerErrorException('Conversation not found');
    }
    if (isErr(pdpGoalsResult)) {
      throw new InternalServerErrorException(pdpGoalsResult.error.message);
    }

    return toArtefactDto(
      artefactDoc,
      conversationResult.value,
      pdpGoalsResult.value,
      versionCount ?? 0
    );
  }

  async duplicateToReview(userId: string, xid: string): Promise<Artefact> {
    const findResult = await this.artefactsRepository.findByXid(xid, new Types.ObjectId(userId));

    if (isErr(findResult)) throw new InternalServerErrorException(findResult.error.message);
    if (!findResult.value) throw new NotFoundException('Artefact not found');

    const sourceArtefact = findResult.value;

    if (sourceArtefact.status !== ArtefactStatus.COMPLETED) {
      throw new BadRequestException('Only COMPLETED artefacts can be cloned');
    }

    return this.transactionService.withTransaction(
      async (session) => {
        // Fetch source conversation and messages
        const convResult = await this.conversationsRepository.findActiveConversationByArtefact(
          sourceArtefact._id,
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
            title: `Copy of ${sourceArtefact.title}`,
          },
          session
        );
        if (isErr(newArtefactResult))
          throw new InternalServerErrorException(newArtefactResult.error.message);

        const newArtefact = newArtefactResult.value;

        // Update new artefact to IN_REVIEW with cloned content
        const updateResult = await this.artefactsRepository.updateArtefactById(
          newArtefact._id,
          {
            status: ArtefactStatus.IN_REVIEW,
            artefactType: sourceArtefact.artefactType ?? null,
            reflection: sourceArtefact.reflection ?? null,
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
            title: `Copy of ${convResult.value.title}`,
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
      this.conversationsRepository.findActiveConversationsByArtefacts(artefactIds),
      this.pdpGoalsRepository.findByArtefactIds(artefactIds),
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
}
