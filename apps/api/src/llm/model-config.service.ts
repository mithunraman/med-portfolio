import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ModelTarget } from './llm.service';
import { Stage, VARIANTS, type VariantKey, type VariantProfile } from './model-variants';

/**
 * Owns the stage→model policy: reads the active LLM variant once from validated
 * config and resolves each pipeline stage to a concrete model target. Nodes and
 * stages depend on this (never on the VARIANTS table directly), so a variant
 * flip is one env var with zero call-site edits, and tests can stub resolution.
 */
@Injectable()
export class ModelConfigService {
  private readonly variant: VariantKey;
  private readonly profile: VariantProfile;

  constructor(configService: ConfigService) {
    const variant = configService.get<VariantKey>('app.llm.variant');
    if (!variant || !(variant in VARIANTS)) {
      throw new Error(
        `Invalid LLM_VARIANT '${variant}'. Known variants: ${Object.keys(VARIANTS).join(', ')}`
      );
    }
    this.variant = variant;
    this.profile = VARIANTS[variant];
    this.assertCredentials(configService);
  }

  /**
   * Fail fast at startup if the active variant routes any stage to a provider
   * whose credentials are absent — rather than at the first request that hits it.
   */
  private assertCredentials(configService: ConfigService): void {
    const providers = new Set(Object.values(this.profile).map((t) => t.provider));
    if (providers.has('openrouter') && !configService.get<string>('app.openrouter.apiKey')) {
      throw new Error(
        `LLM_VARIANT '${this.variant}' uses OpenRouter but OPENROUTER_API_KEY is not set.`
      );
    }
    if (
      providers.has('azure-foundry') &&
      (!configService.get<string>('app.azureFoundry.apiKey') ||
        !configService.get<string>('app.azureFoundry.baseUrl'))
    ) {
      throw new Error(
        `LLM_VARIANT '${this.variant}' uses Azure Foundry but AZURE_FOUNDRY_API_KEY / AZURE_FOUNDRY_BASE_URL is not set.`
      );
    }
    if (
      providers.has('cloudflare') &&
      (!configService.get<string>('app.cloudflare.accountId') ||
        !configService.get<string>('app.cloudflare.apiToken'))
    ) {
      throw new Error(
        `LLM_VARIANT '${this.variant}' uses Cloudflare but CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN is not set.`
      );
    }
  }

  /** Resolve the provider+model target for a stage under the active variant. */
  resolve(stage: Stage): ModelTarget {
    return this.profile[stage];
  }

  get activeVariant(): VariantKey {
    return this.variant;
  }
}
