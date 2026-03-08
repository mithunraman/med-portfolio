import {
  AnalysisRunStatus,
  ArtefactStatus,
  MessageProcessingStatus,
  MessageRole,
  MessageType,
  type FreeTextQuestion,
  type MultiSelectQuestion,
  type SingleSelectQuestion,
} from '@acme/shared';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  createCompleteUserMessage,
  createPendingUserMessage,
  createTestArtefact,
  createTestConversation,
  createTestMessage,
  getMessagesForConversation,
  getPdpGoalsForArtefact,
  getTestArtefact,
  markMessageComplete,
  TEST_USER_ID_STR,
} from './helpers/factories';
import {
  allCoveredResponse,
  classifyResponse,
  followupQuestionsResponse,
  generatePdpResponse,
  reflectResponse,
  SequentialLLMMock,
  someMissingResponse,
  tagCapabilitiesResponse,
} from './helpers/llm-mock';
import {
  cleanupDatabase,
  createTestHarness,
  destroyTestHarness,
  TestHarness,
} from './helpers/test-setup';

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Type-narrowing assertion — fails the test if value is nullish. */
function assertDefined<T>(value: T | null | undefined): asserts value is T {
  expect(value).toBeDefined();
}

/**
 * Stable state returned by waitForRunStable.
 * Maps to AnalysisRun status: AWAITING_INPUT (with node) or COMPLETED.
 */
type StableRunState =
  | { status: 'awaiting_input'; node: string }
  | { status: 'completed' };

/**
 * Poll AnalysisRun status until it reaches a stable state (AWAITING_INPUT or COMPLETED).
 *
 * When `afterResume` is true, the function first waits until the run leaves
 * the current AWAITING_INPUT state (handler transitions it to RUNNING),
 * then waits until it stabilizes again. This handles the fire-and-forget pattern
 * where the run may still show the old AWAITING_INPUT state momentarily after resume.
 *
 * After finding a stable state, waits an additional `settleMs` and re-checks
 * to guard against transient states during outbox handler execution.
 */
async function waitForRunStable(
  harness: TestHarness,
  conversationOid: Types.ObjectId,
  afterResume = false,
  timeoutMs = 10000,
  pollIntervalMs = 100,
  settleMs = 300
): Promise<StableRunState> {
  const deadline = Date.now() + timeoutMs;

  if (afterResume) {
    // Capture the current run state so we know what to wait past
    const initialRun = await harness.analysisRunsService.findLatestRun(conversationOid);
    const initialNode =
      initialRun?.status === AnalysisRunStatus.AWAITING_INPUT
        ? initialRun.currentQuestion?.node
        : null;

    // Phase 1: Wait until run leaves the initial AWAITING_INPUT state
    if (initialNode) {
      while (Date.now() < deadline) {
        const run = await harness.analysisRunsService.findLatestRun(conversationOid);
        if (!run) break;
        if (
          run.status !== AnalysisRunStatus.AWAITING_INPUT ||
          run.currentQuestion?.node !== initialNode
        )
          break;
        await sleep(pollIntervalMs);
      }
    }
  }

  // Phase 2: Wait for stable state (AWAITING_INPUT or COMPLETED), then confirm
  while (Date.now() < deadline) {
    const run = await harness.analysisRunsService.findLatestRun(conversationOid);
    if (!run) {
      await sleep(pollIntervalMs);
      continue;
    }

    if (
      run.status === AnalysisRunStatus.AWAITING_INPUT ||
      run.status === AnalysisRunStatus.COMPLETED
    ) {
      await sleep(settleMs);
      const confirmed = await harness.analysisRunsService.findLatestRun(conversationOid);
      if (confirmed && confirmed.status === run.status) {
        if (confirmed.status === AnalysisRunStatus.COMPLETED) {
          return { status: 'completed' };
        }
        if (
          confirmed.status === AnalysisRunStatus.AWAITING_INPUT &&
          confirmed.currentQuestion?.node
        ) {
          return { status: 'awaiting_input', node: confirmed.currentQuestion.node };
        }
      }
      // State changed during settle — keep polling
      continue;
    }

    await sleep(pollIntervalMs);
  }

  // Timeout — return whatever we have
  const run = await harness.analysisRunsService.findLatestRun(conversationOid);
  if (run?.status === AnalysisRunStatus.COMPLETED) return { status: 'completed' };
  if (run?.status === AnalysisRunStatus.AWAITING_INPUT && run.currentQuestion?.node) {
    return { status: 'awaiting_input', node: run.currentQuestion.node };
  }
  throw new Error(`Timed out waiting for stable run state. Last status: ${run?.status ?? 'no run'}`);
}

