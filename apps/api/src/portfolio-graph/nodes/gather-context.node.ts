import { MessageStatus, MessageRole } from '@acme/shared';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';
import { buildTranscript } from './transcript-format.util';

const logger = new Logger('GatherContextNode');

/**
 * Factory that creates the gather_context node with injected dependencies.
 *
 * The node collects all messages in the conversation and builds a
 * conversation-aware transcript that preserves Q&A pairs. ASSISTANT
 * follow-up questions are included so downstream nodes (classify,
 * check_completeness, reflect) can see which question each user
 * answer was responding to.
 *
 * It re-runs on every graph entry (including after follow-up responses),
 * so the transcript always reflects the latest set of messages.
 */
export function createGatherContextNode(deps: GraphDeps) {
  return async function gatherContextNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, { conversationId: state.conversationId, step: 'gather_context' });
    const cid = state.conversationId;
    logger.log(`[${cid}] Gathering context`);

    const conversationId = new Types.ObjectId(state.conversationId);

    // Fetch all messages — conversations are <50 messages.
    // SYSTEM READ: runs inside the graph off a server-set state.conversationId
    // (never request input); the conversation's owner is verified upstream before
    // the run starts. Unscoped by userId by design — see CLAUDE.md's ownership-
    // predicate carve-out.
    const result = await deps.conversationsRepository.listMessages({
      conversation: conversationId,
    });

    if (!result.ok) {
      throw new Error(`[${cid}] Failed to fetch messages: ${result.error.message}`);
    }

    // Include both USER and ASSISTANT messages to preserve Q&A context.
    // Skips messages still being processed (PENDING, TRANSCRIBING, CLEANING).
    const allMessages = result.value.messages.filter(
      (msg) =>
        msg.status === MessageStatus.COMPLETE &&
        (msg.role === MessageRole.USER || msg.role === MessageRole.ASSISTANT)
    );

    // Reverse to chronological order (repo returns newest-first).
    allMessages.reverse();

    // Role-prefix each turn (TRAINEE: / AI asked:) so downstream graders can tell
    // trainee evidence from the assistant's own prompts. See transcript-format.util.
    const fullTranscript = buildTranscript(allMessages);
    const userMessageCount = allMessages.filter(
      (msg) => msg.role === MessageRole.USER && msg.content
    ).length;

    logger.log(
      `[${cid}] Gathered ${userMessageCount} user messages (${allMessages.length} total), ` +
        `transcript length: ${fullTranscript.length} chars`
    );

    return { fullTranscript };
  };
}
