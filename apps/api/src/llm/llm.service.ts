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
import { LlmTraceContext, traceLlmCall } from './llm-trace.util';
import { MEDICAL_KEYTERMS, TRANSCRIPTION_TIMEOUT_MS } from './medical-keyterms';

export const OpenAIModels = {
  GPT_5_4: 'gpt-5.4',
  GPT_5_4_NANO: 'gpt-5.4-nano',
  GPT_4_1: 'gpt-4.1',
  GPT_4_1_MINI: 'gpt-4.1-mini',
} as const;

export type OpenAIModel = (typeof OpenAIModels)[keyof typeof OpenAIModels];

/** Structured-output strategy passed to LangChain's withStructuredOutput(). */
export type StructuredMethod = 'functionCalling' | 'jsonSchema' | 'jsonMode';

/**
 * Reasoning ("think") mode for hybrid models (DeepSeek V4). `off` = non-thinking;
 * `high`/`max` set reasoning effort. Semantic here; LLMService translates it into
 * the provider's request params.
 */
export type ThinkMode = 'off' | 'high' | 'max';

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
  // Optional — only required when the active variant routes a stage to Azure
  // Foundry. Presence is enforced up front by ModelConfigService's guard.
  private readonly azureFoundryApiKey: string | undefined;
  private readonly azureFoundryBaseUrl: string | undefined;
  private readonly assemblyai: AssemblyAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService
  ) {
    const openaiApiKey = this.configService.get<string>('app.openai.apiKey');
    if (!openaiApiKey) throw new Error('Missing config: app.openai.apiKey');
    this.openaiApiKey = openaiApiKey;

    this.openrouterApiKey = this.configService.get<string>('app.openrouter.apiKey');

    this.azureFoundryApiKey = this.configService.get<string>('app.azureFoundry.apiKey');
    this.azureFoundryBaseUrl = this.configService.get<string>('app.azureFoundry.baseUrl');

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
    const { temperature = 0.1, maxTokens = 2000, traceContext, ...target } = options;
    const modelLabel = target.model;

    this.logger.debug(
      `invokeStructured [${target.provider}:${modelLabel}] messages:\n${messages.map((m) => `[${m.type}] ${m.content}`).join('\n')}`
    );

    // Captured for the dev-only LLM_TRACE dump (no-op unless enabled).
    const traceInput = messages.map((m) => ({ role: m.type, content: m.content }));

    const startTime = Date.now();
    try {
      const result = await backOff(
        async () => {
          const chatModel = this.createChatModel(target, temperature, maxTokens);

          // Cast to `any` to avoid TS2589 (excessive type depth) from LangChain's
          // heavily overloaded withStructuredOutput generics. Caller-side type
          // safety is preserved by the method signature: schema: ZodType<T> → T.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const structuredModel = (chatModel as any).withStructuredOutput(
            schema,
            target.structuredMethod ? { method: target.structuredMethod } : undefined
          );

          const data = (await structuredModel.invoke(messages)) as T;

          return { data, model: modelLabel, tokensUsed: null };
        },
        {
          numOfAttempts: 3,
          startingDelay: 1000,
          timeMultiple: 2,
          jitter: 'full',
          retry: (error) => {
            const retryable = this.isRetryableApiError(error);
            if (retryable) {
              this.metricsService.recordLLMRetry('invokeStructured');
              this.logger.warn(`Retryable OpenAI error, retrying...`, error);
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
      traceLlmCall({
        op: 'invokeStructured',
        provider: target.provider,
        model: modelLabel,
        temperature,
        maxTokens,
        durationMs: Date.now() - startTime,
        ok: false,
        input: traceInput,
        error: error instanceof Error ? error.message : String(error),
        context: traceContext,
      });

      Sentry.captureException(error, {
        tags: { operation: 'invokeStructured', provider: target.provider, model: modelLabel },
        extra: { messageCount: messages.length, maxRetries: 3 },
      });
      throw error;
    } finally {
      this.metricsService.recordLLMDuration('invokeStructured', modelLabel, Date.now() - startTime);
    }
  }

  /**
   * Build the LangChain chat client for a resolved target. This is the only
   * place provider vocabulary lives — callers pass a target, never wire a client.
   */
  private createChatModel(
    target: ModelTarget,
    temperature: number,
    maxTokens: number
  ): BaseChatModel {
    switch (target.provider) {
      case 'openai':
        return new ChatOpenAI({
          openAIApiKey: this.openaiApiKey,
          model: target.model,
          temperature,
          maxTokens,
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
        });
      }
      case 'azure-foundry': {
        if (!this.azureFoundryApiKey) throw new Error('Missing config: app.azureFoundry.apiKey');
        if (!this.azureFoundryBaseUrl) throw new Error('Missing config: app.azureFoundry.baseUrl');
        // Azure AI Foundry serves DeepSeek through its OpenAI-compatible `/openai/v1`
        // surface, so — like OpenRouter — we reuse ChatOpenAI and just repoint the
        // base URL. The API key rides as a Bearer token, which ChatOpenAI does for us.
        //
        // Same reasoning-token headroom rule as OpenRouter: thinking shares the
        // completion budget, so add overhead on top of the caller's answer budget.
        return new ChatOpenAI({
          apiKey: this.azureFoundryApiKey,
          model: target.model,
          temperature,
          maxTokens: maxTokens + reasoningHeadroom(target.thinkMode),
          modelKwargs: azureFoundryKwargs(target),
          configuration: { baseURL: this.azureFoundryBaseUrl },
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
          // Create transcription with timeout
          const transcriptPromise = this.assemblyai.transcripts.transcribe({
            audio_url: audioUrl,
            speech_models: ['universal-3-pro'] as unknown as SpeechModel[],
            language_code: 'en_uk',
            // Medical keyterms for improved accuracy
            keyterms_prompt: MEDICAL_KEYTERMS,
          });

          // Apply timeout (2 minutes for max 5-minute audio)
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Transcription timed out after ${TRANSCRIPTION_TIMEOUT_MS}ms`));
            }, TRANSCRIPTION_TIMEOUT_MS);
          });

          const transcript = await Promise.race([transcriptPromise, timeoutPromise]);

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
              this.logger.warn(`Retryable AssemblyAI error, retrying...`, error);
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

  private isRetryableApiError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    // Rate limits, server errors, network issues
    if (message.includes('429') || message.includes('rate limit')) return true;
    if (message.includes('500') || message.includes('502') || message.includes('503')) return true;
    if (message.includes('504') || message.includes('gateway')) return true;
    if (message.includes('econnreset') || message.includes('econnrefused')) return true;
    if (message.includes('etimedout') || message.includes('network')) return true;

    // Check for status code on error object (common in API client errors)
    const status = (error as any).status ?? (error as any).statusCode;
    if (typeof status === 'number') {
      return status === 429 || status >= 500;
    }

    return false;
  }
}
