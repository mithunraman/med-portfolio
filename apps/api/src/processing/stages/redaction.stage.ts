import { Injectable, Logger } from '@nestjs/common';
import { AzureLanguageService } from '../../language';
import { LocalPiiService } from '../redaction/local-pii.service';
import { IProcessingStage, StageContext, StageResult } from './stage.interface';

@Injectable()
export class RedactionStage implements IProcessingStage {
  readonly name = 'redaction';
  private readonly logger = new Logger(RedactionStage.name);

  constructor(
    private readonly azureLanguage: AzureLanguageService,
    private readonly localPii: LocalPiiService
  ) {}

  /**
   * Redact PII/PHI from text with two ordered layers:
   *
   * 1. Azure PHI (ML/NER) — the semantic layer that catches contextual
   *    identifiers (patient names, places, organisations) that regex cannot. It
   *    runs FIRST, on the clean input, so the context-sensitive model sees
   *    natural text; pre-masking would strip the surrounding tokens it relies on
   *    and lower its recall. Fail-closed by contract: any error throws, and the
   *    processing service marks the message FAILED — un-redacted text never
   *    reaches `content`.
   *
   * 2. OpenRedaction (offline regex) — a deterministic backstop for structured
   *    UK identifiers (NHS number, sort code, postcode, DOB) the model may have
   *    slipped. It runs LAST because regex is context-free: Azure's placeholder
   *    output costs it nothing, and it needs no network.
   *
   * The former OpenAI redaction pass (and its prompt-injection check) was retired
   * with this migration; injection detection remains on the cleaning stage.
   */
  async execute(input: string, context: StageContext): Promise<StageResult> {
    // Layer 1: Azure PHI on clean text. Throws on failure → fail-closed.
    const phi = await this.azureLanguage.redactPhi(input);

    // Layer 2: offline backstop for structured identifiers.
    const local = await this.localPii.redactLocal(phi.redactedText);

    const phiCategories = phi.entities.map((e) => e.category);
    const structuredTypes = local.entities.map((e) => e.type);

    if (phiCategories.length > 0 || structuredTypes.length > 0) {
      this.logger.log(
        `Redacted PHI [${phiCategories.join(', ')}] + structured [${structuredTypes.join(', ')}] ` +
          `for message ${context.messageId}`
      );
    }

    return {
      text: local.redactedText,
      // Injection detection moved off the redaction stage with the LLM retirement.
      injectionDetected: false,
      metadata: {
        stage: this.name,
        messageId: context.messageId.toString(),
        phiEntityCategories: phiCategories,
        phiEntityCount: phi.entities.length,
        structuredEntityTypes: structuredTypes,
        structuredEntityCount: local.entities.length,
      },
    };
  }
}
