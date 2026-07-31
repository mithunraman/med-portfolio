import type { ConfigService } from '@nestjs/config';
import { Pool } from '../llm-pools';
import { ModelConfigService } from '../model-config.service';
import { Stage, VARIANTS } from '../model-variants';

const endpoint = { apiKey: 'az-key', baseURL: 'https://res.services.ai.azure.com/openai/v1/' };

/**
 * Build a ConfigService stub backed by a plain key→value map. Only the keys the
 * service reads (`app.llm.variant` and the provider credentials) need entries.
 */
function configStub(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const ALL_STAGES = Object.values(Stage);

describe('ModelConfigService', () => {
  describe('resolve()', () => {
    it('resolves every stage for the default OpenAI variant (A)', () => {
      const service = new ModelConfigService(
        configStub({ 'app.llm.variant': 'A', 'app.llm.pools': { [Pool.OpenAI]: [endpoint] } })
      );

      expect(service.activeVariant).toBe('A');
      for (const stage of ALL_STAGES) {
        expect(service.resolve(stage)).toEqual(VARIANTS.A[stage]);
        expect(service.resolve(stage).provider).toBe('openai');
      }
    });

    it('resolves every stage to Azure Foundry DeepSeek Flash for variant D', () => {
      const service = new ModelConfigService(
        configStub({
          'app.llm.variant': 'D',
          'app.llm.pools': { [Pool.Analysis]: [endpoint] },
        })
      );

      expect(service.activeVariant).toBe('D');
      for (const stage of ALL_STAGES) {
        const target = service.resolve(stage);
        expect(target).toEqual({
          provider: 'azure-foundry',
          model: 'DeepSeek-V4-Flash',
          pool: Pool.Analysis,
          thinkMode: 'off',
          structuredMethod: 'jsonSchema',
        });
      }
    });

    it('splits variant F across two pools and two models', () => {
      const service = new ModelConfigService(
        configStub({
          'app.llm.variant': 'F',
          'app.llm.pools': {
            [Pool.Interactive]: [endpoint],
            [Pool.Analysis]: [endpoint],
          },
        })
      );

      // Cleaning is the interactive path (user-paced, blocks the message
      // appearing) and uses native function calling — the jsonSchema workaround
      // is DeepSeek's constraint, not nano's.
      expect(service.resolve(Stage.Cleaning)).toEqual({
        provider: 'azure-foundry',
        model: 'gpt-5.4-nano',
        pool: Pool.Interactive,
        thinkMode: 'off',
        structuredMethod: 'functionCalling',
      });

      // Every other stage is the machine-paced analysis burst.
      for (const stage of ALL_STAGES.filter((s) => s !== Stage.Cleaning)) {
        expect(service.resolve(stage)).toEqual({
          provider: 'azure-foundry',
          model: 'DeepSeek-V4-Flash',
          pool: Pool.Analysis,
          thinkMode: 'off',
          structuredMethod: 'jsonSchema',
        });
      }
    });
  });

  describe('poolsInUse()', () => {
    it('reports the provider pool for a single-provider variant', () => {
      const service = new ModelConfigService(
        configStub({ 'app.llm.variant': 'A', 'app.llm.pools': { [Pool.OpenAI]: [endpoint] } })
      );
      expect(service.poolsInUse()).toEqual(new Set(['openai']));
    });

    it('reports every distinct Foundry pool a variant draws from', () => {
      const service = new ModelConfigService(
        configStub({
          'app.llm.variant': 'F',
          'app.llm.pools': {
            [Pool.Interactive]: [endpoint],
            [Pool.Analysis]: [endpoint],
          },
        })
      );
      expect(service.poolsInUse()).toEqual(new Set([Pool.Interactive, Pool.Analysis]));
    });
  });

  describe('startup validation', () => {
    it('throws on an unknown variant', () => {
      expect(() => new ModelConfigService(configStub({ 'app.llm.variant': 'Z' }))).toThrow(
        /Invalid LLM_VARIANT 'Z'/
      );
    });

    it('throws when variant D has no endpoints for the pool it uses', () => {
      // Missing entirely...
      expect(() => new ModelConfigService(configStub({ 'app.llm.variant': 'D' }))).toThrow(
        /pool 'analysis' but no endpoints are configured/
      );

      // ...and present-but-empty (all indexed pairs absent → []).
      expect(
        () =>
          new ModelConfigService(
            configStub({ 'app.llm.variant': 'D', 'app.llm.pools': { analysis: [] } })
          )
      ).toThrow(/AZURE_FOUNDRY_ANALYSIS_API_KEY_1/);
    });

    it('throws when a MULTI-pool variant configures only one of its pools', () => {
      // The failure mode per-pool validation exists for: "some Foundry endpoint
      // is configured" was true here, yet the cleaning stage had no key at all.
      expect(
        () =>
          new ModelConfigService(
            configStub({
              'app.llm.variant': 'F',
              'app.llm.pools': { [Pool.Analysis]: [endpoint] },
            })
          )
      ).toThrow(/pool 'interactive' but no endpoints are configured/);
    });

    it('applies the same per-pool guard to the provider pools', () => {
      // These used to be two hand-written branches (an `if` for OpenRouter, a
      // throw in the LLMService constructor for OpenAI). They are now the same
      // loop as Foundry's, which is the point: one credential plane, one check.
      expect(() => new ModelConfigService(configStub({ 'app.llm.variant': 'B' }))).toThrow(
        /pool 'openrouter' but no endpoints are configured.*OPENROUTER_API_KEY_1/s
      );
      expect(() => new ModelConfigService(configStub({ 'app.llm.variant': 'A' }))).toThrow(
        /pool 'openai' but no endpoints are configured.*OPENAI_API_KEY_1/s
      );
    });
  });
});
