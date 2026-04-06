import {
  AnalysisRunStatus,
  ConversationStatus,
  MessageRole,
  type ActionState,
  type ConversationContext,
  type ConversationPhase,
  type QuestionType,
  type ThinkingStep,
} from '@acme/shared';
import { Inject, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../analysis-runs/analysis-runs.service';
import type { AnalysisRun } from '../analysis-runs/schemas/analysis-run.schema';
import { isErr } from '../common/utils/result.util';
import { OutboxService } from '../outbox/outbox.service';
import {
  CONVERSATIONS_REPOSITORY,
  type IConversationsRepository,
} from './conversations.repository.interface';

const allowed = (): ActionState => ({ allowed: true });
const denied = (code: string, reason: string): ActionState => ({
  allowed: false,
  code,
  reason,
});

@Injectable()
export class ConversationContextService {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    private readonly analysisRunsService: AnalysisRunsService,
    private readonly outboxService: OutboxService
  ) {}

  async computeContext(
    conversationOid: Types.ObjectId,
    conversationStatus: ConversationStatus,
    artefactId: string,
  ): Promise<ConversationContext> {
    if (conversationStatus === ConversationStatus.CLOSED) {
      return {
        artefactId,
        phase: 'closed',
        actions: {
          sendMessage: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
          sendAudio: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
          startAnalysis: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
          resumeAnalysis: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
        },
      };
    }

    const latestRun = await this.analysisRunsService.findLatestRun(conversationOid);

    // Check for queued outbox work only when the run is AWAITING_INPUT —
    // a pending outbox entry means the graph is about to resume, so the
    // phase should be 'analysing' rather than 'awaiting_input'.
    let hasPendingWork = false;
    if (latestRun?.status === AnalysisRunStatus.AWAITING_INPUT) {
      hasPendingWork = await this.outboxService.hasPendingForConversation(
        conversationOid.toString()
      );
    }

    const phase = this.derivePhase(latestRun, hasPendingWork);

    // Query message state when needed for action gating
    let hasProcessing = false;
    let hasComplete = false;
    let lastMessageIsUser = false;

    const isFreeTextAwait =
      phase === 'awaiting_input' && latestRun?.currentQuestion?.questionType === 'free_text';

    if (phase === 'composing') {
      const [processingResult, completeResult] = await Promise.all([
        this.conversationsRepository.hasProcessingMessages(conversationOid),
        this.conversationsRepository.hasCompleteMessages(conversationOid),
      ]);
      hasProcessing = !isErr(processingResult) && processingResult.value;
      hasComplete = !isErr(completeResult) && completeResult.value;
    } else if (isFreeTextAwait) {
      const [processingResult, lastRoleResult] = await Promise.all([
        this.conversationsRepository.hasProcessingMessages(conversationOid),
        this.conversationsRepository.getLastMessageRole(conversationOid),
      ]);
      hasProcessing = !isErr(processingResult) && processingResult.value;
      lastMessageIsUser = !isErr(lastRoleResult) && lastRoleResult.value === MessageRole.USER;
    }

    const actions = this.buildActions(
      phase,
      latestRun,
      hasProcessing,
      hasComplete,
      lastMessageIsUser
    );
    const activeQuestion = await this.buildActiveQuestion(latestRun);
    const analysisRun = latestRun
      ? {
          id: latestRun.xid,
          status: latestRun.status,
          thinkingReason: latestRun.currentStep as ThinkingStep | null,
        }
      : undefined;

    return { artefactId, phase, actions, activeQuestion, analysisRun };
  }

  private derivePhase(
    latestRun: AnalysisRun | null,
    hasPendingWork = false
  ): ConversationPhase {
    if (!latestRun) return 'composing';

    switch (latestRun.status) {
      case AnalysisRunStatus.PENDING:
      case AnalysisRunStatus.RUNNING:
        return 'analysing';
      case AnalysisRunStatus.AWAITING_INPUT:
        return hasPendingWork ? 'analysing' : 'awaiting_input';
      case AnalysisRunStatus.COMPLETED:
        return 'completed';
      case AnalysisRunStatus.FAILED:
        return 'composing';
      default:
        return 'composing';
    }
  }

  private buildActions(
    phase: ConversationPhase,
    latestRun: AnalysisRun | null,
    hasProcessing: boolean,
    hasComplete: boolean,
    lastMessageIsUser: boolean
  ) {
    switch (phase) {
      case 'composing':
        return {
          sendMessage: allowed(),
          sendAudio: allowed(),
          startAnalysis: hasProcessing
            ? denied('MESSAGES_PROCESSING', 'Messages are still being processed.')
            : !hasComplete
              ? denied('NO_MESSAGES', 'Send at least one message before starting analysis.')
              : latestRun && latestRun.status !== AnalysisRunStatus.FAILED
                ? denied('ANALYSIS_ALREADY_STARTED', 'Analysis already started.')
                : allowed(),
          resumeAnalysis: denied('NO_ACTIVE_QUESTION', 'No analysis to resume.'),
        };

      case 'analysing':
        return {
          sendMessage: denied('ANALYSIS_RUNNING', 'Analysis is in progress.'),
          sendAudio: denied('ANALYSIS_RUNNING', 'Analysis is in progress.'),
          startAnalysis: denied('ANALYSIS_RUNNING', 'Analysis is already in progress.'),
          resumeAnalysis: denied('ANALYSIS_RUNNING', 'Analysis is running, not paused.'),
        };

      case 'awaiting_input': {
        const questionType = latestRun?.currentQuestion?.questionType;
        const isFreeText = questionType === 'free_text';
        return {
          sendMessage: isFreeText
            ? allowed()
            : denied('STRUCTURED_INPUT_REQUIRED', 'Please respond using the provided options.'),
          sendAudio: isFreeText
            ? allowed()
            : denied('STRUCTURED_INPUT_REQUIRED', 'Please respond using the provided options.'),
          startAnalysis: denied('ANALYSIS_RUNNING', 'Analysis is already in progress.'),
          resumeAnalysis: isFreeText
            ? hasProcessing
              ? denied('MESSAGES_PROCESSING', 'Messages are still being processed.')
              : !lastMessageIsUser
                ? denied('NO_USER_RESPONSE', 'Send a message before continuing.')
                : allowed()
            : allowed(),
        };
      }

      case 'completed':
        return {
          sendMessage: denied('ANALYSIS_COMPLETE', 'Analysis is complete.'),
          sendAudio: denied('ANALYSIS_COMPLETE', 'Analysis is complete.'),
          startAnalysis: denied('ANALYSIS_COMPLETE', 'Analysis is already complete.'),
          resumeAnalysis: denied('ANALYSIS_COMPLETE', 'Analysis is already complete.'),
        };

      case 'closed':
        return {
          sendMessage: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
          sendAudio: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
          startAnalysis: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
          resumeAnalysis: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
        };
    }
  }

  private async buildActiveQuestion(
    latestRun: AnalysisRun | null
  ): Promise<{ messageId: string; questionType: QuestionType } | undefined> {
    if (!latestRun?.currentQuestion) return undefined;
    if (latestRun.status !== AnalysisRunStatus.AWAITING_INPUT) return undefined;
    if (!latestRun.currentQuestion.questionType) return undefined;

    // Resolve xid — the mobile client uses xid as message id
    const msgResult = await this.conversationsRepository.findMessageById(
      latestRun.currentQuestion.messageId
    );
    if (isErr(msgResult) || !msgResult.value) return undefined;

    return {
      messageId: msgResult.value.xid,
      questionType: latestRun.currentQuestion.questionType as QuestionType,
    };
  }
}
