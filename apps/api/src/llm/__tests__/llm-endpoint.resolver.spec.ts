import type { ConfigService } from '@nestjs/config';
import type { FoundryEndpoint } from '../../config/app.config';
import { LlmEndpointResolver } from '../llm-endpoint.resolver';
import type { ModelConfigService } from '../model-config.service';

function configStub(endpoints: FoundryEndpoint[]): ConfigService {
  return {
    get: jest.fn((key: string) => (key === 'app.azureFoundry.endpoints' ? endpoints : undefined)),
  } as unknown as ConfigService;
}

function modelConfigStub(usesFoundry: boolean): ModelConfigService {
  return { usesProvider: jest.fn((p: string) => p === 'azure-foundry' && usesFoundry) } as unknown as ModelConfigService;
}

const ep = (n: number): FoundryEndpoint => ({
  apiKey: `key-${n}`,
  baseURL: `https://res-${n}.services.ai.azure.com/openai/v1/`,
});

function build(endpoints: FoundryEndpoint[], usesFoundry = true): LlmEndpointResolver {
  return new LlmEndpointResolver(configStub(endpoints), modelConfigStub(usesFoundry));
}

describe('LlmEndpointResolver', () => {
  describe('count()', () => {
    it('is the number of endpoints when the active variant uses Foundry', () => {
      expect(build([ep(1), ep(2)]).count()).toBe(2);
    });

    it('collapses to 1 when the active variant does NOT use Foundry (single-key providers)', () => {
      // Endpoints may be configured, but if no stage routes to Foundry there is a
      // single quota bucket — the pre-rotation behavior.
      expect(build([ep(1), ep(2)], false).count()).toBe(1);
    });

    it('collapses to 1 when Foundry is used but no endpoints are configured', () => {
      expect(build([]).count()).toBe(1);
    });
  });

  describe('indexFor()', () => {
    it('is deterministic: the same key always resolves to the same endpoint', () => {
      const resolver = build([ep(1), ep(2)]);
      const first = resolver.indexFor('conversation-abc');
      for (let i = 0; i < 20; i++) {
        expect(resolver.indexFor('conversation-abc')).toBe(first);
      }
    });

    it('always returns an index within [0, count)', () => {
      const resolver = build([ep(1), ep(2), ep(3)]);
      for (let i = 0; i < 100; i++) {
        const idx = resolver.indexFor(`conversation-${i}`);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(3);
      }
    });

    it('spreads distinct keys across all buckets', () => {
      const resolver = build([ep(1), ep(2)]);
      const seen = new Set<number>();
      for (let i = 0; i < 50; i++) seen.add(resolver.indexFor(`conversation-${i}`));
      // Over a healthy sample both buckets must be used — proves it is not a
      // constant-0 hash.
      expect(seen).toEqual(new Set([0, 1]));
    });

    it('pins to endpoint 0 for a missing/empty routing key', () => {
      expect(build([ep(1), ep(2)]).indexFor('')).toBe(0);
    });

    it('always returns 0 when there is a single bucket (N=1 fast path)', () => {
      const resolver = build([ep(1)]);
      expect(resolver.indexFor('anything')).toBe(0);
      expect(resolver.indexFor('another')).toBe(0);
    });
  });

  it('exposes the configured endpoints indexed identically to the buckets', () => {
    const resolver = build([ep(1), ep(2)]);
    expect(resolver.endpoints).toEqual([ep(1), ep(2)]);
  });
});
