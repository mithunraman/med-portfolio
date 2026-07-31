import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MetricsModule } from '../../common/metrics';
import { parseFoundryPools, rateLimitPolicy } from '../../config/app.config';
import { LlmEndpointResolver } from '../llm-endpoint.resolver';
import { LLMModule } from '../llm.module';
import { Pool } from '../llm-pools';
import { LlmRateLimiterService } from '../llm-rate-limiter.service';
import { ModelConfigService } from '../model-config.service';
import { Stage } from '../model-variants';

/**
 * End-to-end wiring test for the pooling feature: boots the REAL LLMModule DI
 * graph (ModelConfigService → LlmEndpointResolver → LlmRateLimiterService →
 * LLMService) and asserts a variant's pool topology arrives intact at every layer.
 *
 * The per-layer specs each verify their own unit in isolation with a stubbed
 * neighbour, so none of them can catch a mismatch BETWEEN layers — e.g. the
 * resolver naming buckets one way and the limiter keying them another, or the
 * startup credential guard passing for a pool that then gets no bucket. That
 * seam is exactly what pooling introduced, so it needs its own test.
 *
 * Config is produced by the real `parseFoundryPools` / `rateLimitPolicy`, so the
 * env→config transformation under test is the production one; only the env-schema
 * plumbing (Zod) is bypassed. No network: nothing here calls a provider.
 *
 * This is the nearest offline equivalent of the live Variant F smoke test, which
 * additionally needs real Azure credentials to confirm the nano deployment
 * accepts `temperature` and honours `functionCalling`.
 */

const INTERACTIVE_URL = 'https://nano-resource.services.ai.azure.com/openai/v1/';
const ANALYSIS_URL_1 = 'https://deepseek-1.services.ai.azure.com/openai/v1/';
const ANALYSIS_URL_2 = 'https://deepseek-2.services.ai.azure.com/openai/v1/';

/** Env exactly as an operator would set it for Variant F (see .env.example). */
const VARIANT_F_ENV: NodeJS.ProcessEnv = {
  AZURE_FOUNDRY_INTERACTIVE_API_KEY_1: 'nano-key',
  AZURE_FOUNDRY_INTERACTIVE_BASE_URL_1: INTERACTIVE_URL,
  AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'deepseek-key-1',
  AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: ANALYSIS_URL_1,
  AZURE_FOUNDRY_ANALYSIS_API_KEY_2: 'deepseek-key-2',
  AZURE_FOUNDRY_ANALYSIS_BASE_URL_2: ANALYSIS_URL_2,
};

async function bootModule(variant: string, env: NodeJS.ProcessEnv) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        // LLMModule does not import ConfigModule itself — it relies on the app's
        // global one (and on MetricsModule being @Global). Mirror both here so
        // this exercises the same resolution path production uses.
        isGlobal: true,
        load: [
          () => ({
            app: {
              openai: { apiKey: 'sk-test' },
              assemblyai: { apiKey: 'aai-test', baseUrl: 'https://api.eu.assemblyai.com' },
              llm: {
                variant,
                rateLimit: {
                  default: rateLimitPolicy(18),
                  byPool: {
                    [Pool.Interactive]: rateLimitPolicy(60),
                    [Pool.Analysis]: rateLimitPolicy(35),
                  },
                },
              },
              azureFoundry: { pools: parseFoundryPools(env) },
            },
          }),
        ],
      }),
      // The real @Global MetricsModule, as app.module.ts imports it. Its OTel
      // meters are no-ops without an exporter, so this needs no stubbing and
      // keeps the graph identical to production.
      MetricsModule,
      LLMModule,
    ],
  }).compile();

  return moduleRef;
}

