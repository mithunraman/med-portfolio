import type { Artefact, ArtefactListResponse } from '@acme/shared';
import { Specialty } from '@acme/shared';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { format } from 'date-fns';
import { Types } from 'mongoose';
import { isErr } from '../common/utils/result.util';
import { isNotNull } from '../common/utils/type-guards.util';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { TransactionService } from '../database';
import {
  IPdpActionsRepository,
  PDP_ACTIONS_REPOSITORY,
} from '../pdp-actions/pdp-actions.repository.interface';
import { ARTEFACTS_REPOSITORY, IArtefactsRepository } from './artefacts.repository.interface';
import { CreateArtefactDto, ListArtefactsDto } from './dto';
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
    @Inject(PDP_ACTIONS_REPOSITORY)
    private readonly pdpActionsRepository: IPdpActionsRepository,
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

    const [conversationsResult, pdpActionsResult] = await Promise.all([
      this.conversationsRepository.findActiveConversationsByArtefacts(artefactIds),
      this.pdpActionsRepository.findByArtefactIds(artefactIds),
    ]);

    if (isErr(conversationsResult)) {
      throw new InternalServerErrorException(conversationsResult.error.message);
    }
    if (isErr(pdpActionsResult)) {
      throw new InternalServerErrorException(pdpActionsResult.error.message);
    }

    const conversationMap = conversationsResult.value;
    const pdpActionsMap = pdpActionsResult.value;

    const artefactsWithConversations = artefacts
      .map((artefact) => {
        const conversation = conversationMap.get(artefact._id.toString());
        if (!conversation) {
          return null;
        }
        const pdpActions = pdpActionsMap.get(artefact._id.toString()) || [];
        return toArtefactDto(artefact, conversation, pdpActions);
      })
      .filter(isNotNull);

    return {
      artefacts: artefactsWithConversations,
      nextCursor,
      limit,
    };
  }
}
