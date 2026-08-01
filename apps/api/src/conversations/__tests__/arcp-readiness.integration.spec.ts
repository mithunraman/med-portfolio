import {
  AnalysisRunStatus,
  ArtefactStatus,
  MessageRole,
  type MultiSelectQuestion,
} from '@acme/shared';
import { Types } from 'mongoose';
import {
  createCompleteUserMessage,
  createTestArtefact,
  createTestConversation,
  getMessagesForConversation,
  getPdpGoalsForArtefact,
  getTestArtefact,
  TEST_USER_ID_STR,
} from './helpers/factories';
import {
  allCoveredResponse,
  refineResponse,
  elicitJustificationResponse,
  generatePdpResponse,
  reflectResponse,
  SequentialLLMMock,
  tagCapabilitiesResponse,
} from './helpers/llm-mock';
import {
  cleanupDatabase,
  createTestHarness,
  destroyTestHarness,
  TestHarness,
} from './helpers/test-setup';

// ── Helpers (mirrors conversations.integration.spec.ts) ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertDefined<T>(value: T | null | undefined): asserts value is T {
  expect(value).toBeDefined();
}

type StableRunState = { status: 'awaiting_input'; node: string } | { status: 'completed' };

/** Poll AnalysisRun status until it reaches AWAITING_INPUT or COMPLETED. */
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
    const initialRun = await harness.analysisRunsService.findLatestRun(conversationOid);
    const initialNode =
      initialRun?.status === AnalysisRunStatus.AWAITING_INPUT
        ? initialRun.currentQuestion?.node
        : null;
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
        if (confirmed.status === AnalysisRunStatus.COMPLETED) return { status: 'completed' };
        if (confirmed.currentQuestion?.node)
          return { status: 'awaiting_input', node: confirmed.currentQuestion.node };
      }
      continue;
    }
    await sleep(pollIntervalMs);
  }
  throw new Error('Timed out waiting for stable run state');
}

// ── Tests ──

describe('ARCP Readiness Engine — Integration', () => {
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
    await createTestArtefact();
  });

  /**
   * Full new-flow traversal to ARCP-ready, including the new nodes:
   *
   *   start → check_completeness(all rich/adequate → cleared)
   *     → tag_capabilities → present_capabilities ⏸️
   *     → (resume, select C-06) → elicit_justification → reflect → refine → generate_pdp
   *     → save → END
   *
   * The entry type is chosen at artefact creation, so present_capabilities is the
   * only interrupt on this path — once resumed, the graph runs straight to
   * completion (no sign-off gate).
   *
   * LLM call sequence (6): completeness, tag, justification, reflect, refine, pdp.
   */
  it('drives the entry to ARCP-ready and persists draftStatus, composedDocument, and justifications', async () => {
    const conv = await createTestConversation();
    // Seed contains both capability quotes so tag_capabilities keeps C-06 and C-08.
    await createCompleteUserMessage(
      conv._id,
      'I saw a 55-year-old patient with poorly controlled type 2 diabetes. HbA1c was 72. ' +
        'I started metformin and discussed lifestyle changes. We agreed a follow-up plan.'
    );

    llmMock.enqueue(allCoveredResponse()); // 0: check_completeness (rubric clears)
    llmMock.enqueue(tagCapabilitiesResponse()); // 1: tag_capabilities (C-06, C-08)
    llmMock.enqueue(
      // 2: elicit_justification (for the selected C-06)
      elicitJustificationResponse([
        {
          code: 'C-06',
          justification: 'I reviewed the HbA1c of 72 and initiated metformin after discussing options.',
          justificationTier: 'strong',
          sourceQuote: 'I started metformin and discussed lifestyle changes',
        },
      ])
    );
    llmMock.enqueue(reflectResponse()); // 3: reflect
    llmMock.enqueue(refineResponse()); // 4: refine (no-op → keeps reflect text)
    llmMock.enqueue(generatePdpResponse()); // 5: generate_pdp

    // ── Step 1: Start → completeness clears → present_capabilities ──
    await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, { type: 'start' });
    const status2 = await waitForRunStable(harness, conv._id);
    expect(status2).toEqual({ status: 'awaiting_input', node: 'present_capabilities' });
    expect(llmMock.callCount).toBe(2); // completeness + tag (no follow-up loop)

    const msgs2 = await getMessagesForConversation(conv._id);
    const capabilityMsg = msgs2.find(
      (m) => m.role === MessageRole.ASSISTANT && (m.question as any)?.questionType === 'multi_select'
    );
    assertDefined(capabilityMsg);
    const capQuestion = capabilityMsg.question as MultiSelectQuestion;
    expect(capQuestion.options).toHaveLength(2);

    // Entry Card readiness payload rides on the question (Phase 5).
    assertDefined(capQuestion.readiness);
    expect(capQuestion.readiness.score).toBeGreaterThan(0);
    expect(capQuestion.readiness.draftStatus).toBe('in_progress');
    expect(capQuestion.readiness.sections.length).toBeGreaterThan(0);

    // ── Step 3: Resume capabilities (select C-06) → justify → reflect → pdp → save → COMPLETED ──
    await harness.service.handleAnalysis(TEST_USER_ID_STR, conv.xid, {
      type: 'resume',
      messageId: capabilityMsg.xid,
      value: { selectedKeys: ['C-06'] },
    });
    const finalStatus = await waitForRunStable(harness, conv._id, true);
    expect(finalStatus).toEqual({ status: 'completed' });
    expect(llmMock.callCount).toBe(6); // + justification + reflect + refine + pdp
    llmMock.assertAllConsumed();

    // ── Final assertions: the persisted artefact carries the new fields ──
    const artefact = await getTestArtefact();
    assertDefined(artefact);

    expect(artefact.status).toBe(ArtefactStatus.IN_REVIEW);
    expect(artefact.artefactType).toBe('CLINICAL_CASE_REVIEW');

    // Phase 6: graded readiness verdict
    expect(artefact.draftStatus).toBe('ready');
    expect(artefact.readinessScore).toBeGreaterThan(0);

    // Phase 4: composed document projected into output fields
    assertDefined(artefact.composedDocument);
    const brief = artefact.composedDocument!.find((s) => s.sectionId === 'brief_description');
    assertDefined(brief);
    expect(brief.text).toContain('55-year-old');

    // Phase 2: capability justification persisted (selected C-06 only)
    expect(artefact.capabilities).toHaveLength(1);
    expect(artefact.capabilities![0].code).toBe('C-06');
    expect(artefact.capabilities![0].justification).toContain('metformin');

    // PDP still generated
    const pdpGoals = await getPdpGoalsForArtefact();
    expect(pdpGoals).toHaveLength(1);
  });
});
