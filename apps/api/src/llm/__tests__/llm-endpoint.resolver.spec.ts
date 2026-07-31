import type { ConfigService } from '@nestjs/config';
import type { LlmEndpoint, LlmPools } from '../../config/app.config';
import { LlmEndpointResolver } from '../llm-endpoint.resolver';
import { Pool } from '../llm-pools';
import type { ModelTarget } from '../llm.service';
import type { ModelConfigService } from '../model-config.service';

function configStub(pools: Partial<LlmPools>): ConfigService {
  return {
    get: jest.fn((key: string) => (key === 'app.llm.pools' ? pools : undefined)),
  } as unknown as ConfigService;
}

function modelConfigStub(poolsInUse: Pool[]): ModelConfigService {
  return { poolsInUse: () => new Set(poolsInUse) } as unknown as ModelConfigService;
}

const ep = (n: number): LlmEndpoint => ({
  apiKey: `key-${n}`,
  baseURL: `https://res-${n}.services.ai.azure.com/openai/v1/`,
});

const foundryTarget = (pool: Pool): ModelTarget => ({
  provider: 'azure-foundry',
  model: 'deployment',
  pool,
});

const openaiTarget: ModelTarget = {
  provider: 'openai',
  pool: Pool.OpenAI,
  model: 'gpt-test',
};

function build(
  pools: Partial<LlmPools>,
  inUse = Object.keys(pools) as Pool[]
): LlmEndpointResolver {
  return new LlmEndpointResolver(configStub(pools), modelConfigStub(inUse));
}

