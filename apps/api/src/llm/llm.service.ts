import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { AssemblyAI, SpeechModel } from 'assemblyai';
import { backOff } from 'exponential-backoff';
import { z } from 'zod';
import { MetricsService } from '../common/metrics';
import { LlmEndpointResolver } from './llm-endpoint.resolver';
import { LlmRateLimiterService } from './llm-rate-limiter.service';
import { LlmTraceContext, traceLlmCall } from './llm-trace.util';
import { MEDICAL_KEYTERMS, TRANSCRIPTION_TIMEOUT_MS } from './medical-keyterms';

// Re-exported from a leaf module to avoid an import cycle with model-variants.ts
// (see openai-models.ts). Kept exported here so existing `../llm` imports resolve.
export { OpenAIModels, type OpenAIModel } from './openai-models';

/** Structured-output strategy passed to LangChain's withStructuredOutput(). */
export type StructuredMethod = 'functionCalling' | 'jsonSchema' | 'jsonMode';

/**
 * Reasoning ("think") mode for hybrid models (DeepSeek V4). `off` = non-thinking;
 * `low`/`high`/`max` set reasoning effort. Semantic here; LLMService translates it
 * into the provider's request params.
 *
 * `off` is not universal: reasoning-native models (gpt-oss-120b) reject it with
 * "Reasoning is mandatory for this endpoint and cannot be disabled", so `low` is
 * their floor.
 */
export type ThinkMode = 'off' | 'low' | 'high' | 'max';

/**
 * A concrete, resolved model target: which provider to call and which model
 * (or Azure deployment) to run on it. This is the entire vocabulary LLMService
 * understands. The mapping from a pipeline stage to a target lives in
 * ModelConfigService — never here — so this service stays pure transport.
 */
export type ModelTarget =
  | { provider: 'openai'; model: string; structuredMethod?: StructuredMethod }
  | {
      provider: 'openrouter';
      model: string;
      /** Reasoning effort for hybrid models (DeepSeek V4). */
      thinkMode?: ThinkMode;
      /** OpenRouter upstream provider-routing preference, e.g. ['DigitalOcean']. */
      route?: string[];
      structuredMethod?: StructuredMethod;
    }
  | {
      provider: 'azure-foundry';
      /** Foundry deployment name (used as the OpenAI `model` field). */
      model: string;
      /** Reasoning effort for hybrid models (DeepSeek V4). */
      thinkMode?: ThinkMode;
      structuredMethod?: StructuredMethod;
    };

export type LLMOptions = ModelTarget & {
  temperature?: number;
  maxTokens?: number;
  /**
   * Stable key (the conversationId) used to shard the call across API keys/
   * endpoints. All calls sharing a routingKey deterministically hit the same key
   * and its rate limiter. Omitted → endpoint 0. See LlmEndpointResolver.
   */
  routingKey?: string;
  /** Dev-only: optional correlation (stage/conversationId) attached to LLM_TRACE output. */
  traceContext?: LlmTraceContext;
};

export interface LLMResponse {
  content: string;
  /** Resolved model id (or Azure deployment name) the call ran on. */
  model: string;
  tokensUsed: number | null;
}

export interface StructuredResponse<T> {
  data: T;
  /** Resolved model id (or Azure deployment name) the call ran on. */
  model: string;
  tokensUsed: number | null;
}

export interface TranscriptionResult {
  text: string;
  confidence: number | null;
  audioDurationMs: number | null;
  wordCount: number;
}

/**
 * Extra completion-token budget to reserve for reasoning ("thinking") tokens,
 * which share the max_tokens budget with the answer. Without this, a thinking
 * model exhausts the budget mid-answer and truncates structured output.
 */
function reasoningHeadroom(thinkMode?: ThinkMode): number {
  switch (thinkMode) {
    case 'high':
      return 8000;
    case 'max':
      return 16000;
    default:
      return 0;
  }
}

