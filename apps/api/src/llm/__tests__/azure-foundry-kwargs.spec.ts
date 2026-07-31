import { Pool } from '../llm-pools';
import { azureFoundryKwargs } from '../llm.service';
import type { ModelTarget } from '../llm.service';
import type { ThinkMode } from '../llm.service';

/**
 * Pins the Foundry/DeepSeek reasoning wire-format mapping. This guards the
 * mapping shape only — notably that `max` stays `max` (DeepSeek's value) and is
 * NOT silently downgraded to OpenAI's `high`. It deliberately does NOT assert the
 * endpoint accepts these values: `high`/`max` are unverified against the live
 * Foundry deployment (an endpoint 400 is only catchable by a live smoke test,
 * per the TODO in azureFoundryKwargs), so a green test here is not endpoint proof.
 */
function target(thinkMode?: ThinkMode): Extract<ModelTarget, { provider: 'azure-foundry' }> {
  // The pool is irrelevant to the wire format — reasoning params are a property of
  // the model, not of which credential serves it.
  return { provider: 'azure-foundry', model: 'DeepSeek-V4-Flash', pool: Pool.Analysis, thinkMode };
}

describe('azureFoundryKwargs', () => {
  it('sends NO reasoning param for off (Foundry rejects thinking/enable_thinking; Flash is non-thinking by default)', () => {
    expect(azureFoundryKwargs(target('off'))).toEqual({});
  });

  it('sends NO reasoning param when thinkMode is undefined', () => {
    expect(azureFoundryKwargs(target(undefined))).toEqual({});
  });

  it('maps high to reasoning_effort: high', () => {
    expect(azureFoundryKwargs(target('high'))).toEqual({ reasoning_effort: 'high' });
  });

  it('maps max to reasoning_effort: max — NOT downgraded to OpenAI-style high', () => {
    expect(azureFoundryKwargs(target('max'))).toEqual({ reasoning_effort: 'max' });
  });
});