describe('LlmEndpointResolver', () => {
  describe('buckets()', () => {
    it('creates one bucket per key, per pool, namespaced by pool', () => {
      const resolver = build({
        [Pool.Interactive]: [ep(1)],
        [Pool.Analysis]: [ep(2), ep(3)],
      });

      expect(resolver.buckets().map((b) => b.bucketKey)).toEqual([
        'interactive:0',
        'analysis:0',
        'analysis:1',
      ]);
    });

    it('buckets a provider pool exactly like a Foundry one', () => {
      // No special case: openai's credentials come from the same config
      // structure, so it produces buckets by the same rule. Nothing about a
      // pool's bucketing depends on which provider it serves.
      const resolver = build({ [Pool.OpenAI]: [ep(1)] });
      expect(resolver.buckets()).toEqual([{ bucketKey: 'openai:0', pool: 'openai', index: 0 }]);
    });

    it('ignores pools the active variant does not use', () => {
      // Interactive is configured but unused: no bucket, so no limiter, so no
      // requirement to configure it at all.
      const resolver = build({ [Pool.Interactive]: [ep(1)], [Pool.Analysis]: [ep(2)] }, [
        Pool.Analysis,
      ]);
      expect(resolver.buckets().map((b) => b.bucketKey)).toEqual(['analysis:0']);
    });
  });

  describe('resolveBucket()', () => {
    it('is deterministic: the same key always resolves to the same endpoint', () => {
      const resolver = build({ [Pool.Analysis]: [ep(1), ep(2)] });
      const first = resolver.resolveBucket(foundryTarget(Pool.Analysis), 'conversation-abc');

      for (let i = 0; i < 20; i++) {
        expect(resolver.resolveBucket(foundryTarget(Pool.Analysis), 'conversation-abc')).toEqual(
          first
        );
      }
    });

    it('always returns an index within the pool’s range', () => {
      const resolver = build({ [Pool.Analysis]: [ep(1), ep(2), ep(3)] });

      for (let i = 0; i < 100; i++) {
        const { index } = resolver.resolveBucket(foundryTarget(Pool.Analysis), `conversation-${i}`);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(3);
      }
    });

    it('spreads distinct keys across all of a pool’s buckets', () => {
      const resolver = build({ [Pool.Analysis]: [ep(1), ep(2)] });
      const seen = new Set<string>();
      for (let i = 0; i < 50; i++) {
        seen.add(
          resolver.resolveBucket(foundryTarget(Pool.Analysis), `conversation-${i}`).bucketKey
        );
      }

      // Over a healthy sample both buckets must be used — proves it is not a
      // constant-0 hash.
      expect(seen).toEqual(new Set(['analysis:0', 'analysis:1']));
    });

    it('pins to endpoint 0 for a missing/empty routing key', () => {
      const resolver = build({ [Pool.Analysis]: [ep(1), ep(2)] });
      expect(resolver.resolveBucket(foundryTarget(Pool.Analysis), '').index).toBe(0);
    });

    it('always returns 0 when a pool has a single key (N=1 fast path)', () => {
      const resolver = build({ [Pool.Interactive]: [ep(1)] });
      expect(resolver.resolveBucket(foundryTarget(Pool.Interactive), 'anything').index).toBe(0);
      expect(resolver.resolveBucket(foundryTarget(Pool.Interactive), 'another').index).toBe(0);
    });

    it('routes a non-Foundry target to its pool WITH credentials', () => {
      const resolver = build({ [Pool.OpenAI]: [ep(1)] });
      expect(resolver.resolveBucket(openaiTarget, 'conversation-abc')).toEqual({
        bucketKey: 'openai:0',
        pool: 'openai',
        index: 0,
        endpoint: ep(1),
      });
    });

    it('shards a PROVIDER pool across multiple keys, exactly like a Foundry pool', () => {
      // Newly possible, and the clearest evidence the two credential planes
      // merged: before unification an OpenAI key lived on LLMService as a single
      // field, so N>1 was not expressible at all. Nothing here is Foundry-aware.
      const resolver = build({ [Pool.OpenAI]: [ep(1), ep(2)] });
      const seen = new Set<string>();
      for (let i = 0; i < 50; i++) {
        seen.add(resolver.resolveBucket(openaiTarget, `conversation-${i}`).bucketKey);
      }
      expect(seen).toEqual(new Set(['openai:0', 'openai:1']));
    });

    it('throws, naming the pool, rather than returning an endpoint-less bucket', () => {
      // Startup validation makes this unreachable in production. It is asserted
      // because the failure it replaces — an undefined endpoint flowing into an
      // auth error against an empty key — is far harder to attribute.
      const resolver = build({}, [Pool.OpenAI]);
      expect(() => resolver.resolveBucket(openaiTarget, 'conv-1')).toThrow(
        /No LLM endpoints configured for pool 'openai'/
      );
    });

    it('keeps pools independent: the same routing key hits both pools separately', () => {
      const resolver = build({
        [Pool.Interactive]: [ep(1)],
        [Pool.Analysis]: [ep(2), ep(3)],
      });

      const interactive = resolver.resolveBucket(foundryTarget(Pool.Interactive), 'conv-1');
      const analysis = resolver.resolveBucket(foundryTarget(Pool.Analysis), 'conv-1');

      // One conversation draws from BOTH pools — cleaning from interactive, the
      // graph stages from analysis — so these must never collapse to one bucket.
      expect(interactive.pool).toBe(Pool.Interactive);
      expect(analysis.pool).toBe(Pool.Analysis);
      expect(interactive.bucketKey).not.toBe(analysis.bucketKey);
    });
  });

  describe('bucket/credential invariant', () => {
    it('always returns the credentials belonging to the bucket it names', () => {
      // THE core invariant: the key whose limiter gates a call is the key whose
      // credentials send it. Returning both in one value is what makes this hold
      // by construction — this test would catch any regression to a bare index
      // that callers look up separately.
      const pools = {
        [Pool.Interactive]: [ep(1)],
        [Pool.Analysis]: [ep(2), ep(3)],
      };
      const resolver = build(pools);

      for (const pool of [Pool.Interactive, Pool.Analysis]) {
        for (let i = 0; i < 100; i++) {
          const resolved = resolver.resolveBucket(foundryTarget(pool), `conversation-${i}`);
          expect(resolved.bucketKey).toBe(`${resolved.pool}:${resolved.index}`);
          expect(resolved.endpoint).toBe(pools[pool][resolved.index]);
        }
      }
    });
  });
});
