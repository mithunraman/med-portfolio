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
  }

  /** Resolve the provider+model target for a stage under the active variant. */
  resolve(stage: Stage): ModelTarget {
    return this.profile[stage];
  }

  get activeVariant(): VariantKey {
    return this.variant;
  }
}
