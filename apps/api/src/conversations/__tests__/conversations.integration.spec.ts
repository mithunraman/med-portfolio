import {
  MessageProcessingStatus,
  MessageRole,
  MessageType,
} from '@acme/shared';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { GraphStatus } from '../../portfolio-graph/portfolio-graph.service';
import {
  createTestConversation,
  createCompleteUserMessage,
  createPendingUserMessage,
  createTestMessage,
  getMessagesForConversation,
  markMessageComplete,
  TEST_USER_ID_STR,
} from './helpers/factories';
import {
  SequentialLLMMock,
  classifyResponse,
  allCoveredResponse,
  someMissingResponse,
  followupQuestionsResponse,
} from './helpers/llm-mock';
import {
  createTestHarness,
  cleanupDatabase,
  destroyTestHarness,
  TestHarness,
} from './helpers/test-setup';

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll graph status until it reaches a stable state (paused or completed).
 *
 * When `afterResume` is true, the function first waits until the graph leaves
 * the current paused state (enters `running` or a different paused node),
 * then waits until it stabilizes again. This handles the fire-and-forget pattern
 * where the graph may still show the old paused state momentarily after resume.
 *
 * After finding a stable state, waits an additional `settleMs` and then confirms
 * the state hasn't changed. This guards against transient checkpoint states that
 * can briefly appear as "completed" while the graph is still executing between nodes.
 */
