import { AnalysisRunStatus } from '@acme/shared';
import { analysisRunTombstoneUpdate } from '../analysis-runs.repository';

describe('analysisRunTombstoneUpdate', () => {
  it('scrubs every sensitive field on an AnalysisRun via $set', () => {
    const update = analysisRunTombstoneUpdate();

    expect(update.$set.status).toBe(AnalysisRunStatus.DELETED);
    expect(update.$set.currentStep).toBeNull();
    expect(update.$set.currentQuestion).toBeNull();
    expect(update.$set.error).toBeNull();
    expect(update.$set.reflectTrace).toBeNull();
    expect(update.$set.refineTrace).toBeNull();
  });

  it('preserves langGraphThreadId — it is the only handle to the checkpoint data', () => {
    // Regression guard. Clearing it left `checkpoints` / `checkpoint_writes` —
    // which hold the transcript and the drafted clinical entry — both retained
    // and unfindable, because the tombstone erased the pointer without deleting
    // what it pointed at. It is an internal id (`${conversationId}:${runNumber}`),
    // not personal data, so there is nothing to scrub.
    const update = analysisRunTombstoneUpdate();

    expect(update.$set).not.toHaveProperty('langGraphThreadId');
  });
});
