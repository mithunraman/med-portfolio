import {
  AnalysisRunStatus,
  ConversationStatus,
  MessageRole,
  RESTARTABLE_RUN_STATUSES,
  type ActionState,
  type ConversationContext,
  type ConversationNotice,
  type ConversationPhase,
  type QuestionType,
} from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../analysis-runs/analysis-runs.service';
import type { AnalysisRun } from '../analysis-runs/schemas/analysis-run.schema';
import { isErr } from '../common/utils/result.util';
import { OutboxService } from '../outbox/outbox.service';
import { resolveThinkingLabel } from '../portfolio-graph/thinking-labels';
import { resolveEntryTypeLabel } from '../specialties/specialty.registry';
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

/**
 * Server-owned copy for a conversation that has fallen back to 'composing'
 * through a restartable terminal run. Lives here, not on the client, so wording
 * can change without a mobile release — the same rule `thinkingLabel` follows.
 *
 * Both say the same operational thing ("start again"); they differ in whether
 * anything went wrong, which is why the codes are distinct.
 *
 * The key set IS the "which statuses get a notice" rule — `buildNotice` reads it
 * directly rather than re-checking RESTARTABLE_RUN_STATUSES. `Partial` is what
 * makes a miss type as `undefined`; a bare `Record` would claim every lookup
 * succeeds (`noUncheckedIndexedAccess` is off) and make the `?? null` there look
 * unreachable while it is in fact load-bearing.
 */
const RESTART_NOTICES: Partial<Record<AnalysisRunStatus, ConversationNotice>> = {
  [AnalysisRunStatus.EXPIRED]: {
    code: 'ANALYSIS_EXPIRED',
    text: 'This analysis paused for too long and has expired. Your messages are saved — start again to pick it back up.',
  },
  [AnalysisRunStatus.FAILED]: {
    code: 'ANALYSIS_FAILED',
    text: 'Something went wrong with this analysis. Your messages are saved — try again.',
  },
};

@Injectable()
export class ConversationContextService {
  private readonly logger = new Logger(ConversationContextService.name);

  constructor(
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    private readonly analysisRunsService: AnalysisRunsService,
    private readonly outboxService: OutboxService
  ) {}

  async computeContext(
    conversationOid: Types.ObjectId,
    conversationStatus: ConversationStatus,
  ): Promise<ConversationContext> {
    // Resolve the artefact ref (xid + status) once. The client uses
    // artefactStatus (with message facts) to decide edit/delete availability.
    // Fail closed: if the ref can't be resolved (DB error or missing artefact),
    // leave artefactStatus null so the client withholds edit/delete rather than
    // offering an action the server would reject.
    const refResult =
      await this.conversationsRepository.findArtefactRefByConversationId(conversationOid);
    if (isErr(refResult)) {
      this.logger.warn(
        `[computeContext] failed to resolve artefact ref for ${conversationOid}: ${refResult.error.message}`
      );
    }
    const ref = !isErr(refResult) ? refResult.value : null;
    const artefactId = ref?.xid ?? '';
    const artefactStatus = ref?.status ?? null;
    // Entry type + label travel together. The label is resolved here rather than in
    // the repository: persistence returns stored values, the domain layer maps them
    // to presentation — the same split `toArtefactDto` uses, via the same resolver,
    // so the retired-code fallback cannot drift between the two.
    const artefactType = ref?.artefactType ?? null;
    const artefactTypeLabel = ref ? resolveEntryTypeLabel(ref.specialty, ref.artefactType) : null;

    if (conversationStatus === ConversationStatus.CLOSED) {
      return {
        artefactId,
        artefactStatus,
        artefactType,
        artefactTypeLabel,
        phase: 'closed',
        actions: {
          sendMessage: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
          sendAudio: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
          startAnalysis: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
          resumeAnalysis: denied('CONVERSATION_CLOSED', 'This conversation is closed.'),
        },
        notice: null,
      };
    }

    const latestRun = await this.analysisRunsService.findLatestRun(conversationOid);
    this.logger.debug(`[computeContext] conversationId=${conversationOid} latestRun=${latestRun ? JSON.stringify({ status: latestRun.status, xid: latestRun.xid }) : 'null'}`);

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
      this.logger.debug(`[computeContext] composing checks: hasProcessing=${hasProcessing} hasComplete=${hasComplete}`);
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
          thinkingLabel: resolveThinkingLabel(latestRun.currentStep),
        }
      : undefined;