async function waitForGraphStable(
  harness: TestHarness,
  conversationId: string,
  afterResume = false,
  timeoutMs = 10000,
  pollIntervalMs = 100,
  settleMs = 300,
): Promise<GraphStatus> {
  const deadline = Date.now() + timeoutMs;

  if (afterResume) {
    // Capture the current state so we know what to wait past
    const initialStatus = await harness.graphService.getGraphStatus(conversationId);
    const initialNode = initialStatus.status === 'paused' ? initialStatus.node : null;

    // Phase 1: Wait until graph is no longer at the initial paused node
    // (it should transition to 'running' or 'not_started' or a different node)
    if (initialNode) {
      while (Date.now() < deadline) {
        const status = await harness.graphService.getGraphStatus(conversationId);
        // If it moved away from the initial node, break
        if (status.status !== 'paused' || status.node !== initialNode) break;
        await sleep(pollIntervalMs);
      }
    }
  }

  // Phase 2: Wait for stable state (paused or completed), then confirm
  while (Date.now() < deadline) {
    const status = await harness.graphService.getGraphStatus(conversationId);
    if (status.status === 'completed' || status.status === 'paused') {
      // Wait for side effects and confirm the state is truly stable.
      // During graph execution, checkpoints can briefly show next=[] (completed)
      // between nodes. Re-checking after settle catches these transient states.
      await sleep(settleMs);
      const confirmed = await harness.graphService.getGraphStatus(conversationId);
      if (
        confirmed.status === status.status &&
        (confirmed.status !== 'paused' || confirmed.node === (status as any).node)
      ) {
        return confirmed;
      }
      // State changed during settle — it was transient, keep polling
      continue;
    }
    await sleep(pollIntervalMs);
  }
  // Return whatever state we're in
  return harness.graphService.getGraphStatus(conversationId);
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
  });

  // ════════════════════════════════════════════════════════════════
  // Debug: LLM call sequence investigation
  // ════════════════════════════════════════════════════════════════

  it('DEBUG: LLM call sequence after resume from present_classification', async () => {
    const conv = await createTestConversation();
    await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

    // Correct sequence: classify → completeness(missing) → followup
    llmMock.enqueue(classifyResponse());                                                         // 0: classify
    llmMock.enqueue(someMissingResponse(['reflection']));                                         // 1: check_completeness
    llmMock.enqueue(followupQuestionsResponse([{ sectionId: 'reflection', question: 'Q?' }]));    // 2: ask_followup

    // Start → classify → pause at present_classification
    await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
    const status1 = await waitForGraphStable(harness, conv._id.toString());

    // Resume from present_classification → should reach ask_followup
    await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
      type: 'resume',
      node: 'present_classification',
      value: { entryType: 'CLINICAL_CASE_REVIEW' },
    });
    const status2 = await waitForGraphStable(harness, conv._id.toString(), true);

    expect(status1).toEqual({ status: 'paused', node: 'present_classification' });
    expect(status2).toEqual({ status: 'paused', node: 'ask_followup' });
  });

  // ════════════════════════════════════════════════════════════════
  // Group A: Happy Paths
  // ════════════════════════════════════════════════════════════════

  describe('Group A: Happy Paths', () => {
    it('A1. Full flow — send message, start analysis, classify, select entry type', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(
        conv._id,
        'I saw a 55-year-old patient with poorly controlled type 2 diabetes. HbA1c was 72. I started them on metformin and discussed lifestyle changes.'
      );

      // LLM: classify → completeness (all covered)
      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(allCoveredResponse());

      // Start analysis → graph runs classify → pauses at present_classification
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      const status1 = await waitForGraphStable(harness, conv._id.toString());

      expect(status1).toEqual({ status: 'paused', node: 'present_classification' });

      // ASSISTANT message with classification options created
      const msgs1 = await getMessagesForConversation(conv._id);
      const classificationMsg = msgs1.find(
        (m) => m.role === MessageRole.ASSISTANT && (m.metadata as any)?.type === 'classification_options'
      );
      expect(classificationMsg).toBeDefined();
      expect(classificationMsg!.processingStatus).toBe(MessageProcessingStatus.COMPLETE);
      expect((classificationMsg!.metadata as any).options).toBeInstanceOf(Array);

      // Resume with classification selection
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForGraphStable(harness, conv._id.toString(), true);

      // SYSTEM audit message created
      const msgs2 = await getMessagesForConversation(conv._id);
      const auditMsg = msgs2.find(
        (m) => m.role === MessageRole.SYSTEM && (m.metadata as any)?.type === 'classification_selection'
      );
      expect(auditMsg).toBeDefined();
      expect(auditMsg!.content).toBe('Selected: CLINICAL_CASE_REVIEW');

      // LLM was called for classify + completeness
      expect(llmMock.callCount).toBe(2);
    });

    it('A2. Follow-up loop — user answers, graph re-assesses', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient with diabetes.');

      // LLM calls: classify → completeness(missing) → followup → followup(replay) → completeness(all covered)
      // Note: when ask_followup is resumed, LangGraph re-executes the node from scratch,
      // so the LLM call inside ask_followup runs again before interrupt() returns.
      llmMock.enqueue(classifyResponse());                                                          // 1: classify
      llmMock.enqueue(someMissingResponse(['clinical_reasoning', 'reflection']));                    // 2: check_completeness
      llmMock.enqueue(                                                                               // 3: ask_followup (initial)
        followupQuestionsResponse([
          { sectionId: 'clinical_reasoning', question: 'What differentials did you consider?' },
          { sectionId: 'reflection', question: 'What did you learn from this case?' },
        ])
      );
      llmMock.enqueue(                                                                               // 4: ask_followup (replay on resume)
        followupQuestionsResponse([
          { sectionId: 'clinical_reasoning', question: 'What differentials did you consider?' },
          { sectionId: 'reflection', question: 'What did you learn from this case?' },
        ])
      );
      llmMock.enqueue(allCoveredResponse());                                                         // 5: check_completeness

      // Start → classify → pause at classification
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForGraphStable(harness, conv._id.toString());

      // Select entry type → completeness(missing) → ask_followup
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      const status = await waitForGraphStable(harness, conv._id.toString(), true);

      expect(status).toEqual({ status: 'paused', node: 'ask_followup' });

      // ASSISTANT message with follow-up questions
      const msgs = await getMessagesForConversation(conv._id);
      const followupMsg = msgs.find(
        (m) => m.role === MessageRole.ASSISTANT && (m.metadata as any)?.type === 'followup_questions'
      );
      expect(followupMsg).toBeDefined();
      expect((followupMsg!.metadata as any).questions).toHaveLength(2);

      // User sends follow-up answer
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'I considered type 1 vs type 2. I learned about shared decision making.',
      });
      const msgsAfterSend = await getMessagesForConversation(conv._id);
      const lastUserMsg = msgsAfterSend.filter((m) => m.role === MessageRole.USER).pop()!;
      await markMessageComplete(lastUserMsg._id, lastUserMsg.rawContent!);

      // Resume → ask_followup(replay) → gather_context → completeness(all covered) → proceed
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'ask_followup',
      });
      const finalStatus = await waitForGraphStable(harness, conv._id.toString(), true);

      // Graph moved past ask_followup (should be at present_draft or completed)
      if (finalStatus.status === 'paused') {
        expect(finalStatus.node).not.toBe('ask_followup');
      }

      expect(llmMock.callCount).toBe(5);
    });

    it('A3. Multiple follow-up rounds', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      // LLM calls include ask_followup replay on each resume (LangGraph re-executes the full node):
      // classify → completeness(missing 3) → followup → followup(replay) → completeness(missing 1) → followup → followup(replay) → completeness(covered)
      llmMock.enqueue(classifyResponse());                                                           // 1: classify
      llmMock.enqueue(someMissingResponse(['clinical_reasoning', 'reflection', 'outcome']));         // 2: check_completeness
      llmMock.enqueue(                                                                                // 3: ask_followup (initial)
        followupQuestionsResponse([
          { sectionId: 'clinical_reasoning', question: 'What was your reasoning?' },
          { sectionId: 'reflection', question: 'What did you learn?' },
          { sectionId: 'outcome', question: 'What was the outcome?' },
        ])
      );
      llmMock.enqueue(                                                                                // 4: ask_followup (replay on resume)
        followupQuestionsResponse([
          { sectionId: 'clinical_reasoning', question: 'What was your reasoning?' },
          { sectionId: 'reflection', question: 'What did you learn?' },
          { sectionId: 'outcome', question: 'What was the outcome?' },
        ])
      );
      llmMock.enqueue(someMissingResponse(['reflection']));                                          // 5: check_completeness
      llmMock.enqueue(                                                                                // 6: ask_followup (initial, round 2)
        followupQuestionsResponse([
          { sectionId: 'reflection', question: 'Can you reflect more on what you learned?' },
        ])
      );
      llmMock.enqueue(                                                                                // 7: ask_followup (replay on resume, round 2)
        followupQuestionsResponse([
          { sectionId: 'reflection', question: 'Can you reflect more on what you learned?' },
        ])
      );
      llmMock.enqueue(allCoveredResponse());                                                         // 8: check_completeness

      // Start → classify → pause
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForGraphStable(harness, conv._id.toString());

      // Select → completeness(missing) → ask_followup
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForGraphStable(harness, conv._id.toString(), true);

      // Round 1: answer + resume
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'I considered type 1 vs type 2. Patient recovered well.',
      });
      const msgs1 = await getMessagesForConversation(conv._id);
      const lastUser1 = msgs1.filter((m) => m.role === MessageRole.USER).pop()!;
      await markMessageComplete(lastUser1._id, lastUser1.rawContent!);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'ask_followup',
      });
      const status2 = await waitForGraphStable(harness, conv._id.toString(), true);

      expect(status2).toEqual({ status: 'paused', node: 'ask_followup' });

      // Round 2: answer + resume
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'I learned about the importance of early intervention.',
      });
      const msgs2 = await getMessagesForConversation(conv._id);
      const lastUser2 = msgs2.filter((m) => m.role === MessageRole.USER).pop()!;
      await markMessageComplete(lastUser2._id, lastUser2.rawContent!);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'ask_followup',
      });
      const finalStatus = await waitForGraphStable(harness, conv._id.toString(), true);

      // Graph moved past ask_followup
      if (finalStatus.status === 'paused') {
        expect(finalStatus.node).not.toBe('ask_followup');
      }

      // 2 follow-up ASSISTANT messages with different rounds
      const allMsgs = await getMessagesForConversation(conv._id);
      const followupMsgs = allMsgs.filter(
        (m) => m.role === MessageRole.ASSISTANT && (m.metadata as any)?.type === 'followup_questions'
      );
      expect(followupMsgs).toHaveLength(2);
      expect((followupMsgs[0].metadata as any).followUpRound).toBe(1);
      expect((followupMsgs[1].metadata as any).followUpRound).toBe(2);

      expect(llmMock.callCount).toBe(8);
    });

    it('A4. Max follow-up rounds reached — graph proceeds anyway', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      // LLM calls include ask_followup replay on each resume:
      // classify → completeness(missing) → followup → followup(replay) → completeness(missing) → followup → followup(replay) → completeness(missing)
      // After MAX_FOLLOWUP_ROUNDS (2), completenessRouter routes to tag_capabilities
      llmMock.enqueue(classifyResponse());                                                           // 1: classify
      llmMock.enqueue(someMissingResponse(['reflection']));                                          // 2: check_completeness
      llmMock.enqueue(                                                                                // 3: ask_followup (initial)
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );
      llmMock.enqueue(                                                                                // 4: ask_followup (replay on resume)
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );
      llmMock.enqueue(someMissingResponse(['reflection']));                                          // 5: check_completeness
      llmMock.enqueue(                                                                                // 6: ask_followup (initial, round 2)
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'Please reflect more.' }])
      );
      llmMock.enqueue(                                                                                // 7: ask_followup (replay on resume, round 2)
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'Please reflect more.' }])
      );
      llmMock.enqueue(someMissingResponse(['reflection']));                                          // 8: check_completeness (still missing, but max rounds)

      // Start → classify → pause
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForGraphStable(harness, conv._id.toString());

      // Select → completeness(missing) → ask_followup (round 1)
      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForGraphStable(harness, conv._id.toString(), true);

      // Round 1 answer
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, { content: 'Some answer.' });
      const r1 = await getMessagesForConversation(conv._id);
      const r1last = r1.filter((m) => m.role === MessageRole.USER).pop()!;
      await markMessageComplete(r1last._id, r1last.rawContent!);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'ask_followup',
      });
      await waitForGraphStable(harness, conv._id.toString(), true);

      // Round 2 answer
      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, { content: 'More answers.' });
      const r2 = await getMessagesForConversation(conv._id);
      const r2last = r2.filter((m) => m.role === MessageRole.USER).pop()!;
      await markMessageComplete(r2last._id, r2last.rawContent!);

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'ask_followup',
      });
      const finalStatus = await waitForGraphStable(harness, conv._id.toString(), true);

      // Graph did NOT pause at ask_followup a third time
      if (finalStatus.status === 'paused') {
        expect(finalStatus.node).not.toBe('ask_followup');
      }
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
      const status = await waitForGraphStable(harness, conv._id.toString());

      expect(status).toEqual({ status: 'paused', node: 'present_classification' });

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
      await waitForGraphStable(harness, conv._id.toString());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      const status = await waitForGraphStable(harness, conv._id.toString(), true);

      expect(status).toEqual({ status: 'paused', node: 'ask_followup' });

      const result = await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'I learned about shared decision making.',
      });
      expect(result).toBeDefined();
    });

    it('B5. Send message after analysis complete — rejected', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(allCoveredResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForGraphStable(harness, conv._id.toString());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      const status = await waitForGraphStable(harness, conv._id.toString(), true);

      // Graph should reach present_draft (stubs pass through) or complete
      // Either way, can't send messages
      if (status.status === 'completed' || (status.status === 'paused' && status.node === 'present_draft')) {
        await expect(
          harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, { content: 'More info...' })
        ).rejects.toThrow(ConflictException);
      }
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
      await waitForGraphStable(harness, conv._id.toString());

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
      await waitForGraphStable(harness, conv._id.toString());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForGraphStable(harness, conv._id.toString(), true);

      // Insert a PENDING message (not yet processed)
      await createPendingUserMessage(conv._id, 'My follow-up answer');

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          node: 'ask_followup',
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Group D: ask_followup Resume Guards
  // ════════════════════════════════════════════════════════════════

  describe('Group D: ask_followup Resume Guards', () => {
    /** Helper: run graph to ask_followup interrupt. */
    async function runToAskFollowup() {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a diabetic patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(someMissingResponse(['reflection']));
      llmMock.enqueue(
        followupQuestionsResponse([{ sectionId: 'reflection', question: 'What did you learn?' }])
      );

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForGraphStable(harness, conv._id.toString());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      const status = await waitForGraphStable(harness, conv._id.toString(), true);

      expect(status).toEqual({ status: 'paused', node: 'ask_followup' });
      return conv;
    }

    it('D1. Resume ask_followup without answering — rejected', async () => {
      const conv = await runToAskFollowup();

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          node: 'ask_followup',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('D2. Resume ask_followup after SYSTEM message — rejected', async () => {
      const conv = await runToAskFollowup();

      await createTestMessage(conv._id, {
        role: MessageRole.SYSTEM,
        content: 'System note',
        processingStatus: MessageProcessingStatus.COMPLETE,
      });

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          node: 'ask_followup',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('D3. Resume ask_followup after user message — allowed', async () => {
      const conv = await runToAskFollowup();

      await harness.service.sendMessage(TEST_USER_ID_STR, conv.xid, {
        content: 'I learned about the importance of follow-up.',
      });

      const msgs = await getMessagesForConversation(conv._id);
      const lastUser = msgs.filter((m) => m.role === MessageRole.USER).pop()!;
      await markMessageComplete(lastUser._id, lastUser.rawContent!);

      llmMock.enqueue(allCoveredResponse());

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          node: 'ask_followup',
        })
      ).resolves.toBeUndefined();
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
      await waitForGraphStable(harness, conv._id.toString());

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          node: 'present_classification',
          value: { entryType: 'INVALID_TYPE_THAT_DOES_NOT_EXIST' },
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('E2. Resume classification with valid entry type — allowed', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(allCoveredResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForGraphStable(harness, conv._id.toString());

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          node: 'present_classification',
          value: { entryType: 'CLINICAL_CASE_REVIEW' },
        })
      ).resolves.toBeUndefined();

      await waitForGraphStable(harness, conv._id.toString(), true);

      const msgs = await getMessagesForConversation(conv._id);
      const auditMsg = msgs.find(
        (m) => m.role === MessageRole.SYSTEM && (m.metadata as any)?.type === 'classification_selection'
      );
      expect(auditMsg).toBeDefined();
      expect(auditMsg!.content).toBe('Selected: CLINICAL_CASE_REVIEW');
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
      await waitForGraphStable(harness, conv._id.toString());

      const msgs = await getMessagesForConversation(conv._id);
      const assistantMsg = msgs.find((m) => m.role === MessageRole.ASSISTANT);

      expect(assistantMsg).toBeDefined();
      expect(assistantMsg!.role).toBe(MessageRole.ASSISTANT);
      expect(assistantMsg!.processingStatus).toBe(MessageProcessingStatus.COMPLETE);
      expect(assistantMsg!.messageType).toBe(MessageType.TEXT);
      expect((assistantMsg!.metadata as any).type).toBe('classification_options');
      expect((assistantMsg!.metadata as any).options).toBeInstanceOf(Array);
      expect((assistantMsg!.metadata as any).options.length).toBeGreaterThan(0);
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
      await waitForGraphStable(harness, conv._id.toString());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForGraphStable(harness, conv._id.toString(), true);

      const msgs = await getMessagesForConversation(conv._id);
      const followupMsg = msgs.find(
        (m) => m.role === MessageRole.ASSISTANT && (m.metadata as any)?.type === 'followup_questions'
      );

      expect(followupMsg).toBeDefined();
      expect(followupMsg!.role).toBe(MessageRole.ASSISTANT);
      expect((followupMsg!.metadata as any).questions).toHaveLength(1);
      expect((followupMsg!.metadata as any).questions[0].sectionId).toBe('reflection');
      expect((followupMsg!.metadata as any).followUpRound).toBe(1);
      expect((followupMsg!.metadata as any).entryType).toBe('CLINICAL_CASE_REVIEW');
    });

    it('F3. SYSTEM audit messages on classification selection', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());
      llmMock.enqueue(allCoveredResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForGraphStable(harness, conv._id.toString());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
        type: 'resume',
        node: 'present_classification',
        value: { entryType: 'CLINICAL_CASE_REVIEW' },
      });
      await waitForGraphStable(harness, conv._id.toString(), true);

      const msgs = await getMessagesForConversation(conv._id);
      const systemMsgs = msgs.filter((m) => m.role === MessageRole.SYSTEM);

      expect(systemMsgs).toHaveLength(1);
      expect(systemMsgs[0].content).toBe('Selected: CLINICAL_CASE_REVIEW');
      expect(systemMsgs[0].processingStatus).toBe(MessageProcessingStatus.COMPLETE);
      expect((systemMsgs[0].metadata as any).type).toBe('classification_selection');
      expect((systemMsgs[0].metadata as any).entryType).toBe('CLINICAL_CASE_REVIEW');
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
      await waitForGraphStable(harness, conv._id.toString());

      expect(llmMock.calls).toHaveLength(1);
      const classifyCall = llmMock.calls[0];
      const humanMsg = classifyCall.messages.find((m) => m._getType() === 'human');
      expect(humanMsg).toBeDefined();
      const transcriptContent = humanMsg!.content as string;
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
      await waitForGraphStable(harness, conv._id.toString());

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
      await waitForGraphStable(harness, conv._id.toString());

      expect(llmMock.calls).toHaveLength(1);
      const humanMsg = llmMock.calls[0].messages.find((m) => m._getType() === 'human');
      const transcript = humanMsg!.content as string;
      expect(transcript).toContain('Message one');
      expect(transcript).toContain('Message two');
      expect(transcript).toContain('Message three');
    });

    it('G3. Resume at wrong node — rejected', async () => {
      const conv = await createTestConversation();
      await createCompleteUserMessage(conv._id, 'I saw a patient.');

      llmMock.enqueue(classifyResponse());

      await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
      await waitForGraphStable(harness, conv._id.toString());

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          node: 'ask_followup',
        })
      ).rejects.toThrow(ConflictException);
    });

    it('G4. Resume when not paused — rejected', async () => {
      const conv = await createTestConversation();

      await expect(
        harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
          type: 'resume',
          node: 'present_classification',
          value: { entryType: 'CLINICAL_CASE_REVIEW' },
        })
      ).rejects.toThrow(ConflictException);
    });
  });
});
