import { AnalysisRunStatus } from '@acme/shared';
import { analysisRunTombstoneUpdate } from '../analysis-runs.repository';

describe('analysisRunTombstoneUpdate', () => {
  it('scrubs every sensitive field on an AnalysisRun via $set', () => {
    const update = analysisRunTombstoneUpdate();

    expect(update.$set.status).toBe(AnalysisRunStatus.DELETED);
    expect(update.$set.langGraphThreadId).toBe('[deleted]');
    expect(update.$set.currentStep).toBeNull();
    expect(update.$set.currentQuestion).toBeNull();
    expect(update.$set.error).toBeNull();
  });
});