describe('LLMModule wiring (pool topology end-to-end)', () => {
  describe('Variant F', () => {
    let moduleRef: Awaited<ReturnType<typeof bootModule>>;

    beforeAll(async () => {
      moduleRef = await bootModule('F', VARIANT_F_ENV);
    });

    afterAll(async () => {
      await moduleRef?.close().catch(() => undefined);
    });

    it('constructs the whole LLM DI graph', () => {
      expect(moduleRef.get(ModelConfigService).activeVariant).toBe('F');
      expect(moduleRef.get(LlmEndpointResolver)).toBeDefined();
      expect(moduleRef.get(LlmRateLimiterService)).toBeDefined();
    });

    it('routes cleaning to the interactive pool and the graph stages to analysis', () => {
      const modelConfig = moduleRef.get(ModelConfigService);
      const resolver = moduleRef.get(LlmEndpointResolver);

      const cleaning = resolver.resolveBucket(modelConfig.resolve(Stage.Cleaning), 'conv-1');
      const reflect = resolver.resolveBucket(modelConfig.resolve(Stage.Reflect), 'conv-1');

      // Same conversation, two pools — the interactive path must not share a
      // bucket with the analysis burst it runs alongside.
      expect(cleaning.pool).toBe(Pool.Interactive);
      expect(cleaning.endpoint?.baseURL).toBe(INTERACTIVE_URL);
      expect(reflect.pool).toBe(Pool.Analysis);
      expect(reflect.bucketKey).not.toBe(cleaning.bucketKey);
    });

    it('gives every bucket a limiter under the same key the resolver hands out', async () => {
      const resolver = moduleRef.get(LlmEndpointResolver);
      const limiter = moduleRef.get(LlmRateLimiterService);

      // The cross-layer contract: a key the resolver can emit must be a key the
      // limiter accepts. A mismatch here throws rather than silently unbucketing.
      for (const { bucketKey } of resolver.buckets()) {
        expect(() => limiter.counts(bucketKey)).not.toThrow();
      }

      expect(
        resolver
          .buckets()
          .map((b) => b.bucketKey)
          .sort()
      ).toEqual(['analysis:0', 'analysis:1', 'interactive:0']);
    });

    it('applies each pool’s configured cap to its limiters', async () => {
      const limiter = moduleRef.get(LlmRateLimiterService);
      const capOf = (key: string) =>
        (
          limiter as unknown as {
            limiters: Map<string, { currentReservoir: () => Promise<number | null> }>;
          }
        ).limiters
          .get(key)!
          .currentReservoir();

      expect(await capOf('interactive:0')).toBe(60);
      expect(await capOf('analysis:0')).toBe(35);
      expect(await capOf('analysis:1')).toBe(35); // every key in a pool gets the pool's cap
    });

    it('shards analysis conversations across both keys, but pins each one', () => {
      const modelConfig = moduleRef.get(ModelConfigService);
      const resolver = moduleRef.get(LlmEndpointResolver);
      const target = modelConfig.resolve(Stage.Reflect);

      const seen = new Set<string>();
      for (let i = 0; i < 50; i++) {
        seen.add(resolver.resolveBucket(target, `conversation-${i}`).bucketKey);
      }
      expect(seen).toEqual(new Set(['analysis:0', 'analysis:1']));

      // …while a single conversation stays on one key, which is why extra keys
      // raise aggregate capacity but never one journey's speed.
      const pinned = resolver.resolveBucket(target, 'conversation-7').bucketKey;
      for (let i = 0; i < 10; i++) {
        expect(resolver.resolveBucket(target, 'conversation-7').bucketKey).toBe(pinned);
      }
    });
  });

  describe('startup validation', () => {
    it('refuses to boot when a pool the variant uses has no credentials', async () => {
      // Variant F needs BOTH pools. Configuring only analysis used to satisfy a
      // provider-level check ("some Foundry endpoint exists") while leaving the
      // cleaning stage with no key at all — the failure per-pool validation exists
      // to catch, and it must happen at boot, not on the first cleaning call.
      const analysisOnly = {
        AZURE_FOUNDRY_ANALYSIS_API_KEY_1: 'deepseek-key-1',
        AZURE_FOUNDRY_ANALYSIS_BASE_URL_1: ANALYSIS_URL_1,
      };

      await expect(bootModule('F', analysisOnly)).rejects.toThrow(
        /pool 'interactive' but no endpoints are configured.*AZURE_FOUNDRY_INTERACTIVE_API_KEY_1/s
      );
    });

    it('boots the OpenAI variant with no Foundry credentials at all', async () => {
      // Variant A uses only the implicit single-key `openai` pool, so no Foundry
      // config is required and exactly one bucket exists.
      const moduleRef = await bootModule('A', {});
      const resolver = moduleRef.get(LlmEndpointResolver);

      expect(resolver.buckets()).toEqual([{ bucketKey: 'openai:0', pool: 'openai', index: 0 }]);
      await moduleRef.close();
    });
  });
});
