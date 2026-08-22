import { Types } from 'mongoose';
import { AnalysisStepStartedEvent } from '../../portfolio-graph/graph-deps';
import { AnalysisRunListener } from '../analysis-run.listener';
import { AnalysisRunsService } from '../analysis-runs.service';

/**
 * This listener sits on an untyped boundary. The event reaches it through
 * EventEmitter2's `emit(name, ...values: any[])` from 12 hand-written object
 * literals across the graph nodes; `AnalysisStepStartedEvent` is applied to none
 * of them, so a node omitting a field compiles cleanly.
 *
 * Two failure modes follow, and both used to be invisible:
 *
 *  - an absent id was MINTED by `new Types.ObjectId(undefined)` rather than
 *    rejected, so it matched no run and progress updates silently stopped;
 *  - a no-match returned `ok(null)`, which the service does not treat as an
 *    error, so the listener logged "Updated currentStep" regardless — a false
 *    success rather than merely a silent one.
 *
 * Note this path is genuinely fire-and-forget: there is no outbox behind it, so
 * throwing converts a false success into a logged warning, not a retry.
 */
describe('AnalysisRunListener', () => {
  const conversationId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  function createListener(updateCurrentStep: jest.Mock) {
    const service = { updateCurrentStep } as unknown as AnalysisRunsService;
    const listener = new AnalysisRunListener(service);
    return {
      listener,
      updateCurrentStep,
      debug: jest.spyOn(listener['logger'], 'debug').mockImplementation(),
      warn: jest.spyOn(listener['logger'], 'warn').mockImplementation(),
    };
  }

  const event = (overrides: Partial<AnalysisStepStartedEvent> = {}): AnalysisStepStartedEvent => ({
    conversationId,
    userId,
    step: 'reflect',
    ...overrides,
  });

  afterEach(() => jest.restoreAllMocks());

  it('records the step and logs success when a run matches', async () => {
    const { listener, updateCurrentStep, debug, warn } = createListener(
      jest.fn().mockResolvedValue(true)
    );

    await listener.handleStepStarted(event());

    expect(updateCurrentStep).toHaveBeenCalledTimes(1);
    const [convOid, userOid, step] = updateCurrentStep.mock.calls[0];
    expect(convOid.toString()).toBe(conversationId);
    expect(userOid.toString()).toBe(userId);
    expect(step).toBe('reflect');
    expect(debug).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns rather than claiming success when no active run matched', async () => {
    const { listener, debug, warn } = createListener(jest.fn().mockResolvedValue(false));

    await listener.handleStepStarted(event());

    // The regression: this used to log "Updated currentStep" on a no-match.
    expect(debug).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No active run matched'));
  });

  describe('untyped-event validation', () => {
    it.each(['userId', 'conversationId'])(
      'never touches the service when %s is absent',
      async (field) => {
        const { listener, updateCurrentStep, warn } = createListener(jest.fn());
        const bad = event();
        delete (bad as unknown as Record<string, unknown>)[field];

        // Swallowed by the fire-and-forget catch — the warning is the signal.
        await expect(listener.handleStepStarted(bad)).resolves.toBeUndefined();

        expect(updateCurrentStep).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`analysis.step.started: ${field} is missing or not a string`)
        );
      }
    );

    it('rejects an id that is present but not a string', async () => {
      const { listener, updateCurrentStep, warn } = createListener(jest.fn());
      const bad = { ...event(), userId: new Types.ObjectId() } as unknown as AnalysisStepStartedEvent;

      await listener.handleStepStarted(bad);

      // An ObjectId reaching an untyped boundary is the realistic producer slip:
      // it would previously have been re-wrapped and matched, masking the drift.
      expect(updateCurrentStep).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a string (got object)'));
    });
  });
});
