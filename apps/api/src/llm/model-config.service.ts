import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FoundryPools } from '../config/app.config';
import { poolOf } from './llm-pools';
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
   *
   * Foundry is checked PER POOL, not per provider: a variant can route different
   * stages to different quota pools (F does), so "some Foundry endpoint exists"
   * is no longer sufficient — each pool actually in use needs its own key.
   */
  private assertCredentials(configService: ConfigService): void {
    const providers = new Set(Object.values(this.profile).map((t) => t.provider));
    if (providers.has('openrouter') && !configService.get<string>('app.openrouter.apiKey')) {
      throw new Error(
        `LLM_VARIANT '${this.variant}' uses OpenRouter but OPENROUTER_API_KEY is not set.`
      );
    }

    const configured = configService.get<FoundryPools>('app.azureFoundry.pools');
    for (const pool of this.foundryPoolsInUse()) {
      if (configured?.[pool as keyof FoundryPools]?.length) continue;
      const prefix = `AZURE_FOUNDRY_${pool.toUpperCase()}`;
      throw new Error(
        `LLM_VARIANT '${this.variant}' routes stages to Azure Foundry pool '${pool}' but no ` +
          `endpoints are configured (set ${prefix}_API_KEY_1 / ${prefix}_BASE_URL_1).`
      );
    }
  }

  /**
   * Every quota pool the active variant draws from, including the implicit
   * single-key pools of non-Foundry providers. Drives bucket construction in
   * LlmEndpointResolver, so an unused pool needs no configuration at all.
   */
  poolsInUse(): Set<string> {
    return new Set(Object.values(this.profile).map(poolOf));
  }

  /** The subset of pools in use that are backed by Azure Foundry credentials. */
  private foundryPoolsInUse(): Set<string> {
    return new Set(
      Object.values(this.profile)
        .filter((target) => target.provider === 'azure-foundry')
        .map(poolOf)
    );
  }

  /** Resolve the provider+model target for a stage under the active variant. */
  resolve(stage: Stage): ModelTarget {
    return this.profile[stage];
  }

  get activeVariant(): VariantKey {
    return this.variant;
  }
}
