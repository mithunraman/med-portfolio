import { Logger } from '@nestjs/common';
import { Pool } from '../../llm/llm-pools';
import { parseFoundryEndpoints, parseFoundryPools, rateLimitPolicy } from '../app.config';

const URL_A = 'https://res-a.services.ai.azure.com/openai/v1/';
const URL_B = 'https://res-b.services.ai.azure.com/openai/v1/';

describe('parseFoundryEndpoints', () => {
  it('returns an empty list when no endpoints are configured', () => {
    expect(parseFoundryEndpoints({}, Pool.Analysis)).toEqual([]);
  });

  it('parses distinct indexed pairs into an ordered list', () => {
    const endpoints = parseFoundryEndpoints(
      {
        AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'key-1',
        AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: URL_A,
        AZURE_FOUNDRY_ANALYSIS_API_KEY_2: 'key-2',
        AZURE_FOUNDRY_ANALYSIS_BASE_URL_2: URL_B,
      },
      Pool.Analysis
    );

    expect(endpoints).toEqual([
      { apiKey: 'key-1', baseURL: URL_A },
      { apiKey: 'key-2', baseURL: URL_B },
    ]);
  });

  it('reads only its OWN pool’s vars', () => {
    const env = {
      AZURE_FOUNDRY_INTERACTIVE_API_KEY_1: 'nano-key',
      AZURE_FOUNDRY_INTERACTIVE_BASE_URL_1: URL_A,
      AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'deepseek-key',
      AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: URL_B,
    };

    // Pools are independent namespaces: neither picks up the other's keys.
    expect(parseFoundryEndpoints(env, Pool.Interactive)).toEqual([
      { apiKey: 'nano-key', baseURL: URL_A },
    ]);
    expect(parseFoundryEndpoints(env, Pool.Analysis)).toEqual([
      { apiKey: 'deepseek-key', baseURL: URL_B },
    ]);
  });

  it('throws on a half-configured pair (key without URL, or vice versa), naming the pool', () => {
    expect(() =>
      parseFoundryEndpoints({ AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'key-1' }, Pool.Analysis)
    ).toThrow(/pool 'analysis' endpoint 1 is half-configured/);
    expect(() =>
      parseFoundryEndpoints({ AZURE_FOUNDRY_INTERACTIVE_BASE_URL_2: URL_A }, Pool.Interactive)
    ).toThrow(/pool 'interactive' endpoint 2 is half-configured/);
  });

  it('throws on an invalid base URL', () => {
    expect(() =>
      parseFoundryEndpoints(
        {
          AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'key-1',
          AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: 'not-a-url',
        },
        Pool.Analysis
      )
    ).toThrow(/AZURE_FOUNDRY_ANALYSIS_BASE_URL_1 must be a valid URL/);
  });

  it('rejects two keys of ONE resource within a pool (duplicate base URL → shared quota)', () => {
    // The "Key 1"/"Key 2" footgun: one resource's two access keys, same base URL.
    // Two limiters would then pace against a single quota → sustained 429s.
    expect(() =>
      parseFoundryEndpoints(
        {
          AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'resource-a-key-1',
          AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: URL_A,
          AZURE_FOUNDRY_ANALYSIS_API_KEY_2: 'resource-a-key-2',
          AZURE_FOUNDRY_ANALYSIS_BASE_URL_2: URL_A,
        },
        Pool.Analysis
      )
    ).toThrow(/pool 'analysis' endpoints 1 and 2 share the same base URL/);
  });

  it('detects duplicate base URLs that differ only by trailing slash or host case', () => {
    expect(() =>
      parseFoundryEndpoints(
        {
          AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'key-1',
          AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: 'https://res-a.services.ai.azure.com/openai/v1/',
          AZURE_FOUNDRY_ANALYSIS_API_KEY_2: 'key-2',
          AZURE_FOUNDRY_ANALYSIS_BASE_URL_2: 'https://RES-A.services.ai.azure.com/openai/v1',
        },
        Pool.Analysis
      )
    ).toThrow(/share the same base URL/);
  });
});

describe('rateLimitPolicy', () => {
  it('derives minTime from the cap so pacing cannot drift out of lockstep', () => {
    // There is deliberately no LLM_MIN_TIME env var: minTime is a function of the
    // cap, so exposing it separately would let the two disagree.
    expect(rateLimitPolicy(60)).toEqual({ rpm: 60, minTimeMs: 1000 }); // interactive
    expect(rateLimitPolicy(35)).toEqual({ rpm: 35, minTimeMs: 1714 }); // analysis
    expect(rateLimitPolicy(18)).toEqual({ rpm: 18, minTimeMs: 3333 }); // default
  });

  it('floors rather than rounds, so pacing is never faster than the cap allows', () => {
    // 60000/35 = 1714.28…; rounding UP to 1715 would be safe but rounding to the
    // nearest could exceed the cap over a full window. Flooring keeps the spacing
    // marginally tighter than exact, which the reservoir then backstops.
    expect(rateLimitPolicy(35).minTimeMs).toBe(1714);
    expect(rateLimitPolicy(7).minTimeMs).toBe(8571); // 8571.43… → 8571
  });

  it('spaces a full analysis turn predictably', () => {
    // Documents the number quoted in the docs and env template: at 35 rpm a
    // 9-call graph turn spends ~15s in pacing alone, before any model latency.
    const { minTimeMs } = rateLimitPolicy(35);
    expect(Math.round((minTimeMs * 9) / 1000)).toBe(15);
  });
});

describe('parseFoundryPools', () => {
  it('returns an entry for every pool, empty where unconfigured', () => {
    const pools = parseFoundryPools({
      AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'key-1',
      AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: URL_A,
    });

    // Every pool is present so downstream lookups never hit undefined; an unused
    // pool simply has no endpoints and gets no buckets.
    expect(pools).toEqual({
      [Pool.Interactive]: [],
      [Pool.Analysis]: [{ apiKey: 'key-1', baseURL: URL_A }],
    });
  });

  it('WARNS but does not throw when two pools share a base URL', () => {
    // Across pools a shared resource is usually fine — Azure assigns quota per
    // DEPLOYMENT, and two pools on one resource normally means two deployments.
    // But if they do share a quota the separate limiters can't pace it, and that
    // is near-impossible to attribute after the fact — hence a startup line.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(() =>
      parseFoundryPools({
        AZURE_FOUNDRY_INTERACTIVE_API_KEY_1: 'nano-key',
        AZURE_FOUNDRY_INTERACTIVE_BASE_URL_1: URL_A,
        AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'deepseek-key',
        AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: URL_A,
      })
    ).not.toThrow();

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/'interactive' and 'analysis'/));
    warn.mockRestore();
  });

  it('does not warn when pools use distinct resources', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    parseFoundryPools({
      AZURE_FOUNDRY_INTERACTIVE_API_KEY_1: 'nano-key',
      AZURE_FOUNDRY_INTERACTIVE_BASE_URL_1: URL_A,
      AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'deepseek-key',
      AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: URL_B,
    });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
