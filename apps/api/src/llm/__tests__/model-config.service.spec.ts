import type { ConfigService } from '@nestjs/config';
import { ModelConfigService } from '../model-config.service';
import { Stage, VARIANTS } from '../model-variants';

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
        configStub({ 'app.llm.variant': 'A', 'app.openai.apiKey': 'sk-test' })
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
          'app.azureFoundry.apiKey': 'az-key',
          'app.azureFoundry.baseUrl': 'https://res.services.ai.azure.com/openai/v1/',
        })
      );

      expect(service.activeVariant).toBe('D');
      for (const stage of ALL_STAGES) {
        const target = service.resolve(stage);
        expect(target).toEqual({
          provider: 'azure-foundry',
          model: 'DeepSeek-V4-Flash',
          thinkMode: 'off',
          structuredMethod: 'jsonSchema',
        });
      }
    });

    it('resolves every stage to native Cloudflare gpt-oss (low reasoning) for variant G', () => {
      const service = new ModelConfigService(
        configStub({
          'app.llm.variant': 'G',
          'app.cloudflare.accountId': 'cf-acct',
          'app.cloudflare.apiToken': 'cf-token',
        })
      );

      expect(service.activeVariant).toBe('G');
      for (const stage of ALL_STAGES) {
        expect(service.resolve(stage)).toEqual({
          provider: 'cloudflare',
          model: '@cf/openai/gpt-oss-120b',
          thinkMode: 'low',
          structuredMethod: 'functionCalling',
        });
      }
    });

    it('resolves every stage to native Cloudflare GLM-4.7-Flash (low reasoning) for variant H', () => {
      const service = new ModelConfigService(
        configStub({
          'app.llm.variant': 'H',
          'app.cloudflare.accountId': 'cf-acct',
          'app.cloudflare.apiToken': 'cf-token',
        })
      );

      expect(service.activeVariant).toBe('H');
      for (const stage of ALL_STAGES) {
        expect(service.resolve(stage)).toEqual({
          provider: 'cloudflare',
          model: '@cf/zai-org/glm-4.7-flash',
          thinkMode: 'low',
          structuredMethod: 'functionCalling',
        });
      }
    });
  });

  describe('startup validation', () => {
    it('throws on an unknown variant', () => {
      expect(() => new ModelConfigService(configStub({ 'app.llm.variant': 'Z' }))).toThrow(
        /Invalid LLM_VARIANT 'Z'/
      );
    });

    it('throws when variant D lacks the Azure Foundry API key', () => {
      expect(
        () =>
          new ModelConfigService(
            configStub({
              'app.llm.variant': 'D',
              'app.azureFoundry.baseUrl': 'https://res.services.ai.azure.com/openai/v1/',
            })
          )
      ).toThrow(/uses Azure Foundry but AZURE_FOUNDRY_API_KEY/);
    });

    it('throws when variant D lacks the Azure Foundry base URL', () => {
      expect(
        () =>
          new ModelConfigService(
            configStub({ 'app.llm.variant': 'D', 'app.azureFoundry.apiKey': 'az-key' })
          )
      ).toThrow(/uses Azure Foundry but AZURE_FOUNDRY_API_KEY/);
    });

    it('throws when variant B lacks the OpenRouter API key', () => {
      expect(() => new ModelConfigService(configStub({ 'app.llm.variant': 'B' }))).toThrow(
        /uses OpenRouter but OPENROUTER_API_KEY/
      );
    });

    it('throws when variant G lacks the Cloudflare account id', () => {
      expect(
        () =>
          new ModelConfigService(
            configStub({ 'app.llm.variant': 'G', 'app.cloudflare.apiToken': 'cf-token' })
          )
      ).toThrow(/uses Cloudflare but CLOUDFLARE_ACCOUNT_ID/);
    });

    it('throws when variant G lacks the Cloudflare API token', () => {
      expect(
        () =>
          new ModelConfigService(
            configStub({ 'app.llm.variant': 'G', 'app.cloudflare.accountId': 'cf-acct' })
          )
      ).toThrow(/uses Cloudflare but CLOUDFLARE_ACCOUNT_ID/);
    });

    it('does not require provider credentials for the OpenAI variant', () => {
      expect(() => new ModelConfigService(configStub({ 'app.llm.variant': 'A' }))).not.toThrow();
    });
  });
});
