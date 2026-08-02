import {
  Entity,
  KnownPiiEntityDomain,
  TextAnalysisClient,
  TextDocumentInput,
} from '@azure/ai-language-text';
import { ClientSecretCredential } from '@azure/identity';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { backOff } from 'exponential-backoff';
import { chunkText } from './chunk-text';

/**
 * Azure AI Language sync limits for PII detection: 5,120 characters per document
 * and 5 documents per request. Chunking + batching keep every call within these.
 * https://learn.microsoft.com/azure/ai-services/language-service/personally-identifiable-information/overview
 */
const MAX_CHARS_PER_DOC = 5120;
const MAX_DOCS_PER_REQUEST = 5;

/** Hard ceiling per Azure call so a hung request can't stall the pipeline. */
const REDACTION_TIMEOUT_MS = 15_000;

/**
 * How the redactor treats Azure `DateTime` entities.
 * - `keep-relative`: redact only absolute/anchored dates (DOB, "12/05/1980"),
 *   keeping non-identifying relative temporals ("today", "three weeks ago") so
 *   reflective narrative survives.
 * - `redact-all`: remove every date — maximum de-identification strictness.
 */
export type RedactionDatePolicy = 'keep-relative' | 'redact-all';

/**
 * Per-category carve-outs from Azure's default "redact everything" behaviour.
 * Each field is a deliberate, DPIA-auditable decision to keep a category Azure
 * flags but that isn't actually an identifier for this product.
 */
export interface RedactionPolicy {
  /** How `DateTime` entities are treated (see {@link RedactionDatePolicy}). */
  datePolicy: RedactionDatePolicy;
  /**
   * Keep `PersonType` entities — job roles / relationship nouns ("supervisor",
   * "GP", "daughter"). Not HIPAA/ICO identifiers, so kept by default to preserve
   * reflective narrative. Actual names (`Person`) are always redacted.
   */
  keepPersonType: boolean;
}

/** A redacted entity, stripped of its original (sensitive) value — safe to log. */
export interface RedactedEntity {
  /** Azure PHI category, e.g. "Person", "PhoneNumber", "UKNationalHealthNumber". */
  category: string;
  confidenceScore: number;
}

export interface PhiRedactionResult {
  /** Input text with every detected entity replaced by a typed placeholder. */
  redactedText: string;
  entities: RedactedEntity[];
}

/**
 * Redacts Protected Health Information from free text using Azure AI Language
 * (PII detection, PHI domain). This is the semantic layer of the redaction
 * pipeline — an ML model that catches contextual identifiers (patient names,
 * places, organisations) that deterministic regex fundamentally cannot.
 *
 * Auth is a Microsoft Entra service principal (no static key), which is the
 * prerequisite for enforcing `disableLocalAuth` on the resource. The SDK is
 * confined to this service; callers receive a plain domain result.
 *
 * Fail-closed by contract: any error after retries throws. The processing
 * pipeline turns that into a terminal FAILED status, so un-redacted text can
 * never reach the persisted `content`.
 */
@Injectable()
export class AzureLanguageService {
  private readonly logger = new Logger(AzureLanguageService.name);
  private readonly client: TextAnalysisClient;
  private readonly policy: RedactionPolicy;

  constructor(configService: ConfigService) {
    const endpoint = configService.get<string>('app.azureLanguage.endpoint');
    const tenantId = configService.get<string>('app.azureLanguage.tenantId');
    const clientId = configService.get<string>('app.azureLanguage.clientId');
    const clientSecret = configService.get<string>('app.azureLanguage.clientSecret');

    // Fail fast at startup (provider instantiation) rather than at the first
    // message that needs redacting — mirrors LLMService's credential guards.
    const missing = [
      ['AZURE_LANGUAGE_ENDPOINT', endpoint],
      ['AZURE_TENANT_ID', tenantId],
      ['AZURE_CLIENT_ID', clientId],
      ['AZURE_CLIENT_SECRET', clientSecret],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `AzureLanguageService: missing required config [${missing.join(', ')}]. ` +
          `PHI redaction cannot start without an Entra service principal.`
      );
    }