    return {
      artefactId,
      artefactStatus,
      artefactType,
      artefactTypeLabel,
      phase,
      actions,
      activeQuestion,
      analysisRun,
      notice: this.buildNotice(latestRun),
    };
  }

  /**
   * Explain a conversation that is back at 'composing' because its last run
   * ended in a restartable terminal state. Null in every other case — a run that
   * merely finished successfully has nothing to explain, and notifying on a
   * non-event trains people to ignore the notices that matter.
   */
  private buildNotice(latestRun: AnalysisRun | null): ConversationNotice | null {
    return latestRun ? (RESTART_NOTICES[latestRun.status] ?? null) : null;
  }

  /**
   * Exhaustive over AnalysisRunStatus, with no `default` — deliberately.
   *
   * Returning 'composing' hands the trainee a composer, and `buildActions` then
   * decides whether the start action behind it actually works by testing
   * RESTARTABLE_RUN_STATUSES. A status that reaches 'composing' without being in
   * that set produces an open composer whose start button is denied
   * 'ANALYSIS_ALREADY_STARTED' — a dead end that looks operational, and the bug
   * EXPIRED caused when it was first added.
   *
   * A `default` arm makes that the silent outcome for every status added later.
   * Losing it means a new enum member fails the build here until someone decides
   * which phase it belongs in, and — if 'composing' — whether it is restartable.
   * That is why FAILED/EXPIRED are spelled out below despite returning what a
   * catch-all would have: without them the check does not hold.
   */
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
      case AnalysisRunStatus.EXPIRED:
        return 'composing';
      // Tombstoned by account/conversation deletion. `findLatestRun` does not
      // filter it out, so it is reachable in principle; in practice the
      // conversation is gone by then and this never renders.
      case AnalysisRunStatus.DELETED:
        return 'composing';
      default: {
        // Unreachable per the type system; kept because the database can still
        // hold a value outside the enum. Falls back rather than throwing — this
        // renders the conversation screen, and a 500 here is worse than a
        // composer.
        const unhandled: never = latestRun.status;
        void unhandled;
        return 'composing';
      }
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
      case 'composing': {
        // A restartable run (failed / expired) must NOT deny the start action.
        // Testing one enum value here instead of the set is what leaves an
        // expired run in a phase that opens the composer while refusing to
        // start — a dead end that looks operational.
        const startDeniedReason = hasProcessing
          ? 'MESSAGES_PROCESSING'
          : !hasComplete
            ? 'NO_MESSAGES'
            : latestRun && !RESTARTABLE_RUN_STATUSES.has(latestRun.status)
              ? 'ANALYSIS_ALREADY_STARTED'
              : null;
        this.logger.debug(`[buildActions] composing startAnalysis: ${startDeniedReason ?? 'allowed'} (hasProcessing=${hasProcessing} hasComplete=${hasComplete} latestRunStatus=${latestRun?.status ?? 'none'})`);
        return {
          sendMessage: allowed(),
          sendAudio: allowed(),
          startAnalysis: startDeniedReason
            ? denied(
                startDeniedReason,
                startDeniedReason === 'MESSAGES_PROCESSING'
                  ? 'Messages are still being processed.'
                  : startDeniedReason === 'NO_MESSAGES'
                    ? 'Send at least one message before starting analysis.'
                    : 'Analysis already started.',
              )
            : allowed(),
          resumeAnalysis: denied('NO_ACTIVE_QUESTION', 'No analysis to resume.'),
        };
      }

      case 'analysing':
        return {
          sendMessage: denied('ANALYSIS_RUNNING', 'Analysis is in progress.'),
          sendAudio: denied('ANALYSIS_RUNNING', 'Analysis is in progress.'),
          startAnalysis: denied('ANALYSIS_RUNNING', 'Analysis is already in progress.'),
          resumeAnalysis: denied('ANALYSIS_RUNNING', 'Analysis is running, not paused.'),
        };

      case 'awaiting_input': {
        const questionType = latestRun?.currentQuestion?.questionType;

        if (questionType === 'terminal') {
          return {
            sendMessage: denied('ANALYSIS_TERMINAL', 'Analysis has ended. Start a new conversation.'),
            sendAudio: denied('ANALYSIS_TERMINAL', 'Analysis has ended. Start a new conversation.'),
            startAnalysis: denied('ANALYSIS_TERMINAL', 'Analysis has ended.'),
            resumeAnalysis: denied('ANALYSIS_TERMINAL', 'Analysis has ended. Start a new conversation.'),
          };
        }

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
