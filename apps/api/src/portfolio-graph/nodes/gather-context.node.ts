import { MessageProcessingStatus, MessageRole } from '@acme/shared';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('GatherContextNode');

/**
 * Factory that creates the gather_context node with injected dependencies.
 *
 * The node collects all COMPLETE user messages in the conversation and
 * concatenates them into a single transcript string. It re-runs on every
 * graph entry (including after clarification / follow-up responses), so the
 * transcript always reflects the latest set of messages.
 *
 * Messages are joined with a `---` separator so downstream nodes (classify,
 * check_completeness) can distinguish between separate user utterances.
 */
export function createGatherContextNode(deps: GraphDeps) {
  return async function gatherContextNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    logger.log(`Gathering context for conversation ${state.conversationId}`);

    const conversationId = new Types.ObjectId(state.conversationId);

    // Fetch messages — listMessages returns newest-first, limited to 200
    // (a single conversation won't realistically exceed this).
    const result = await deps.conversationsRepository.listMessages({
      conversation: conversationId,
      limit: 200,
    });

    if (!result.ok) {
      logger.error(`Failed to fetch messages: ${result.error.message}`);
      return { error: `gather_context: ${result.error.message}` };
    }

    // Filter to completed user messages only.
    // Skips ASSISTANT messages (system-generated follow-ups) and any
    // messages still being processed (PENDING, TRANSCRIBING, CLEANING).
    const userMessages = result.value.messages.filter(
      (msg) =>
        msg.role === MessageRole.USER &&
        msg.processingStatus === MessageProcessingStatus.COMPLETE &&
        msg.content
    );

    // Reverse to chronological order (repo returns newest-first).
    userMessages.reverse();

    const fullTranscript = userMessages.map((msg) => (msg.content ?? '').trim()).join('\n\n---\n\n');

    const messageCount = userMessages.length;

    logger.log(
      `Gathered ${messageCount} messages, transcript length: ${fullTranscript.length} chars`
    );

    return { fullTranscript, messageCount };
  };
}
