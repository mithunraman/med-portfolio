import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmPools } from '../config/app.config';
import { POOL_SPECS, type Pool } from './llm-pools';
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
   * Fail fast at startup if the active variant routes any stage to a pool with
   * no credentials — rather than at the first request that hits it.
   *
   * ONE loop covers every provider, because every provider's credentials now
   * live in the same per-pool structure. It is also what makes
   * `LlmEndpointResolver.resolveBucket` able to promise a non-optional endpoint:
   * by the time the resolver constructs, every pool in use is known non-empty.
   */
  private assertCredentials(configService: ConfigService): void {
    const configured = configService.get<LlmPools>('app.llm.pools');

    for (const pool of this.poolsInUse()) {
      if (configured?.[pool]?.length) continue;
      const { envPrefix } = POOL_SPECS[pool];
      throw new Error(
        `LLM_VARIANT '${this.variant}' routes stages to pool '${pool}' but no endpoints are ` +
          `configured (set ${envPrefix}_API_KEY_1 and ${envPrefix}_BASE_URL_1).`
      );
    }
  }

  /**
   * Every quota pool the active variant draws from. Drives both credential
   * validation above and bucket construction in LlmEndpointResolver, so an
   * unused pool needs no configuration at all.
   */
  poolsInUse(): Set<Pool> {
    return new Set(Object.values(this.profile).map((target) => target.pool));
  }

  /** Resolve the provider+model target for a stage under the active variant. */
  resolve(stage: Stage): ModelTarget {
    return this.profile[stage];
  }

  get activeVariant(): VariantKey {
    return this.variant;
  }
}
