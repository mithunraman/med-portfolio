import { ANALYSIS_STEP_STARTED, emitStepStarted } from '../graph-deps';
import { ThinkingStep } from '../thinking-step.enum';

/**
 * `emitStepStarted` is the single construction point for the
 * ANALYSIS_STEP_STARTED payload. That matters because EventEmitter2's signature
 * is `emit(event, ...values: any[])`, so `AnalysisStepStartedEvent` is enforced
 * nowhere at a call site — twelve nodes used to hand-write the literal, and a
 * node omitting a field compiled cleanly.
 *
 * These tests pin the payload shape. The node specs assert the same shape
 * independently at their own call sites, so together they catch a helper that
 * silently changes what it emits.
 *
 * What is NOT tested here, because the compiler owns it: passing a step outside
 * `ThinkingStep`, or omitting `conversationId` / `userId`. Those are build
 * errors now, which is the point of the helper.
 */
describe('emitStepStarted', () => {
  const state = { conversationId: 'conv-1', userId: 'user-1' };

  function createDeps() {
    return { eventEmitter: { emit: jest.fn() } };
  }

  it('emits the full payload under the ANALYSIS_STEP_STARTED name', () => {
    const deps = createDeps();

    emitStepStarted(deps as never, state, ThinkingStep.REFLECT);

    expect(deps.eventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(deps.eventEmitter.emit).toHaveBeenCalledWith(ANALYSIS_STEP_STARTED, {
      conversationId: 'conv-1',
      userId: 'user-1',
      step: ThinkingStep.REFLECT,
    });
  });

  it('carries the owner through — the listener scopes its write by it', () => {
    const deps = createDeps();

    emitStepStarted(deps as never, { conversationId: 'c', userId: 'owner-9' }, ThinkingStep.SAVE);

    // Regression guard: `userId` was added to this event for ownership scoping.
    // If the helper ever stops forwarding it, the listener mints a random id and
    // progress updates stop matching — the failure this indirection prevents.
    const [, payload] = deps.eventEmitter.emit.mock.calls[0];
    expect(payload.userId).toBe('owner-9');
  });

  it('emits every ThinkingStep member verbatim', () => {
    // The enum is a total Record key in STEP_LABELS, so a member reaching the
    // wire in a different form would silently lose its label.
    for (const step of Object.values(ThinkingStep)) {
      const deps = createDeps();
      emitStepStarted(deps as never, state, step);
      const [, payload] = deps.eventEmitter.emit.mock.calls[0];
      expect(payload.step).toBe(step);
    }
  });
});
