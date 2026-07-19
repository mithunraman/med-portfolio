import { Injectable, Logger } from '@nestjs/common';
import { redactUkOfflinePii, redactUkStructuredPii } from './uk-pii-patterns';

/** A locally-detected entity, stripped of its original value — safe to log. */
export interface LocalRedactedEntity {
  /** UK identifier type, e.g. "NHS_NUMBER", "NI_NUMBER", "SORT_CODE". */
  type: string;
}

export interface LocalRedactionResult {
  redactedText: string;
  entities: LocalRedactedEntity[];
}

/**
 * Deterministic, fully-offline redaction backstop for UK health/gov/bank
 * identifiers (NHS number, CHI, National Insurance, sort code + account,
 * postcode). Delegates to {@link redactUkStructuredPii} — in-repo, format-based
 * regex gated by checksums, with no third-party dependency.
 *
 * Second tier of the redaction pipeline: it runs *after* Azure PHI on
 * already-masked text and catches UK-specific structured IDs by *shape*
 * (phrasing-independent) that a general ML model can miss. Standard PII (names,
 * phones, emails, dates) is Azure's job and is deliberately not re-run here.
 *
 * Offline by construction — pure regex, no network I/O — keeping all clinical
 * text on-box and preserving UK data residency.
 */
@Injectable()
export class LocalPiiService {
  private readonly logger = new Logger(LocalPiiService.name);

  async redactLocal(text: string): Promise<LocalRedactionResult> {
    if (text.trim().length === 0) {
      return { redactedText: text, entities: [] };
    }

    const { redactedText, entities } = redactUkStructuredPii(text);

    if (entities.length > 0) {
      const types = entities.map((e) => e.type);
      this.logger.log(`Local redaction removed UK identifiers [${types.join(', ')}]`);
    }

    return { redactedText, entities };
  }

  /**
   * Full offline redaction for a caller with NO Azure layer ahead of it — the
   * message-edit path, which redacts in-process inside a Mongo transaction where
   * a network call has no place. Covers the structured identifiers of
   * {@link redactLocal} PLUS contact / free-form PII (email, phone, card, DOB,
   * absolute dates) that redactLocal defers to Azure. Contextual PII (patient /
   * clinician names, organisations) is beyond regex and stays uncovered here — a
   * known, accepted limitation of editing versus the full send-path pipeline.
   */
  async redactStandalone(text: string): Promise<LocalRedactionResult> {
    if (text.trim().length === 0) {
      return { redactedText: text, entities: [] };
    }

    const { redactedText, entities } = redactUkOfflinePii(text);

    if (entities.length > 0) {
      const types = entities.map((e) => e.type);
      this.logger.log(`Offline redaction removed [${types.join(', ')}]`);
    }

    return { redactedText, entities };
  }
}
