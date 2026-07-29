import { cloudflareKwargs } from '../llm.service';
import type { ModelTarget, ThinkMode } from '../llm.service';

/**
 * Pins the native-Cloudflare wire format. The load-bearing behaviours:
 *  - the token budget rides as `max_completion_tokens` (the field this endpoint honours),
 *    NOT ChatOpenAI's `max_tokens`;
 *  - reasoning maps to the standard OpenAI `reasoning_effort` (gpt-oss uses low|medium|high),
 *    `off`/unset sends nothing, `max` clamps to `high`;
 *  - OpenRouter-only params (`reasoning`, `provider`) never leak in.
 */
function target(thinkMode?: ThinkMode): Extract<ModelTarget, { provider: 'cloudflare' }> {
  return { provider: 'cloudflare', model: '@cf/openai/gpt-oss-120b', thinkMode };
}

describe('cloudflareKwargs', () => {
  it('sends the token budget as max_completion_tokens', () => {
    expect(cloudflareKwargs(target(), 2000)).toEqual({ max_completion_tokens: 2000 });
  });

  it('maps low to reasoning_effort: low', () => {
    expect(cloudflareKwargs(target('low'), 2000)).toEqual({
      max_completion_tokens: 2000,
      reasoning_effort: 'low',
    });
  });

  it('maps high to reasoning_effort: high', () => {
    expect(cloudflareKwargs(target('high'), 2000)).toEqual({
      max_completion_tokens: 2000,
      reasoning_effort: 'high',
    });
  });

  it('clamps max to reasoning_effort: high (gpt-oss has no xhigh tier)', () => {
    expect(cloudflareKwargs(target('max'), 2000)).toEqual({
      max_completion_tokens: 2000,
      reasoning_effort: 'high',
    });
  });

  it('omits reasoning_effort for off / unset', () => {
    expect(cloudflareKwargs(target('off'), 500)).not.toHaveProperty('reasoning_effort');
    expect(cloudflareKwargs(target(undefined), 500)).not.toHaveProperty('reasoning_effort');
  });

  it('never emits OpenRouter-only params (reasoning / provider)', () => {
    const kwargs = cloudflareKwargs(target('low'), 2000);
    expect(kwargs).not.toHaveProperty('reasoning');
    expect(kwargs).not.toHaveProperty('provider');
  });
});