describe('Conversations Integration Tests', () => {
  let harness: TestHarness;
  let llmMock: SequentialLLMMock;

  beforeAll(async () => {
    llmMock = new SequentialLLMMock();
    harness = await createTestHarness(llmMock);
  }, 60000);

  afterAll(async () => {
    await destroyTestHarness(harness);
  });

  beforeEach(async () => {
    llmMock.reset();
    await cleanupDatabase(harness.connection);
    // Create a real artefact so the save node can update it
    await createTestArtefact();
  });

  // ════════════════════════════════════════════════════════════════
  // Group A: Happy Paths
  // ════════════════════════════════════════════════════════════════

  describe('Group A: Happy Paths', () => {
    /**
     * A1. Complete graph traversal including the follow-up loop.
     *
     * Path: start → gather_context → classify → present_classification ⏸️
     *       → (resume) → check_completeness(missing) → ask_followup ⏸️
     *       → (user answers + resume) → gather_context → check_completeness(covered)
     *       → tag_capabilities → present_capabilities ⏸️
     *       → (resume with subset) → reflect → generate_pdp → save → END
     *
     * LLM call sequence (8 calls):
     *   0: classify
     *   1: check_completeness (missing reflection)
     *   2: ask_followup (initial)
     *   3: ask_followup (replay on resume — LangGraph re-executes the node)
     *   4: check_completeness (all covered)
     *   5: tag_capabilities
     *   6: reflect
     *   7: generate_pdp
     */
    it('A1. Full pipeline — classify → follow-up loop → capabilities → reflect → PDP → save', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(
        conv._id,
        'I saw a 55-year-old patient with poorly controlled type 2 diabetes. HbA1c was 72.'
      );

      // ── Enqueue all 8 LLM responses upfront ──
      llmMock.enqueue(classifyResponse()); // 0: classify
      llmMock.enqueue(someMissingResponse(['reflection'])); // 1: check_completeness (missing)
      llmMock.enqueue(
        // 2: ask_followup (initial)
        followupQuestionsResponse([
          { sectionId: 'reflection', question: 'What did you learn from this case?' },
        ])
      );
      llmMock.enqueue(
        // 3: ask_followup (replay on resume)
        followupQuestionsResponse([
          { sectionId: 'reflection', question: 'What did you learn from this case?' },
        ])
      );
      llmMock.enqueue(allCoveredResponse()); // 4: check_completeness (all covered)
      llmMock.enqueue(tagCapabilitiesResponse()); // 5: tag_capabilities
      llmMock.enqueue(reflectResponse()); // 6: reflect
      llmMock.enqueue(generatePdpResponse()); // 7: generate_pdp

      // ── Step 1: Start analysis → classify → pause at present_classification ──
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      const status1 = await waitForRunStable(harness, conv._id);

      expect(status1).toEqual({ status: 'awaiting_input', node: 'present_classification' });
      expect(llmMock.callCount).toBe(1); // only classify ran

      // Classification options ASSISTANT message created
      const msgs1 = await getMessagesForConversation(conv._id);
      const classificationMsg = msgs1.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);
      expect(classificationMsg.processingStatus).toBe(MessageProcessingStatus.COMPLETE);
      const classificationMeta = classificationMsg.question as SingleSelectQuestion;
      expect(classificationMeta.options).toBeInstanceOf(Array);

      // ── Step 2: Resume classification → completeness(missing) → ask_followup ──
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: classificationMsg.xid,
        value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
      });
      const status2 = await waitForRunStable(harness, conv._id, true);

      expect(status2).toEqual({ status: 'awaiting_input', node: 'ask_followup' });
      expect(llmMock.callCount).toBe(3); // classify + completeness + followup

      // Classification audit message created (now USER text message)
      const msgs2 = await getMessagesForConversation(conv._id);
      const classificationAudit = msgs2.find(
        (m) =>
          m.role === MessageRole.USER &&
          m.content?.startsWith('Selected:') &&
          m.content?.includes('Clinical Case Review')
      );
      assertDefined(classificationAudit);
      expect(classificationAudit.content).toBe('Selected: Clinical Case Review');

      // Follow-up ASSISTANT message with questions
      const followupMsg = msgs2.find(
        (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'free_text'
      );
      assertDefined(followupMsg);
      const followupMeta = followupMsg.question as FreeTextQuestion;
      expect(followupMeta.prompts).toHaveLength(1);
      expect(followupMeta.prompts[0].key).toBe('reflection');
      expect(followupMeta.followUpRound).toBe(1);

      // ── Step 3: User answers follow-up → resume → completeness(covered) → tag_capabilities → present_capabilities ──
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content:
          'I learned about shared decision making in chronic disease management. I started metformin and discussed lifestyle changes.',
      });
      const msgsAfterSend = await getMessagesForConversation(conv._id);
      const lastUserMsg = msgsAfterSend.filter((m) => m.role === MessageRole.USER).pop();
      assertDefined(lastUserMsg);
      assertDefined(lastUserMsg.rawContent);
      await markMessageComplete(lastUserMsg._id, lastUserMsg.rawContent);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: followupMsg.xid,
      });
      const status3 = await waitForRunStable(harness, conv._id, true);

      expect(status3).toEqual({ status: 'awaiting_input', node: 'present_capabilities' });
      expect(llmMock.callCount).toBe(6); // +followup(replay) + completeness + tag_capabilities

      // Capability options ASSISTANT message created
      const msgs3 = await getMessagesForConversation(conv._id);
      const capabilityMsg = msgs3.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'multi_select'
      );
      assertDefined(capabilityMsg);
      expect(capabilityMsg.processingStatus).toBe(MessageProcessingStatus.COMPLETE);

      const capMeta = capabilityMsg.question as MultiSelectQuestion;
      const capOptions = capMeta.options;
      expect(capOptions).toHaveLength(2);
      expect(capOptions[0]).toMatchObject({ key: 'C-06', confidence: 0.88 });
      expect(capOptions[1]).toMatchObject({ key: 'C-08', confidence: 0.75 });

      // tag_capabilities prompt (call index 5) includes transcript and capability codes
      const tagCall = llmMock.calls[5];
      const tagSystemMsg = tagCall.messages.find((m) => m._getType() === 'system');
      assertDefined(tagSystemMsg);
      const tagSystemContent = tagSystemMsg.content as string;
      expect(tagSystemContent).toContain('C-06');
      expect(tagSystemContent).toContain('C-01');

      const tagHumanMsg = tagCall.messages.find((m) => m._getType() === 'human');
      assertDefined(tagHumanMsg);
      const tagHumanContent = tagHumanMsg.content as string;
      expect(tagHumanContent).toContain('type 2 diabetes');

      // ── Step 4: Resume capabilities (select only C-06) → reflect → generate_pdp → save → END ──
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: capabilityMsg.xid,
        value: { selectedKeys: ['C-06'] },
      });
      const finalStatus = await waitForRunStable(harness, conv._id, true);

      expect(finalStatus).toEqual({ status: 'completed' });
      expect(llmMock.callCount).toBe(8); // +reflect + generate_pdp
      llmMock.assertAllConsumed();

      // ── Final assertions: messages ──
      const allMsgs = await getMessagesForConversation(conv._id);

      // Capability selection audit message (now USER text message)
      // Note: label comes from specialty config canonical name, not the LLM mock response name
      const capabilityAudit = allMsgs.find(
        (m) =>
          m.role === MessageRole.USER &&
          m.content?.startsWith('Selected:') &&
          m.content?.includes('Decision-making and diagnosis')
      );
      assertDefined(capabilityAudit);
      expect(capabilityAudit.content).toBe('Selected: Decision-making and diagnosis');

      // reflect prompt (call index 6) includes selected capability C-06
      const reflectCall = llmMock.calls[6];
      const reflectSystemMsg = reflectCall.messages.find((m) => m._getType() === 'system');
      assertDefined(reflectSystemMsg);
      const reflectSystem = reflectSystemMsg.content as string;
      expect(reflectSystem).toContain('C-06');

      // generate_pdp prompt (call index 7) receives the reflection
      const pdpCall = llmMock.calls[7];
      const pdpHumanMsg = pdpCall.messages.find((m) => m._getType() === 'human');
      assertDefined(pdpHumanMsg);
      const pdpHuman = pdpHumanMsg.content as string;
      expect(pdpHuman).toContain('Presentation');
      expect(pdpHuman).toContain('Reflection');

      // ── Final assertions: artefact persisted to DB ──
      const artefact = await getTestArtefact();
      assertDefined(artefact);

      expect(artefact.status).toBe(ArtefactStatus.REVIEW);
      expect(artefact.artefactType).toBe('CLINICAL_CASE_REVIEW');
      // Reflection persisted as structured sections
      expect(artefact.reflection).toBeDefined();
      expect(artefact.reflection).toHaveLength(3);
      expect(artefact.reflection![0].title).toBe('Presentation');

      // Capabilities — only the user-selected C-06
      expect(artefact.capabilities).toHaveLength(1);
      expect(artefact.capabilities![0].code).toBe('C-06');
      expect(artefact.capabilities![0].evidence).toBeDefined(); // reasoning mapped to evidence field on artefact

      // PDP goals — stored in pdp_goals collection with embedded actions
      const pdpGoals = await getPdpGoalsForArtefact();
      expect(pdpGoals).toHaveLength(1);
      expect(pdpGoals[0].goal).toContain('diabetes');
      expect(pdpGoals[0].actions).toHaveLength(1);
      expect(pdpGoals[0].actions[0].action).toContain('diabetes update tutorial');
      expect(pdpGoals[0].actions[0].intendedEvidence).toContain('portfolio');
    });

    it('A3. Multiple follow-up rounds', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      // LLM calls include ask_followup replay on each resume (LangGraph re-executes the full node):
      // classify → completeness(missing 3) → followup → followup(replay) → completeness(missing 1) → followup → followup(replay) → completeness(covered)
      llmMock.enqueue(classifyResponse()); // 1: classify
      llmMock.enqueue(someMissingResponse(['clinical_reasoning', 'reflection', 'outcome'])); // 2: check_completeness
      llmMock.enqueue(
        // 3: ask_followup (initial)
        followupQuestionsResponse([
          { sectionId: 'clinical_reasoning', question: 'What was your reasoning?' },
          { sectionId: 'reflection', question: 'What did you learn?' },
          { sectionId: 'outcome', question: 'What was the outcome?' },
        ])
      );
      llmMock.enqueue(
        // 4: ask_followup (replay on resume)
        followupQuestionsResponse([
          { sectionId: 'clinical_reasoning', question: 'What was your reasoning?' },
          { sectionId: 'reflection', question: 'What did you learn?' },
          { sectionId: 'outcome', question: 'What was the outcome?' },
        ])
      );
      llmMock.enqueue(someMissingResponse(['reflection'])); // 5: check_completeness
      llmMock.enqueue(
        // 6: ask_followup (initial, round 2)
        followupQuestionsResponse([
          { sectionId: 'reflection', question: 'Can you reflect more on what you learned?' },
        ])
      );
      llmMock.enqueue(
        // 7: ask_followup (replay on resume, round 2)
        followupQuestionsResponse([
          { sectionId: 'reflection', question: 'Can you reflect more on what you learned?' },
        ])
      );
      llmMock.enqueue(allCoveredResponse()); // 8: check_completeness
      llmMock.enqueue(tagCapabilitiesResponse()); // 9: tag_capabilities

      // Start → classify → pause
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgsAfterClassify = await getMessagesForConversation(conv._id);
      const classificationMsg = msgsAfterClassify.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      // Select → completeness(missing) → ask_followup
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: classificationMsg.xid,
        value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForRunStable(harness, conv._id, true);

      // Find the first followup question message
      const msgsAfterFollowup1 = await getMessagesForConversation(conv._id);
      const followupMsg1 = msgsAfterFollowup1.find(
        (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'free_text'
      );
      assertDefined(followupMsg1);

      // Round 1: answer + resume
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'I considered type 1 vs type 2. Patient recovered well.',
      });
      const msgs1 = await getMessagesForConversation(conv._id);
      const lastUser1 = msgs1.filter((m) => m.role === MessageRole.USER).pop();
      assertDefined(lastUser1);
      assertDefined(lastUser1.rawContent);
      await markMessageComplete(lastUser1._id, lastUser1.rawContent);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: followupMsg1.xid,
      });
      const status2 = await waitForRunStable(harness, conv._id, true);

      expect(status2).toEqual({ status: 'awaiting_input', node: 'ask_followup' });

      // Find the second followup question message
      const msgsAfterFollowup2 = await getMessagesForConversation(conv._id);
      const followupMsgs = msgsAfterFollowup2.filter(
        (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'free_text'
      );
      const followupMsg2 = followupMsgs[followupMsgs.length - 1];
      assertDefined(followupMsg2);

      // Round 2: answer + resume
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'I learned about the importance of early intervention.',
      });
      const msgs2 = await getMessagesForConversation(conv._id);
      const lastUser2 = msgs2.filter((m) => m.role === MessageRole.USER).pop();
      assertDefined(lastUser2);
      assertDefined(lastUser2.rawContent);
      await markMessageComplete(lastUser2._id, lastUser2.rawContent);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: followupMsg2.xid,
      });
      const finalStatus = await waitForRunStable(harness, conv._id, true);

      // Graph moved past ask_followup → tag_capabilities → paused at present_capabilities
      expect(finalStatus).toEqual({ status: 'awaiting_input', node: 'present_capabilities' });

      // 2 follow-up ASSISTANT messages with different rounds
      const allMsgs = await getMessagesForConversation(conv._id);
      const allFollowupMsgs = allMsgs.filter(
        (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'free_text'
      );
      expect(allFollowupMsgs).toHaveLength(2);
      expect((allFollowupMsgs[0].question as FreeTextQuestion).followUpRound).toBe(1);
      expect((allFollowupMsgs[1].question as FreeTextQuestion).followUpRound).toBe(2);

      expect(llmMock.callCount).toBe(9);
    });

    it('A4. Max follow-up rounds reached — graph proceeds anyway', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      // LLM calls include ask_followup replay on each resume:
      // classify → completeness(missing) → followup → followup(replay) → completeness(missing) → followup → followup(replay) → completeness(missing)
      // After MAX_FOLLOWUP_ROUNDS (2), completenessRouter routes to tag_capabilities
      llmMock.enqueue(classifyResponse()); // 1: classify
      llmMock.enqueue(someMissingResponse(['reflection'])); // 2: check_completeness
      llmMock.enqueue(
        // 3: ask_followup (initial)
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );
      llmMock.enqueue(
        // 4: ask_followup (replay on resume)
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );
      llmMock.enqueue(someMissingResponse(['reflection'])); // 5: check_completeness
      llmMock.enqueue(
        // 6: ask_followup (initial, round 2)
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'Please reflect more.' }])
      );
      llmMock.enqueue(
        // 7: ask_followup (replay on resume, round 2)
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'Please reflect more.' }])
      );
      llmMock.enqueue(someMissingResponse(['reflection'])); // 8: check_completeness (still missing, but max rounds)
      llmMock.enqueue(tagCapabilitiesResponse()); // 9: tag_capabilities

      // Start → classify → pause
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgsAfterClassify = await getMessagesForConversation(conv._id);
      const classificationMsg = msgsAfterClassify.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      // Select → completeness(missing) → ask_followup (round 1)
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: classificationMsg.xid,
        value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForRunStable(harness, conv._id, true);

      // Find round 1 followup question message
      const msgsR1 = await getMessagesForConversation(conv._id);
      const followupMsgR1 = msgsR1.find(
        (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'free_text'
      );
      assertDefined(followupMsgR1);

      // Round 1 answer
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, { content: 'Some answer.' });
      const r1 = await getMessagesForConversation(conv._id);
      const r1last = r1.filter((m) => m.role === MessageRole.USER).pop();
      assertDefined(r1last);
      assertDefined(r1last.rawContent);
      await markMessageComplete(r1last._id, r1last.rawContent);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: followupMsgR1.xid,
      });
      await waitForRunStable(harness, conv._id, true);

      // Find round 2 followup question message
      const msgsR2 = await getMessagesForConversation(conv._id);
      const followupMsgsAll = msgsR2.filter(
        (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'free_text'
      );
      const followupMsgR2 = followupMsgsAll[followupMsgsAll.length - 1];
      assertDefined(followupMsgR2);

      // Round 2 answer
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, { content: 'More answers.' });
      const r2 = await getMessagesForConversation(conv._id);
      const r2last = r2.filter((m) => m.role === MessageRole.USER).pop();
      assertDefined(r2last);
      assertDefined(r2last.rawContent);
      await markMessageComplete(r2last._id, r2last.rawContent);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: followupMsgR2.xid,
      });
      const finalStatus = await waitForRunStable(harness, conv._id, true);

      // Graph did NOT pause at ask_followup a third time — proceeded to present_capabilities
      expect(finalStatus).toEqual({ status: 'awaiting_input', node: 'present_capabilities' });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Group B: sendMessage Guards
  // ════════════════════════════════════════════════════════════════

  describe('Group B: sendMessage Guards', () => {
    it('B1. Send message before analysis — allowed', async () => {
      const conv = await createTestConversation();

      const result = await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'Hello, I want to record a case.',
      });

      expect(result).toBeDefined();
      expect(result.content).toBe('Hello, I want to record a case.');
    });

    it('B3. Send message while paused at present_classification — rejected', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      llmMock.enqueue(classifyResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      const status = await waitForRunStable(harness, conv._id);

      expect(status).toEqual({ status: 'awaiting_input', node: 'present_classification' });

      await expect(
        harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, { content: 'More info...' })
      ).rejects.toThrow(ConflictException);
    });

    it('B4. Send message while paused at ask_followup — allowed', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(someMissingResponse(['reflection']));
      llmMock.enqueue(
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgsAfterClassify = await getMessagesForConversation(conv._id);
      const classificationMsg = msgsAfterClassify.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: classificationMsg.xid,
        value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
      });
      const status = await waitForRunStable(harness, conv._id, true);

      expect(status).toEqual({ status: 'awaiting_input', node: 'ask_followup' });

      const result = await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'I learned about shared decision making.',
      });
      expect(result).toBeDefined();
    });

    it('B5. Send message while paused at present_capabilities — rejected', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(allCoveredResponse());
      llmMock.enqueue(tagCapabilitiesResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgsAfterClassify = await getMessagesForConversation(conv._id);
      const classificationMsg = msgsAfterClassify.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: classificationMsg.xid,
        value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
      });
      const status = await waitForRunStable(harness, conv._id, true);

      expect(status).toEqual({ status: 'awaiting_input', node: 'present_capabilities' });

      await expect(
        harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, { content: 'More info...' })
      ).rejects.toThrow(ConflictException);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Group C: handleAnalysis Guards
  // ════════════════════════════════════════════════════════════════

  describe('Group C: handleAnalysis Guards', () => {
    it('C1. Start with no messages — rejected', async () => {
      const conv = await createTestConversation();

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' })
      ).rejects.toThrow(BadRequestException);
    });

    it('C2. Start with only PENDING messages — rejected', async () => {
      const conv = await createTestConversation();
      await createPendingUserMessage(conv._id, 'Still processing...');

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' })
      ).rejects.toThrow(ConflictException);
    });

    it('C3. Start when checkpoint already exists — rejected', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' })
      ).rejects.toThrow(ConflictException);
    });

    it('C4. Resume with messages still processing — rejected', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(someMissingResponse(['reflection']));
      llmMock.enqueue(
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgsAfterClassify = await getMessagesForConversation(conv._id);
      const classificationMsg = msgsAfterClassify.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: classificationMsg.xid,
        value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForRunStable(harness, conv._id, true);

      // Find followup question message
      const msgsAfterFollowup = await getMessagesForConversation(conv._id);
      const followupMsg = msgsAfterFollowup.find(
        (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'free_text'
      );
      assertDefined(followupMsg);

      // Insert a PENDING message (not yet processed)
      await createPendingUserMessage(conv._id, 'My follow-up answer');

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          messageId: followupMsg.xid,
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Group D: ask_followup Resume Guards
  // ════════════════════════════════════════════════════════════════

  describe('Group D: ask_followup Resume Guards', () => {
    /** Helper: run graph to ask_followup interrupt. Returns conv and followup question message xid. */
    async function runToAskFollowup() {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(someMissingResponse(['reflection']));
      llmMock.enqueue(
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgsAfterClassify = await getMessagesForConversation(conv._id);
      const classificationMsg = msgsAfterClassify.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: classificationMsg.xid,
        value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
      });
      const status = await waitForRunStable(harness, conv._id, true);

      expect(status).toEqual({ status: 'awaiting_input', node: 'ask_followup' });

      // Find the followup question message
      const msgsAfterFollowup = await getMessagesForConversation(conv._id);
      const followupMsg = msgsAfterFollowup.find(
        (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'free_text'
      );
      assertDefined(followupMsg);

      return { conv, followupMessageXid: followupMsg.xid };
    }

    it('D1. Resume ask_followup without answering — rejected', async () => {
      const { conv, followupMessageXid } = await runToAskFollowup();

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          messageId: followupMessageXid,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('D2. Resume ask_followup after SYSTEM message — rejected', async () => {
      const { conv, followupMessageXid } = await runToAskFollowup();

      await createTestMessage(conv._id, {
        role: MessageRole.SYSTEM,
        content: 'System note',
        processingStatus: MessageProcessingStatus.COMPLETE,
      });

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          messageId: followupMessageXid,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('D3. Resume ask_followup after user message — allowed', async () => {
      const { conv, followupMessageXid } = await runToAskFollowup();

      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'I learned about the importance of follow-up.',
      });

      const msgs = await getMessagesForConversation(conv._id);
      const lastUser = msgs.filter((m) => m.role === MessageRole.USER).pop();
      assertDefined(lastUser);
      assertDefined(lastUser.rawContent);
      await markMessageComplete(lastUser._id, lastUser.rawContent);

      // ask_followup replays on resume (LangGraph re-executes the node), then
      // gather_context → check_completeness → tag_capabilities → present_capabilities
      llmMock.enqueue(
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );
      llmMock.enqueue(allCoveredResponse());
      llmMock.enqueue(tagCapabilitiesResponse());

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          messageId: followupMessageXid,
        })
      ).resolves.toBeUndefined();

      // Wait for graph to settle so the fire-and-forget doesn't leak into the next test
      await waitForRunStable(harness, conv._id, true);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Group E: Classification Guards
  // ════════════════════════════════════════════════════════════════

  describe('Group E: Classification Guards', () => {
    it('E1. Resume classification with invalid entry type — rejected', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgs = await getMessagesForConversation(conv._id);
      const classificationMsg = msgs.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          messageId: classificationMsg.xid,
          value: { selectedKey: 'INVALID_TYPE_THAT_DOES_NOT_EXIST' },
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('E2. Resume classification with valid entry type — allowed', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(allCoveredResponse());
      llmMock.enqueue(tagCapabilitiesResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgs = await getMessagesForConversation(conv._id);
      const classificationMsg = msgs.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          messageId: classificationMsg.xid,
          value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
        })
      ).resolves.toBeUndefined();

      await waitForRunStable(harness, conv._id, true);

      const msgsAfter = await getMessagesForConversation(conv._id);
      const auditMsg = msgsAfter.find(
        (m) =>
          m.role === MessageRole.USER &&
          m.content?.startsWith('Selected:') &&
          m.content?.includes('Clinical Case Review')
      );
      assertDefined(auditMsg);
      expect(auditMsg.content).toBe('Selected: Clinical Case Review');
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Group F: Message Role Verification
  // ════════════════════════════════════════════════════════════════

  describe('Group F: Message Role Verification', () => {
    it('F1. ASSISTANT messages created by graph service have correct metadata', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      llmMock.enqueue(classifyResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      const msgs = await getMessagesForConversation(conv._id);
      const assistantMsg = msgs.find((m) => m.role === MessageRole.ASSISTANT);

      assertDefined(assistantMsg);
      expect(assistantMsg.role).toBe(MessageRole.ASSISTANT);
      expect(assistantMsg.processingStatus).toBe(MessageProcessingStatus.COMPLETE);
      expect(assistantMsg.messageType).toBe(MessageType.TEXT);
      expect((assistantMsg.question as any)?.questionType).toBe('single_select');
      const f1Meta = assistantMsg.question as SingleSelectQuestion;
      expect(f1Meta.options).toBeInstanceOf(Array);
      expect(f1Meta.options.length).toBeGreaterThan(0);
    });

    it('F2. Follow-up ASSISTANT messages have questions array', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(someMissingResponse(['reflection']));
      llmMock.enqueue(
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgsAfterClassify = await getMessagesForConversation(conv._id);
      const classificationMsg = msgsAfterClassify.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: classificationMsg.xid,
        value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForRunStable(harness, conv._id, true);

      const msgs = await getMessagesForConversation(conv._id);
      const followupMsg = msgs.find(
        (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'free_text'
      );

      assertDefined(followupMsg);
      expect(followupMsg.role).toBe(MessageRole.ASSISTANT);
      const f2Meta = followupMsg.question as FreeTextQuestion;
      expect(f2Meta.prompts).toHaveLength(1);
      expect(f2Meta.prompts[0].key).toBe('reflection');
      expect(f2Meta.followUpRound).toBe(1);
      expect(f2Meta.entryType).toBe('CLINICAL_CASE_REVIEW');
    });

    it('F3. USER audit messages on classification selection', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(allCoveredResponse());
      llmMock.enqueue(tagCapabilitiesResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Find classification question message
      const msgsAfterClassify = await getMessagesForConversation(conv._id);
      const classificationMsg = msgsAfterClassify.find(
        (m) =>
          m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'single_select'
      );
      assertDefined(classificationMsg);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        messageId: classificationMsg.xid,
        value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForRunStable(harness, conv._id, true);

      const msgs = await getMessagesForConversation(conv._id);
      const selectionMsgs = msgs.filter(
        (m) => m.role === MessageRole.USER && m.content?.startsWith('Selected:')
      );

      expect(selectionMsgs).toHaveLength(1);
      expect(selectionMsgs[0].content).toBe('Selected: Clinical Case Review');
      expect(selectionMsgs[0].processingStatus).toBe(MessageProcessingStatus.COMPLETE);
    });

    it('F4. gather_context only reads USER COMPLETE messages', async () => {
      const conv = await createTestConversation();

      await createCompleteUserMessage(conv._id, 'First user message.');
      await createCompleteUserMessage(conv._id, 'Second user message.');
      await createTestMessage(conv._id, {
        role: MessageRole.ASSISTANT,
        content: 'Assistant response',
        processingStatus: MessageProcessingStatus.COMPLETE,
      });
      await createTestMessage(conv._id, {
        role: MessageRole.SYSTEM,
        content: 'System audit',
        processingStatus: MessageProcessingStatus.COMPLETE,
      });

      llmMock.enqueue(classifyResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      expect(llmMock.calls).toHaveLength(1);
      const classifyCall = llmMock.calls[0];
      const humanMsg = classifyCall.messages.find((m) => m._getType() === 'human');
      assertDefined(humanMsg);
      const transcriptContent = humanMsg.content as string;
      expect(transcriptContent).toContain('First user message');
      expect(transcriptContent).toContain('Second user message');
      expect(transcriptContent).not.toContain('Assistant response');
      expect(transcriptContent).not.toContain('System audit');
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Group G: Edge Cases
  // ════════════════════════════════════════════════════════════════

  describe('Group G: Edge Cases', () => {
    it('G1. Start analysis twice sequentially — second attempt rejected', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' })
      ).rejects.toThrow(ConflictException);
    });

    it('G2. Multiple messages then start — all included in transcript', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'Message one: initial presentation.');
      await createCompleteUserMessage(conv._id, 'Message two: examination findings.');
      await createCompleteUserMessage(conv._id, 'Message three: management plan.');

      llmMock.enqueue(classifyResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      expect(llmMock.calls).toHaveLength(1);
      const humanMsg = llmMock.calls[0].messages.find((m) => m._getType() === 'human');
      assertDefined(humanMsg);
      const transcript = humanMsg.content as string;
      expect(transcript).toContain('Message one');
      expect(transcript).toContain('Message two');
      expect(transcript).toContain('Message three');
    });

    it('G3. Resume with wrong question message — rejected', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForRunStable(harness, conv._id);

      // Create a different ASSISTANT message with question to use as the "wrong" question
      const wrongMsg = await createTestMessage(conv._id, {
        role: MessageRole.ASSISTANT,
        content: 'Wrong question',
        processingStatus: MessageProcessingStatus.COMPLETE,
        question: {
          questionType: 'free_text',
          prompts: [{ key: 'test', text: 'test question' }],
        },
      });

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          messageId: wrongMsg.xid,
        })
      ).rejects.toThrow(ConflictException);
    });

    it('G4. Resume when not paused — rejected', async () => {
      const conv = await createTestConversation();

      // Create an ASSISTANT question message to have a valid messageId
      const questionMsg = await createTestMessage(conv._id, {
        role: MessageRole.ASSISTANT,
        content: 'A question',
        processingStatus: MessageProcessingStatus.COMPLETE,
        question: {
          questionType: 'single_select',
          options: [{ key: 'CLINICAL_CASE_REVIEW', label: 'Clinical Case Review' }],
        },
      });

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          messageId: questionMsg.xid,
          value: { selectedKey: 'CLINICAL_CASE_REVIEW' },
        })
      ).rejects.toThrow(ConflictException);
    });
  });
});
