import { MessageProcessingStatus, MessageRole, MessageType, Specialty } from '@acme/shared';
import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { getSpecialtyConfig } from '../../specialties/specialty.registry';
import { GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('PresentClassificationNode');

interface ClassificationOption {
  code: string;
  label: string;
  confidence: number;
  reasoning: string;
}

interface ClassificationResumeValue {
  entryType: string;
}

/**
 * Factory that creates the present_classification node with injected dependencies.
 *
 * Always presents the LLM's classification suggestions to the user for confirmation.
 * Builds an options list from the top suggestion + alternatives, sends it as an
 * ASSISTANT message with structured metadata, then pauses via interrupt().
 *
 * On resume, validates the user's chosen entry type against the specialty config.
 * Invalid selections fall back to the LLM's original suggestion.
 */
export function createPresentClassificationNode(deps: GraphDeps) {
  return async function presentClassificationNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    logger.log(`Presenting classification for conversation ${state.conversationId}`);

    const specialty = Number(state.specialty) as Specialty;
    const config = getSpecialtyConfig(specialty);
    const validCodes = new Set(config.entryTypes.map((et) => et.code));

    // Build options from primary suggestion + alternatives
    const options: ClassificationOption[] = [];

    if (state.entryType) {
      const entryDef = config.entryTypes.find((et) => et.code === state.entryType);
      options.push({
        code: state.entryType,
        label: entryDef?.label ?? state.entryType,
        confidence: state.classificationConfidence,
        reasoning: state.classificationReasoning,
      });
    }

    for (const alt of state.alternatives) {
      if (alt.entryType === state.entryType) continue; // skip duplicate

      const entryDef = config.entryTypes.find((et) => et.code === alt.entryType);
      options.push({
        code: alt.entryType,
        label: entryDef?.label ?? alt.entryType,
        confidence: alt.confidence,
        reasoning: alt.reasoning,
      });
    }

    // ── Idempotency guard ──
    // When the node re-executes after interrupt() resumes, we must not send
    // a duplicate ASSISTANT message. However, in the re-classification loop
    // (ask_followup → gather_context → classify → present_classification),
    // we DO want a fresh prompt. The guard checks message ordering: only skip
    // if the classification message is more recent than the latest *content*
    // user message. Audit messages (metadata.type set) are excluded — they're
    // system-generated records of structured actions, not real user input.
    const conversationId = new Types.ObjectId(state.conversationId);
    let alreadySent = false;

    const messagesResult = await deps.conversationsRepository.listMessages({
      conversation: conversationId,
      limit: 10,
    });

    if (messagesResult.ok) {
      const messages = messagesResult.value.messages; // newest first
      const latestContentMsg = messages.find(
        (m) => m.role === MessageRole.USER && !(m as any).metadata?.type
      );
      const latestClassification = messages.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m as any).metadata?.type === 'classification_options'
      );

      if (latestClassification && latestContentMsg) {
        const classIdx = messages.indexOf(latestClassification);
        const userIdx = messages.indexOf(latestContentMsg);
        // Lower index = more recent (newest-first ordering)
        alreadySent = classIdx < userIdx;
      }
    }

    if (!alreadySent) {
      // Build a human-readable message as content fallback
      const optionLines = options
        .map((o, i) => `${i + 1}. **${o.label}** (${Math.round(o.confidence * 100)}% confidence)`)
        .join('\n');

      const content =
        `Based on your input, I think this is most likely:\n\n${optionLines}\n\n` +
        `Please select the entry type, or choose a different one.`;

      const metadata = {
        type: 'classification_options' as const,
        options,
        suggestedEntryType: state.entryType,
        reasoning: state.classificationReasoning,
      };

      const createResult = await deps.conversationsRepository.createMessage({
        conversation: conversationId,
        userId: new Types.ObjectId(state.userId),
        role: MessageRole.ASSISTANT,
        messageType: MessageType.TEXT,
        rawContent: content,
        content,
        processingStatus: MessageProcessingStatus.COMPLETE,
        metadata,
      });

      if (!createResult.ok) {
        logger.error(`Failed to send classification options: ${createResult.error.message}`);
      }
    }

    // Pause the graph — returns the resume value on second execution
    const resumeValue = interrupt({ type: 'classification', options }) as ClassificationResumeValue;

    // ── Validate resume value ──
    const selectedType = resumeValue?.entryType;

    if (selectedType && validCodes.has(selectedType)) {
      logger.log(`User confirmed entry type: ${selectedType}`);
      return {
        entryType: selectedType,
        classificationConfidence: 1.0,
        classificationSource: 'USER_CONFIRMED',
      };
    }

    // Invalid or missing selection — keep LLM's suggestion
    logger.warn(
      `Invalid resume value (entryType: ${selectedType}), keeping LLM suggestion: ${state.entryType}`
    );
    return {
      classificationSource: 'USER_CONFIRMED',
    };
  };
}
