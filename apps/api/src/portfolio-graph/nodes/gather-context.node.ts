import {
  type FreeTextQuestion,
  MessageProcessingStatus,
  MessageRole,
  type Question,
} from '@acme/shared';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('GatherContextNode');

/**
 * Format an ASSISTANT follow-up question message as a Q&A prompt header.
 * For free_text questions, extracts the individual question texts so the
 * downstream reflect node knows which section each subsequent user answer targets.
 */
function formatAssistantQuestion(question: Question): string {
  if (question.questionType === 'free_text') {
    const ftq = question as FreeTextQuestion;
    const questions = ftq.prompts.map((p) => p.text).join('\n');
    return `AI asked:\n${questions}`;
  }
  // single_select / multi_select are classification/capability interrupts —
  // not conversational follow-ups, so use a generic label.
  return 'AI asked a clarification question.';
}

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

    // Fetch all messages — conversations are <50 messages
    const result = await deps.conversationsRepository.listMessages({
      conversation: conversationId,
    });

    if (!result.ok) {
      logger.error(`[${cid}] Failed to fetch messages: ${result.error.message}`);
      return { error: `gather_context: ${result.error.message}` };
    }

    // Include both USER and ASSISTANT messages to preserve Q&A context.
    // Skips messages still being processed (PENDING, TRANSCRIBING, CLEANING).
    const allMessages = result.value.messages.filter(
      (msg) =>
        msg.processingStatus === MessageProcessingStatus.COMPLETE &&
        (msg.role === MessageRole.USER || msg.role === MessageRole.ASSISTANT)
    );

    // Reverse to chronological order (repo returns newest-first).
    allMessages.reverse();

    const transcriptParts: string[] = [];
    let userMessageCount = 0;

    for (const msg of allMessages) {
      if (msg.role === MessageRole.USER && msg.content) {
        transcriptParts.push(msg.content.trim());
        userMessageCount++;
      } else if (msg.role === MessageRole.ASSISTANT && msg.question) {
        transcriptParts.push(formatAssistantQuestion(msg.question));
      }
      // Skip ASSISTANT messages without questions (e.g. thinking status messages)
    }

    const fullTranscript = transcriptParts.join('\n\n---\n\n');

    logger.log(
      `[${cid}] Gathered ${userMessageCount} user messages (${allMessages.length} total), ` +
        `transcript length: ${fullTranscript.length} chars`
    );

    return { fullTranscript, messageCount: userMessageCount };
  };
}