    const credential = new ClientSecretCredential(
      tenantId as string,
      clientId as string,
      clientSecret as string
    );
    this.client = new TextAnalysisClient(endpoint as string, credential);
    this.policy = {
      datePolicy:
        configService.get<RedactionDatePolicy>('app.azureLanguage.datePolicy') ?? 'keep-relative',
      keepPersonType: configService.get<boolean>('app.azureLanguage.keepPersonType') ?? true,
    };
  }

  /**
   * Redact PHI from text, returning the text with typed placeholders and the
   * (value-free) list of entities removed. Long inputs are chunked and batched
   * to stay within Azure's per-document and per-request limits.
   */
  async redactPhi(text: string, language = 'en'): Promise<PhiRedactionResult> {
    if (text.trim().length === 0) {
      return { redactedText: text, entities: [] };
    }

    const chunks = chunkText(text, MAX_CHARS_PER_DOC);
    const redactedChunks: string[] = new Array(chunks.length);
    const entities: RedactedEntity[] = [];
    let keptCount = 0;

    // Batch chunks into requests of up to MAX_DOCS_PER_REQUEST documents.
    for (let start = 0; start < chunks.length; start += MAX_DOCS_PER_REQUEST) {
      const batch = chunks.slice(start, start + MAX_DOCS_PER_REQUEST);
      const documents: TextDocumentInput[] = batch.map((chunk, i) => ({
        id: String(start + i),
        text: chunk,
        language,
      }));

      const results = await this.analyzeWithRetry(documents);

      for (const result of results) {
        if (result.error) {
          // Fail-closed: never emit partially-redacted text on a document error.
          throw new Error(
            `Azure PHI redaction failed for document ${result.id}: ${result.error.message}`
          );
        }

        const index = Number(result.id);
        if (!Number.isInteger(index) || index < 0 || index >= chunks.length) {
          // Fail-closed: an unexpected/malformed document id means we cannot
          // safely attribute this result to a chunk. Assigning it (e.g. at a NaN
          // key) would leave the real chunk a hole that join('') later drops.
          throw new Error(
            `Azure PHI redaction returned an unexpected document id "${result.id}"`
          );
        }
        const { redactedText, redactedEntities } = applyEntityMask(
          chunks[index],
          result.entities,
          this.policy
        );
        redactedChunks[index] = redactedText;
        entities.push(...redactedEntities);
        keptCount += result.entities.length - redactedEntities.length;
      }
    }

    // Fail-closed completeness check. Every chunk must have a redacted result
    // before we join: a hole (Azure omitted a document without reporting an
    // error) is silently coerced to '' by join(''), deleting that chunk's text
    // from the final content — silent truncation of a clinical record. Treat a
    // missing chunk as a hard failure, consistent with the per-document error
    // branch above; the caller marks the message FAILED rather than emitting
    // partial text.
    for (let i = 0; i < chunks.length; i++) {
      if (redactedChunks[i] === undefined) {
        throw new Error(
          `Azure PHI redaction returned no result for document ${i} of ${chunks.length}`
        );
      }
    }

    if (entities.length > 0 || keptCount > 0) {
      const categories = [...new Set(entities.map((e) => e.category))];
      this.logger.log(
        `PHI redaction removed ${entities.length} entities [${categories.join(', ')}]` +
          (keptCount > 0 ? `; kept ${keptCount} non-identifying entity(ies)` : '')
      );
    }

    return { redactedText: redactedChunks.join(''), entities };
  }

  /**
   * Call Azure with bounded exponential backoff and a per-attempt timeout.
   * Only transient errors (429/5xx/network) are retried; auth failures
   * (401/403) surface immediately so a broken service principal fails loudly.
   */
  private async analyzeWithRetry(documents: TextDocumentInput[]) {
    return backOff(
      async () => {
        const analyzePromise = this.client.analyze('PiiEntityRecognition', documents, {
          domainFilter: KnownPiiEntityDomain.Phi,
        });

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Azure PHI redaction timed out after ${REDACTION_TIMEOUT_MS}ms`)),
            REDACTION_TIMEOUT_MS
          );
        });

        try {
          return await Promise.race([analyzePromise, timeoutPromise]);
        } finally {
          // Clear the timer so a resolved request never leaves a dangling timeout.
          clearTimeout(timer);
        }
      },
      {
        numOfAttempts: 3,
        startingDelay: 1000,
        timeMultiple: 2,
        jitter: 'full',
        retry: (error) => {
          // Timeouts have already waited long enough — do not retry.
          if (error instanceof Error && error.message.includes('timed out')) return false;
          const retryable = isRetryableAzureError(error);
          if (retryable) this.logger.warn('Retryable Azure Language error, retrying...', error);
          return retryable;
        },
      }
    ).catch((error) => {
      Sentry.captureException(error, {
        tags: { operation: 'redactPhi', provider: 'azure-language' },
        extra: { documentCount: documents.length, maxRetries: 3 },
      });
      throw error;
    });
  }
}

/** A disjoint span to mask, after overlapping entities have been merged. */
interface MergedSpan {
  start: number;
  end: number;
  category: string;
}

/**
 * Collapse overlapping/nested entities into disjoint spans. Azure can return
 * multiple entities over the same characters (e.g. an NI number tagged as both
 * `UKNationalInsuranceNumber` and `EUNationalIdentificationNumber`); masking
 * those independently corrupts the output. We redact the UNION of any
 * overlapping run (fail-safe: no identifier byte survives at a boundary) and
 * label each cluster by its dominant entity — longest span wins, ties broken by
 * confidence, then first-seen.
 */
export function mergeOverlaps(entities: readonly Entity[]): MergedSpan[] {
  // Widest span first at a given start, so the dominant label is seen early.
  const sorted = [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length);
  const clusters: (MergedSpan & { bestLen: number; bestConf: number })[] = [];

  for (const e of sorted) {
    const start = e.offset;
    const end = e.offset + e.length;
    const last = clusters[clusters.length - 1];

    if (last && start < last.end) {
      // Overlaps the open cluster — extend to the union and maybe adopt its label.
      last.end = Math.max(last.end, end);
      if (e.length > last.bestLen || (e.length === last.bestLen && e.confidenceScore > last.bestConf)) {
        last.category = e.category;
        last.bestLen = e.length;
        last.bestConf = e.confidenceScore;
      }
    } else {
      clusters.push({
        start,
        end,
        category: e.category,
        bestLen: e.length,
        bestConf: e.confidenceScore,
      });
    }
  }

  return clusters.map(({ start, end, category }) => ({ start, end, category }));
}

/**
 * Replace each detected entity span with a typed placeholder, e.g.
 * "seen by Dr Okafor" → "seen by Dr [PERSON]". Entities the active policy keeps
 * (relative temporals, job roles) are filtered out first, so they survive AND
 * are excluded from the reported redactions. Remaining entities are merged into
 * disjoint spans (see {@link mergeOverlaps}) and masked right-to-left so earlier
 * offsets stay valid as the string is rewritten. Azure returns offsets in
 * Utf16CodeUnit units, which are JS string indices, so slicing is exact.
 */
function applyEntityMask(
  text: string,
  entities: readonly Entity[],
  policy: RedactionPolicy
): { redactedText: string; redactedEntities: RedactedEntity[] } {
  const toRedact = entities.filter((e) =>
    shouldRedactEntity(e.category, e.text, policy, e.subCategory)
  );
  // Relabel ages for masking only; the reported category below stays the true
  // 'Quantity' so metadata is honest. Any age reaching redaction is either a
  // confirmed 90+ (→ HIPAA "90 or older" aggregate) or unreadable (→ typed [AGE]);
  // sub-90 ages are kept upstream and never arrive here.
  const forMasking = toRedact.map((e) => {
    if (e.category === 'Quantity' && isAgeQuantity(e.text, e.subCategory)) {
      const category = isAgeOver90(e.text) ? AGE_90_PLUS_CATEGORY : REDACTED_AGE_CATEGORY;
      return { ...e, category } as Entity;
    }
    return e;
  });
  const spans = mergeOverlaps(forMasking).sort((a, b) => b.start - a.start);

  let out = text;
  for (const span of spans) {
    out = out.slice(0, span.start) + toPlaceholder(span.category) + out.slice(span.end);
  }

  return {
    // Report the entities Azure actually flagged (pre-merge) for honest metadata;
    // the merge only affects the rendered text, not the detection accounting.
    redactedText: out,
    redactedEntities: toRedact.map((e) => ({
      category: e.category,
      confidenceScore: e.confidenceScore,
    })),
  };
}

// A DateTime entity is "absolute" (identifying) when its text anchors to a
// calendar point — a year, a numeric date, or a month name. Relative/deictic
// expressions ("today", "three weeks ago", "last Tuesday") contain none of
// these. These regexes only ever run on text Azure already tagged as DateTime,
// so they cannot misfire on clinical numbers like "BP 140/90".
const MONTH_NAME =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;
const YEAR = /\b(1[89]\d{2}|20\d{2})\b/;
const NUMERIC_DATE = /\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/;

/** True if a DateTime's text anchors to a specific calendar point. */
export function isAbsoluteDate(text: string): boolean {
  return YEAR.test(text) || NUMERIC_DATE.test(text) || MONTH_NAME.test(text);
}

/**
 * National UK health/gov bodies that Azure over-redacts as `Organization` but
 * which are NOT identifiers — system-level references, not a patient's specific
 * institution. This is a deny-by-default allow-list: ONLY these enumerated
 * national bodies are kept; a patient's own hospital / GP practice / employer /
 * care home is not listed and still redacts. Both acronym and spelled-out forms
 * are included because Azure tags both.
 *
 * Hardcoded on purpose — a reviewed, static clinical list, not runtime config.
 */
const NATIONAL_BODIES: readonly string[] = [
  // Tier 1 — core national bodies & regulators
  'NHS', 'National Health Service', 'NHS England', 'NHS Scotland',
  'NICE', 'National Institute for Health and Care Excellence',
  'CQC', 'Care Quality Commission',
  'GMC', 'General Medical Council',
  'NMC', 'Nursing and Midwifery Council',
  'MHRA', 'Medicines and Healthcare products Regulatory Agency',
  'DVLA', 'Driver and Vehicle Licensing Agency',
  'UKHSA', 'UK Health Security Agency',
  'RCGP', 'Royal College of General Practitioners',
  'BMA', 'British Medical Association',
  // Tier 2 — professional & system regulators, research / public-health bodies
  'GPhC', 'General Pharmaceutical Council',
  'HCPC', 'Health and Care Professions Council',
  'GDC', 'General Dental Council',
  'GOC', 'General Optical Council',
  'GOsC', 'General Osteopathic Council',
  'GCC', 'General Chiropractic Council',
  'PSA', 'Professional Standards Authority',
  'HRA', 'Health Research Authority',
  'HFEA', 'Human Fertilisation and Embryology Authority',
  'HTA', 'Human Tissue Authority',
  'HIW', 'Healthcare Inspectorate Wales',
  'HIS', 'Healthcare Improvement Scotland',
  'RQIA',
  'PHE', 'Public Health England', 'Public Health Wales', 'Public Health Scotland',
  // Tier 3 — arm's-length & national system bodies
  'DHSC', 'Department of Health and Social Care',
  'NHS Wales', 'NHS Northern Ireland', 'HSC', 'Health and Social Care',
  'NHS Improvement', 'NHS Digital', 'NHS Resolution',
  'NHS Blood and Transplant', 'NHSBT',
  'NHS Business Services Authority', 'NHSBSA',
  'Health Education England', 'HEE', 'NHS Confederation',
  // Tier 4 — royal colleges & membership bodies
  'RCP', 'Royal College of Physicians',
  'RCS', 'Royal College of Surgeons',
  'RCPsych', 'RCOG', 'RCPCH', 'RCoA', 'RCA', 'RCEM', 'RCR', 'RCPath',
  'RCN', 'Royal College of Nursing',
  'RCM', 'Royal College of Midwives',
  'RPS', 'Royal Pharmaceutical Society', 'SIGN',
  // Tier 5 — national reference works (guidance / formularies), not identifiers
  'BNF', 'British National Formulary', 'BNFc',
  'CKS', 'Clinical Knowledge Summaries',
  'Cochrane',
];

/** Normalise an org string for allow-list comparison (case/whitespace/"the"). */
function normalizeOrg(text: string): string {
  return text.trim().toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, ' ');
}

const NATIONAL_BODY_SET = new Set(NATIONAL_BODIES.map(normalizeOrg));

/**
 * Reference-material suffixes: a national body wearing one of these is still a
 * reference SOURCE, never an identifier — Azure tags the whole compound span as
 * one Organization ("NICE CKS", "NICE NG28", "RCGP guidance"), which the exact
 * allow-list would otherwise miss. Stripping is safe because no enumerated body
 * name contains one of these tokens, so it can only ever shorten a compound down
 * to its national-body head. Guideline references are included in both the
 * lettered NICE form ("NG28", "CG181", "QS…") and the bare-number SIGN form
 * ("SIGN 153"); a trailing bare number is only ever stripped down to a head that
 * must itself be an enumerated body, so "<body> <n>" (a guideline/service number)
 * is kept while a named institution — which carries no such number — still redacts.
 */
const REFERENCE_SUFFIX =
  /\b(cks|guidance|guideline|guidelines|criteria|pathway|pathways|standard|standards|formulary|(?:ng|cg|qs|ta|ph|ipg|mtg|dg)\d+|\d+)\b/g;

/**
 * True if the text is an enumerated national UK body (not an identifier). Matches
 * an exact enumerated name first, then falls back to stripping any trailing
 * reference-material suffix and re-checking the head — so "NICE CKS" resolves to
 * "NICE" and is kept, while a specific institution ("Leeds NHS Trust", "NHS
 * Lothian") strips nothing and still redacts. Deny-by-default is preserved: the
 * fallback can only ever keep a string whose head is already enumerated.
 */
export function isNationalBody(text: string): boolean {
  const norm = normalizeOrg(text);
  if (NATIONAL_BODY_SET.has(norm)) return true;
  const head = norm.replace(REFERENCE_SUFFIX, '').replace(/\s+/g, ' ').trim();
  return head.length > 0 && NATIONAL_BODY_SET.has(head);
}

/**
 * UK public service numbers — emergency / urgent-care / helpline codes that
 * appear in clinical safety-netting ("call 999", "ring 111"). They are public,
 * non-identifying, and short (3–6 digits), so they can NEVER collide with a
 * personal phone (10–11 digits) — Azure sometimes tags them as `PhoneNumber`,
 * which would gut the advice ("call [PHONE_NUMBER] if worse"). Hardcoded,
 * reviewed list; deny-by-default (only these are kept, every other number redacts).
 */
const PUBLIC_SERVICE_NUMBERS: ReadonlySet<string> = new Set([
  '999', // emergency services
  '112', // EU emergency (works in the UK)
  '111', // NHS 111 (urgent care)
  '101', // police non-emergency
  '105', // power cut
  '116123', // Samaritans
]);

/** True if the text is an enumerated public service number (not an identifier). */
export function isPublicServiceNumber(text: string): boolean {
  return PUBLIC_SERVICE_NUMBERS.has(text.replace(/\D/g, ''));
}

// HIPAA Safe Harbor (45 CFR §164.514(b)(2)) requires "all ages over 89" to be
// removed — aggregated into a single "90 or older" category — so ages 89 and
// under are NOT identifiers. Azure tags every age as a `Quantity` (subcategory
// `Age`) regardless, which would blank clinically-relevant, non-identifying ages
// like "82-year-old". We keep an age only when it is below this ceiling.
const HIPAA_AGE_CEILING = 90;

// HIPAA aggregates every age 90+ into a single "90 or older" bucket rather than
// deleting it, so the (non-identifying) fact that the patient is very elderly
// survives for clinical context. We therefore mask an identifying age with this
// literal instead of a bare [QUANTITY] placeholder — "who's 93" → "who's 90 or older".
// The synthetic category is internal-only: it never comes from Azure, and
// toPlaceholder maps it to the literal. A non-age Quantity still becomes [QUANTITY].
const AGE_90_PLUS_LABEL = '90 or older';
const AGE_90_PLUS_CATEGORY = '__AgeOver90__';

// A redacted age we could NOT read (unparseable → fail-closed) is masked with a
// typed [AGE] placeholder rather than the vaguer [QUANTITY]: it tells the
// downstream analysis LLM an age was present without asserting a value. 'Age' is
// not a real Azure top-level category (Age is only ever a subCategory), so using
// it as the synthetic masking category is collision-free and snake-cases to [AGE]
// through toPlaceholder — no special-case needed. Non-age quantities keep
// [QUANTITY].
const REDACTED_AGE_CATEGORY = 'Age';

// Age-like phrasing — a fallback used only when Azure omits the `Age`
// subcategory. It is consulted solely for text Azure already tagged `Quantity`,
// so it cannot misfire on clinical numbers elsewhere in the narrative.
const AGE_PHRASING = /year[-\s]?old|\byears?\b|\byrs?\b|\baged?\b/i;

/** A `Quantity` that represents a person's age (vs a dose, measurement, currency). */
function isAgeQuantity(text: string, subCategory?: string): boolean {
  return subCategory === 'Age' || AGE_PHRASING.test(text);
}

// Worded-age vocabulary. Ages are a closed set (units 0–19, tens 20–90), so a
// small deterministic parser beats a general word-to-number dependency — leaner,
// dependency-free, and (critically on a redaction path) it never guesses: an
// unrecognised token yields null, which the gates fail-close on.
const AGE_WORD_UNITS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const AGE_WORD_TENS: Readonly<Record<string, number>> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Parse a spelled-out age ("eighty-two", "forty") to a number, or null if it is
 * not a recognised age word. Tokenises on spaces and any Unicode dash (so an
 * en-dash "eighty–two" parses too) and ignores non-number words ("year-old",
 * "aged") so it can read the number out of a whole age span.
 *
 * Scope is human ages. These all return null so the caller fails closed:
 *  - thousand/million/billion — not an age;
 *  - a repeated tens or units word ("eighty ninety", "one two");
 *  - a tens word paired with a teen ("eighty fifteen" is impossible — a tens word
 *    only ever combines with a 1–9 unit; without this it would sum to 95 and
 *    assert a false "90 or older");
 *  - a total over 120.
 * A "hundred" age is a centenarian (100+), so it resolves to ≥90 and surfaces the
 * "90 or older" aggregate rather than the vaguer [AGE] (this also avoids reading
 * "a hundred and two" as 2 from a stray units word).
 */
export function parseWordedAge(text: string): number | null {
  const lower = text.toLowerCase();
  if (/\b(thousand|million|billion)\b/.test(lower)) return null; // never an age
  if (/\bhundred\b/.test(lower)) return 100; // centenarian → ≥90 → "90 or older"

  const tokens = lower
    .split(/[\s\p{Pd}]+/u)
    .filter((t) => t in AGE_WORD_UNITS || t in AGE_WORD_TENS);
  if (tokens.length === 0) return null;

  let tensSum = 0;
  let unitsSum = 0;
  let tensCount = 0;
  let unitsCount = 0;
  for (const token of tokens) {
    if (token in AGE_WORD_TENS) {
      tensSum += AGE_WORD_TENS[token];
      tensCount++;
    } else {
      unitsSum += AGE_WORD_UNITS[token];
      unitsCount++;
    }
  }
  if (tensCount > 1 || unitsCount > 1) return null; // "eighty ninety" / "one two"
  if (tensCount === 1 && unitsSum >= 10) return null; // "eighty fifteen" — impossible

  const age = tensSum + unitsSum;
  return age <= 120 ? age : null;
}

/**
 * Read an age from a span as a number, digits first ("94") then spelled-out
 * words ("ninety-four"). Null when neither yields a value — the single source of
 * truth both age gates below derive from, so they can never disagree.
 */
function ageValue(text: string): number | null {
  const digits = text.match(/\d{1,3}/);
  return digits ? Number(digits[0]) : parseWordedAge(text);
}

// Two age gates that deliberately fail in OPPOSITE directions — do not merge:
//  - redact gate (isIdentifyingAge): the danger is LEAKING a real 90+ age, so an
//    age we can't read fails CLOSED → redact.
//  - label gate (isAgeOver90): the danger is FABRICATING a false "90 or older"
//    claim, so an age we can't read fails NEUTRAL → don't assert the band (the
//    entity still redacts via the gate above, just to a neutral [QUANTITY]).

/** Redact gate: is this age identifying (90+ or unreadable)? Fail-closed. */
function isIdentifyingAge(text: string): boolean {
  const age = ageValue(text);
  return age === null || age >= HIPAA_AGE_CEILING;
}

/** Label gate: is this a *confirmed* 90+ age worth the "90 or older" bucket? */
function isAgeOver90(text: string): boolean {
  const age = ageValue(text);
  return age !== null && age >= HIPAA_AGE_CEILING;
}

/**
 * Whether a detected entity should be redacted under the active policy. Five
 * categories are carve-outs; every other category always redacts.
 *
 * - `PersonType` (job roles / relationship nouns) is not a HIPAA/ICO identifier,
 *   so it is kept unless `keepPersonType` is false. Actual names (`Person`) are
 *   unaffected and always redact.
 * - `Organization`: enumerated national UK bodies (NHS, NICE, GMC, royal
 *   colleges, …) are kept — they are not identifiers. A patient's specific
 *   institution (their hospital / practice / employer / care home) is not on the
 *   allow-list and still redacts.
 * - `PhoneNumber`: enumerated UK public service numbers (999, 111, 116 123, …)
 *   are kept — they are public, non-identifying, and too short to be a personal
 *   phone. Any other number (a real mobile / landline) still redacts.
 * - `DateTime`: fail-safe — an ambiguous (non-anchored) date is kept only under
 *   `keep-relative`; anything with an absolute marker, and everything under
 *   `redact-all`, is removed.
 * - `Quantity`: only an *age* is potentially identifying, and only at 90+ (HIPAA
 *   Safe Harbor). An age 89 or under is kept for clinical fidelity
 *   ("82-year-old"); 90+ or an unparseable age redacts. Non-age quantities
 *   (doses, measurements) fall through to the default and redact — Azure rarely
 *   tags them in the PHI domain, so this is unchanged in practice.
 */
export function shouldRedactEntity(
  category: string,
  text: string,
  policy: RedactionPolicy,
  subCategory?: string
): boolean {
  if (category === 'PersonType') return !policy.keepPersonType;
  if (category === 'Organization') return !isNationalBody(text);
  if (category === 'PhoneNumber') return !isPublicServiceNumber(text);
  if (category === 'DateTime') {
    if (policy.datePolicy === 'redact-all') return true;
    return isAbsoluteDate(text);
  }
  if (category === 'Quantity' && isAgeQuantity(text, subCategory)) {
    return isIdentifyingAge(text);
  }
  return true;
}

/** "PhoneNumber" → "[PHONE_NUMBER]", "Person" → "[PERSON]". */
export function toPlaceholder(category: string): string {
  if (category === AGE_90_PLUS_CATEGORY) return AGE_90_PLUS_LABEL;
  const snake = category
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase();
  return `[${snake}]`;
}

function isRetryableAzureError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  if (message.includes('429') || message.includes('rate limit')) return true;
  if (message.includes('500') || message.includes('502') || message.includes('503')) return true;
  if (message.includes('504') || message.includes('gateway')) return true;
  if (message.includes('econnreset') || message.includes('econnrefused')) return true;
  if (message.includes('etimedout') || message.includes('network')) return true;

  const status =
    (error as { statusCode?: number }).statusCode ?? (error as { status?: number }).status;
  if (typeof status === 'number') return status === 429 || status >= 500;

  return false;
}
