import type {
  Artefact,
  ArtefactListResponse,
  FinaliseArtefactRequest,
  UpdateArtefactStatusRequest,
} from '@acme/shared';
import { ArtefactStatus, PdpGoalStatus, Specialty } from '@acme/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { format } from 'date-fns';
import { ClientSession, Types } from 'mongoose';
import { isErr } from '../common/utils/result.util';
import { isNotNull } from '../common/utils/type-guards.util';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { TransactionService } from '../database';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
  UpdatePdpGoalActionData,
} from '../pdp-goals/pdp-goals.repository.interface';
import { ARTEFACTS_REPOSITORY, IArtefactsRepository } from './artefacts.repository.interface';
import { CreateArtefactDto, ListArtefactsDto } from './dto';
import type { Artefact as ArtefactSchema } from './schemas/artefact.schema';
import { toArtefactDto } from './mappers/artefact.mapper';
import { createInternalArtefactId } from './utils/artefact-id.util';

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
    private readonly transactionService: TransactionService
  ) {}

  async createArtefact(userId: string, dto: CreateArtefactDto): Promise<Artefact> {
    const artefactId = createInternalArtefactId(userId, dto.artefactId);

    return this.transactionService.withTransaction(
      async (session) => {
        // Create artefact
        const defaultTitle = generateDefaultTitle();

        const artefactResult = await this.artefactsRepository.upsertArtefact(
          {
            artefactId,
            userId: new Types.ObjectId(userId),
            specialty: Specialty.GP, // Hardcoded for now
            title: defaultTitle,
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
      new Types.ObjectId(userId),
    );

    if (isErr(artefactResult)) {
      throw new InternalServerErrorException(artefactResult.error.message);
    }

    if (!artefactResult.value) {
      throw new NotFoundException('Artefact not found');
    }

    const artefact = artefactResult.value;

    const [conversationResult, pdpGoalsResult] = await Promise.all([
      this.conversationsRepository.findActiveConversationByArtefact(artefact._id),
      this.pdpGoalsRepository.findByArtefactId(artefact._id),
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

    return toArtefactDto(artefact, conversationResult.value, pdpGoalsResult.value);
  }

  async updateArtefactStatus(
    userId: string,
    xid: string,
    dto: UpdateArtefactStatusRequest
  ): Promise<Artefact> {
    const findResult = await this.artefactsRepository.findByXid(
      xid,
      new Types.ObjectId(userId),
    );

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
    const updateResult = await this.artefactsRepository.updateArtefactById(
      artefactDoc._id,
      { status: dto.status },
    );

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
    const findResult = await this.artefactsRepository.findByXid(
      xid,
      new Types.ObjectId(userId),
    );

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

    return this.transactionService.withTransaction(
      async (session) => {
        // 1. Set artefact to COMPLETED
        const updateResult = await this.artefactsRepository.updateArtefactById(
          artefactDoc._id,
          { status: ArtefactStatus.COMPLETED },
          session
        );

        if (isErr(updateResult)) {
          throw new InternalServerErrorException(updateResult.error.message);
        }

        // 2. Apply PDP goal selections (business logic)
        for (const selection of dto.pdpGoalSelections) {
          if (selection.selected) {
            // Selected goal → ACTIVE with review date, per-action status based on selection
            const actionUpdates: UpdatePdpGoalActionData[] = (selection.actions ?? []).map(
              (a) => ({
                actionXid: a.actionId,
                status: a.selected ? PdpGoalStatus.STARTED : PdpGoalStatus.ARCHIVED,
              })
            );

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
  }

  private async archiveArtefact(
    artefactDoc: ArtefactSchema,
    archiveActivePdpGoals: boolean
  ): Promise<Artefact> {
    return this.transactionService.withTransaction(
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
  }

  private async buildArtefactDto(
    artefactId: Types.ObjectId,
    artefactDoc: ArtefactSchema,
    session?: ClientSession
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

    return toArtefactDto(artefactDoc, conversationResult.value, pdpGoalsResult.value);
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
}