/**
 * Translate an Azure Foundry target's semantic options into extra request-body
 * params. Single point that owns the Foundry/DeepSeek wire format. Exported as a
 * pure function so the mapping can be unit-tested directly.
 *
 * NB: Foundry's DeepSeek surface does NOT accept DeepSeek's native `thinking`
 * toggle nor `enable_thinking` (both 400 as "unrecognized request argument").
 * The V4 Flash deployment runs in non-thinking mode by default — it returns no
 * `reasoning_content` and answers directly — so `off` sends NO reasoning param.
 * `high`/`max` map to DeepSeek's `reasoning_effort` values (`high`/`max` per
 * DeepSeek's API docs — NOT OpenAI's `low`/`medium`/`high` set, so don't
 * "correct" `max` to `high`; that would silently cap reasoning). Only `off` is
 * live-verified on Foundry.
 *
 * TODO: `high`/`max` are UNVERIFIED against this Foundry deployment — Foundry may
 * forward them to DeepSeek or validate against OpenAI's enum and 400. Smoke-test
 * before shipping any variant that sets a thinking mode; Variant D uses `off` only.
 * (The unit test only pins this mapping — it cannot catch an endpoint 400.)
 */
export function azureFoundryKwargs(
  target: Extract<ModelTarget, { provider: 'azure-foundry' }>
): Record<string, unknown> {
  if (target.thinkMode === undefined || target.thinkMode === 'off') {
    return {};
  }

  return { reasoning_effort: target.thinkMode === 'max' ? 'max' : 'high' };
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly openaiApiKey: string;
  // Optional — only required when the active variant routes a stage to OpenRouter.
  // Presence is enforced up front by ModelConfigService's credential guard.
  private readonly openrouterApiKey: string | undefined;
  private readonly assemblyai: AssemblyAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
    private readonly rateLimiter: LlmRateLimiterService,
    // Owns the routingKey → endpoint index mapping AND the per-key Foundry
    // credentials. Both the limiter bucket and the credentials are selected by the
    // same index (computed once per call), so they can never disagree.
    private readonly endpointResolver: LlmEndpointResolver
  ) {
    const openaiApiKey = this.configService.get<string>('app.openai.apiKey');
    if (!openaiApiKey) throw new Error('Missing config: app.openai.apiKey');
    this.openaiApiKey = openaiApiKey;

    this.openrouterApiKey = this.configService.get<string>('app.openrouter.apiKey');

    const assemblyaiApiKey = this.configService.get<string>('app.assemblyai.apiKey');
    if (!assemblyaiApiKey) throw new Error('Missing config: app.assemblyai.apiKey');

    const assemblyaiBaseUrl = this.configService.get<string>('app.assemblyai.baseUrl');
    if (!assemblyaiBaseUrl) throw new Error('Missing config: app.assemblyai.baseUrl');

    this.assemblyai = new AssemblyAI({
      apiKey: assemblyaiApiKey,
      baseUrl: assemblyaiBaseUrl,
    });
  }

  /**
   * Invoke an LLM and return a validated, typed object.
   *
   * Uses OpenAI's structured output (function calling) under the hood —
   * the API constrains token generation to only produce valid JSON matching
   * the Zod schema. No string parsing or markdown fence extraction needed.
   *
   * Accepts a pre-formatted BaseMessage[] array (from ChatPromptTemplate)
   * so callers own prompt composition while this service owns model config.
   *
   * @param messages - Chat messages (from ChatPromptTemplate.formatMessages())
   * @param schema   - Zod schema defining the expected response shape
   * @param options  - Model, temperature, maxTokens overrides
   */
  async invokeStructured<T>(
    messages: BaseMessage[],
    schema: z.ZodType<T>,
    options: LLMOptions
  ): Promise<StructuredResponse<T>> {
    const { temperature = 0.1, maxTokens = 2000, traceContext, routingKey, ...target } = options;
    const modelLabel = target.model;

    // Compute the endpoint index ONCE and use it for BOTH the credentials
    // (createChatModel) and the rate-limiter bucket (schedule) — this single
    // shared value is what guarantees the key that gates a call also sends it.
    const endpointIndex = this.endpointResolver.indexFor(routingKey ?? '');

    this.logger.debug(
      `invokeStructured [${target.provider}:${modelLabel}] messages:\n${messages.map((m) => `[${m.type}] ${m.content}`).join('\n')}`
    );

    // Captured for the dev-only LLM_TRACE dump (no-op unless enabled).
    const traceInput = messages.map((m) => ({ role: m.type, content: m.content }));

    const startTime = Date.now();
    try {
      const result = await backOff(
        async () => {
          const chatModel = this.createChatModel(target, temperature, maxTokens, endpointIndex);

          // Cast to `any` to avoid TS2589 (excessive type depth) from LangChain's
          // heavily overloaded withStructuredOutput generics. Caller-side type
          // safety is preserved by the method signature: schema: ZodType<T> → T.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const structuredModel = (chatModel as any).withStructuredOutput(
            schema,
            target.structuredMethod ? { method: target.structuredMethod } : undefined
          );

          // Gate each attempt on the rate limiter. Wrapping the per-attempt call
          // (not the whole backOff) means a 429-triggered retry consumes its own
          // reservoir slot — a retry is a real API call against the quota. This
          // holds only because createChatModel sets maxRetries: 0; otherwise
          // LangChain's AsyncCaller would retry up to 6× inside this single slot,
          // firing multiple provider requests the limiter never sees.
          //
          // Timing is split so the SLI stays honest: the time spent queued/paced
          // by the limiter is recorded as `llm.ratelimit.wait_ms`, and only the
          // actual provider round-trip counts toward `llm.request.duration`.
          // Measuring end-to-end (before schedule) would let minTime pacing +
          // queue wait dominate the "provider latency" metric under concurrency.
          const scheduledAt = Date.now();
          const data = (await this.rateLimiter.schedule(endpointIndex, async () => {
            const callStart = Date.now();
            this.metricsService.recordLLMWait('invokeStructured', callStart - scheduledAt);
            try {
              return await structuredModel.invoke(messages);
            } finally {
              this.metricsService.recordLLMDuration(
                'invokeStructured',
                modelLabel,
                Date.now() - callStart
              );
            }
          })) as T;

          return { data, model: modelLabel, tokensUsed: null };
        },
        {
          numOfAttempts: 3,
          startingDelay: 1000,
          timeMultiple: 2,
          jitter: 'full',
          retry: (error) => {
            const detail = this.providerErrorDetail(error);

            // Ground-truth quota signal: a 429 means the rate limiter did NOT
            // keep us under the provider's cap. Record it distinctly from generic
            // retries so it can be alerted on directly (see recordLLMRateLimited).
            if (this.isRateLimitError(error)) {
              this.metricsService.recordLLMRateLimited('invokeStructured');
              this.logger.warn(
                `LLM provider rate limit (429) — limiter did not prevent it${detail}`,
                error
              );
            }

            const retryable = this.isRetryableApiError(error);
            if (retryable) {
              this.metricsService.recordLLMRetry('invokeStructured');
              this.logger.warn(`Retryable OpenAI error, retrying...${detail}`, error);
            } else {
              // Non-retryable (4xx) used to return false with no log at all, so a
              // rejected parameter or schema was invisible outside Sentry. This is
              // the branch where the provider's own message actually explains the
              // failure, so it's the one that most needs the decoded detail.
              this.logger.warn(
                `Non-retryable [${target.provider}:${modelLabel}] error, not retrying${detail}`,
                error
              );
            }
            return retryable;
          },
        }
      );

      traceLlmCall({
        op: 'invokeStructured',
        provider: target.provider,
        model: modelLabel,
        temperature,
        maxTokens,
        durationMs: Date.now() - startTime,
        ok: true,
        input: traceInput,
        output: result.data,
        context: traceContext,
      });

      return result;
    } catch (error) {
      const detail = this.providerErrorDetail(error);

      // Log before rethrowing. Without this the only record of a failed LLM call
      // was the Sentry event — in local dev (no DSN) a 4xx vanished entirely and
      // surfaced only as the caller's downstream fallback.
      this.logger.error(
        `invokeStructured failed [${target.provider}:${modelLabel}]${detail}: ` +
          `${error instanceof Error ? error.message : String(error)}`
      );

      traceLlmCall({
        op: 'invokeStructured',
        provider: target.provider,
        model: modelLabel,
        temperature,
        maxTokens,
        durationMs: Date.now() - startTime,
        ok: false,
        input: traceInput,
        error: `${error instanceof Error ? error.message : String(error)}${detail}`,
        context: traceContext,
      });

      Sentry.captureException(error, {
        tags: {
          operation: 'invokeStructured',
          provider: target.provider,
          model: modelLabel,
          // Distinguishes a quota breach (retries exhausted on 429s) from other
          // failures, so "limiter insufficient" can be alerted on directly.
          rateLimited: this.isRateLimitError(error),
        },
        // `providerDetail` carries the provider's own message/metadata, which the
        // Error's `message` often flattens away (LangChain wraps some provider
        // bodies) — it's usually the only field that names the rejected param.
        extra: { messageCount: messages.length, maxRetries: 3, providerDetail: detail },
      });
      throw error;
    }
    // NB: llm.request.duration is recorded inside the schedule callback (provider
    // round-trip only) — deliberately NOT here, which would include queue/pacing
    // wait. `startTime` remains only for the dev-only LLM_TRACE end-to-end dump.
  }

  /**
   * Build the LangChain chat client for a resolved target. This is the only
   * place provider vocabulary lives — callers pass a target, never wire a client.
   *
   * `maxRetries: 0` on every instance is load-bearing: LangChain's AsyncCaller
   * otherwise retries a failed request up to 6 times (429 included) *inside* a
   * single call to `invoke()` — i.e. inside one rate-limiter slot — which would
   * fire up to 7 provider requests per slot and undercount our 429 signal. We
   * disable it so `invokeStructured`'s `backOff` is the sole retry authority:
   * every attempt then goes through `rateLimiter.schedule()` (consuming a slot,
   * minTime-paced) and every 429 reaches `recordLLMRateLimited`.
   */
  private createChatModel(
    target: ModelTarget,
    temperature: number,
    maxTokens: number,
    endpointIndex: number
  ): BaseChatModel {
    switch (target.provider) {
      case 'openai':
        return new ChatOpenAI({
          openAIApiKey: this.openaiApiKey,
          model: target.model,
          temperature,
          maxTokens,
          maxRetries: 0, // see method doc — our backOff is the only retry layer
        });
      case 'openrouter': {
        if (!this.openrouterApiKey) throw new Error('Missing config: app.openrouter.apiKey');
        // OpenRouter is OpenAI-wire-compatible: reuse ChatOpenAI, just repoint the base URL.
        // Reasoning ("think") control and upstream provider routing ride along as
        // extra request-body params via modelKwargs.
        //
        // Reasoning tokens share the completion budget, so a thinking model needs
        // headroom ON TOP of the caller's answer budget — otherwise the structured
        // output gets truncated mid-JSON once thinking eats maxTokens. The node's
        // maxTokens stays the answer budget; we add the reasoning overhead here.
        return new ChatOpenAI({
          apiKey: this.openrouterApiKey,
          model: target.model,
          temperature,
          maxTokens: maxTokens + reasoningHeadroom(target.thinkMode),
          modelKwargs: this.openrouterKwargs(target),
          configuration: { baseURL: 'https://openrouter.ai/api/v1' },
          maxRetries: 0, // see createChatModel doc — our backOff is the only retry layer
        });
      }
      case 'azure-foundry': {
        // Pick the endpoint the resolver routed this call to. `endpointIndex` is
        // the SAME value that selected the rate-limiter bucket in invokeStructured,
        // so this key's credentials are always paced by this key's limiter.
        const endpoint = this.endpointResolver.endpoints[endpointIndex];
        if (!endpoint) throw new Error('Missing config: app.azureFoundry.endpoints');
        // Azure AI Foundry serves DeepSeek through its OpenAI-compatible `/openai/v1`
        // surface, so — like OpenRouter — we reuse ChatOpenAI and just repoint the
        // base URL. The API key rides as a Bearer token, which ChatOpenAI does for us.
        //
        // Same reasoning-token headroom rule as OpenRouter: thinking shares the
        // completion budget, so add overhead on top of the caller's answer budget.
        return new ChatOpenAI({
          apiKey: endpoint.apiKey,
          model: target.model,
          temperature,
          maxTokens: maxTokens + reasoningHeadroom(target.thinkMode),
          modelKwargs: azureFoundryKwargs(target),
          configuration: { baseURL: endpoint.baseURL },
          maxRetries: 0, // see createChatModel doc — our backOff is the only retry layer
        });
      }
    }
  }

  /**
   * Translate an OpenRouter target's semantic options into extra request-body
   * params. Single point that owns the OpenRouter wire format.
   *
   * Reasoning uses OpenRouter's normalized `reasoning` map. DeepSeek V4 supports
   * effort `high` and `xhigh` (xhigh = max reasoning); `off` disables thinking.
   * `provider.order` pins the upstream inference provider (e.g. digitalocean).
   */
  private openrouterKwargs(target: Extract<ModelTarget, { provider: 'openrouter' }>): Record<
    string,
    unknown
  > {
    const kwargs: Record<string, unknown> = {};

    if (target.thinkMode === 'off') {
      kwargs.reasoning = { enabled: false };
    } else if (target.thinkMode === 'max') {
      kwargs.reasoning = { effort: 'xhigh' };
    } else if (target.thinkMode === 'high') {
      kwargs.reasoning = { effort: 'high' };
    } else if (target.thinkMode === 'low') {
      kwargs.reasoning = { effort: 'low' };
    }

    // `only` hard-pins to the chosen upstream provider(s) — no fallback to any
    // other endpoint — so a per-provider A/B stays clean (every request runs on
    // the provider under test). Trade-off: a request that provider can't serve
    // fails with "No endpoints found" instead of silently routing elsewhere.
    if (target.route?.length) {
      kwargs.provider = { only: target.route };
    }

    return kwargs;
  }

  /**
   * Transcribe audio using AssemblyAI Universal-3 Pro with UK-compliant PII redaction
   * Uses audio_url to avoid downloading file to API server
   *
   * @param audioUrl - Presigned S3 URL for the audio file
   * @returns Transcription result with PII-redacted text and metadata
   */
  async transcribeAudio(audioUrl: string): Promise<TranscriptionResult> {
    this.logger.log('Starting transcription with AssemblyAI Universal-3 Pro');

    const startTime = Date.now();
    try {
      const result = await backOff(
        async () => {
          // Submit + poll via the SDK's own bounded wait. Using `pollingTimeout`
          // (rather than a Promise.race against a setTimeout) means the SDK stops
          // its polling loop on timeout instead of us abandoning it — a race only
          // discards the losing promise, leaving the SDK polling in the background
          // until the job reaches a terminal status.
          //
          // TODO(transcription-timeout): `pollingTimeout` is NOT an end-to-end
          // deadline. It's measured from AFTER submit() and only checked BETWEEN
          // polls, and the SDK (v4.23.1) passes no AbortSignal on submit()/get()
          // (only LeMUR does). So a stalled submit POST or a single poll GET is
          // bounded only by undici's per-request default (~300s, version-dependent),
          // not the intended 120s — and TranscriptionStage has no outer timeout, so
          // the message stays "processing" that whole time (and the outbox may
          // re-claim it after the 30s stale-lock reset → duplicate submits).
          // FIX: restore a wall-clock cap alongside pollingTimeout — wrap this call
          // in `Promise.race([transcribe(...), timeoutPromise(TRANSCRIPTION_TIMEOUT_MS)])`
          // with `clearTimeout` in a `finally` (keep pollingTimeout so the abandoned
          // poll loop still self-terminates). AbortSignal isn't an option until the
          // SDK plumbs one through the transcribe path. Add a fake-timer test that a
          // never-settling transcribe rejects at the cap.
          let transcript;
          try {
            transcript = await this.assemblyai.transcripts.transcribe(
              {
                audio_url: audioUrl,
                speech_models: ['universal-3-pro'] as unknown as SpeechModel[],
                language_code: 'en_uk',
                // Medical keyterms for improved accuracy
                keyterms_prompt: MEDICAL_KEYTERMS,
              },
              { pollingTimeout: TRANSCRIPTION_TIMEOUT_MS }
            );
          } catch (err) {
            // Normalize the SDK's terse "Polling timeout" into our descriptive
            // message so logs stay informative AND the backOff "don't retry
            // timeouts" guard (which matches "timed out") keeps working. Match
            // case-insensitively via includes() rather than `===` — the SDK string
            // is an undocumented internal, so tolerate casing/wrapping changes.
            if (err instanceof Error && err.message.toLowerCase().includes('polling timeout')) {
              throw new Error(`Transcription timed out after ${TRANSCRIPTION_TIMEOUT_MS}ms`);
            }
            throw err;
          }

          if (transcript.status === 'error') {
            this.logger.error(`Transcription failed: ${transcript.error}`);
            throw new Error(`Transcription failed: ${transcript.error}`);
          }

          const wordCount = transcript.words?.length ?? 0;
          const confidence = transcript.confidence ?? null;
          const audioDurationMs = transcript.audio_duration
            ? Math.round(transcript.audio_duration * 1000)
            : null;

          this.logger.log(
            `Transcription completed: ${wordCount} words, confidence: ${confidence}, duration: ${audioDurationMs}ms`
          );

          return {
            text: transcript.text ?? '',
            confidence,
            audioDurationMs,
            wordCount,
          };
        },
        {
          numOfAttempts: 3,
          startingDelay: 2000,
          timeMultiple: 2,
          jitter: 'full',
          retry: (error) => {
            // Don't retry timeouts — they've already waited long enough
            if (error instanceof Error && error.message.includes('timed out')) return false;

            const retryable = this.isRetryableApiError(error);
            if (retryable) {
              this.metricsService.recordLLMRetry('transcribeAudio');
              this.logger.warn(
                `Retryable AssemblyAI error, retrying...${this.providerErrorDetail(error)}`,
                error
              );
            }
            return retryable;
          },
        }
      );

      traceLlmCall({
        op: 'transcribeAudio',
        provider: 'assemblyai',
        model: 'universal-3-pro',
        durationMs: Date.now() - startTime,
        ok: true,
        input: { audioUrl },
        output: result,
      });

      return result;
    } catch (error) {
      traceLlmCall({
        op: 'transcribeAudio',
        provider: 'assemblyai',
        model: 'universal-3-pro',
        durationMs: Date.now() - startTime,
        ok: false,
        input: { audioUrl },
        error: error instanceof Error ? error.message : String(error),
      });

      Sentry.captureException(error, {
        tags: { operation: 'transcribeAudio' },
        extra: { maxRetries: 3 },
      });
      throw error;
    } finally {
      this.metricsService.recordLLMDuration(
        'transcribeAudio',
        'assemblyai',
        Date.now() - startTime
      );
    }
  }

  /**
   * Decode the provider's own error body into a short, log-safe suffix.
   *
   * Why this exists: the thrown Error's `message` is often the least informative
   * part of a provider failure. OpenAI puts the actionable text in `error.error`
   * ({ message, type, param, code } — e.g. "Unsupported parameter: 'temperature'"),
   * while OpenRouter nests the upstream provider's verbatim response under
   * `error.metadata.raw`/`.reasons` — so a Cloudflare/DeepInfra rejection reaches us
   * as a generic 400 whose real cause is only in `metadata`. Reading those fields
   * turns "Request failed with status code 400" into something diagnosable, and
   * `upstream=` identifies WHICH provider rejected it on a multi-route variant.
   *
   * Returns '' (never throws) so it is always safe to interpolate into a log line
   * or a Sentry field — an error shape we didn't anticipate must not become a
   * second error inside the handler for the first one. Truncated to 500 chars
   * because some providers echo the entire request body back.
   */
  private providerErrorDetail(error: unknown): string {
    try {
      // Provider error bodies are untyped by nature — every provider nests them
      // differently, which is the whole reason this probing exists.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = error as any;
      const body = e?.error ?? e?.response?.data?.error ?? e?.response?.data;
      const meta = body?.metadata ?? e?.metadata;
      const parts: string[] = [];

      const status = e?.status ?? e?.statusCode ?? body?.code;
      if (status !== undefined) parts.push(`status=${status}`);
      if (meta?.provider_name) parts.push(`upstream=${meta.provider_name}`);

      const raw = meta?.raw ?? meta?.reasons ?? body?.message;
      if (raw) {
        const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        parts.push(`raw=${text.slice(0, 500)}`);
      }

      return parts.length > 0 ? ` [${parts.join(' ')}]` : '';
    } catch {
      return '';
    }
  }

  /**
   * Whether an error is a provider rate-limit (429). Single source of truth for
   * 429 detection — used both to record the quota signal and (via
   * isRetryableApiError) to decide retries.
   */
  private isRateLimitError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    // Structured status is authoritative when present — a 400 whose message
    // happens to contain "429" (e.g. "…you requested 8429 tokens") must NOT
    // count as a rate limit.
    const status = (error as any).status ?? (error as any).statusCode;
    if (typeof status === 'number') return status === 429;

    // Fallback for errors carrying no status. Word-boundary match so digit
    // substrings like "8429" don't false-positive.
    return /\b429\b/.test(error.message) || /rate limit/i.test(error.message);
  }

  private isRetryableApiError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    // Rate limits are retryable
    if (this.isRateLimitError(error)) return true;

    // Structured status is authoritative when present — trust it and do not
    // message-match (avoids "…1500 tokens" matching a 5xx substring).
    const status = (error as any).status ?? (error as any).statusCode;
    if (typeof status === 'number') return status >= 500;

    // Fallback for errors carrying no status. Word-boundary match on 5xx so
    // digit substrings in a 4xx message don't false-positive.
    const message = error.message.toLowerCase();
    if (/\b50[0-4]\b/.test(error.message) || message.includes('gateway')) return true;
    if (message.includes('econnreset') || message.includes('econnrefused')) return true;
    if (message.includes('etimedout') || message.includes('network')) return true;

    return false;
  }
}
