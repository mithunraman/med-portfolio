import { BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { AssemblyAI, SpeechModel } from 'assemblyai';
import { backOff } from 'exponential-backoff';
import { z } from 'zod';
import { MetricsService } from '../common/metrics';
import { MEDICAL_KEYTERMS, TRANSCRIPTION_TIMEOUT_MS } from './medical-keyterms';

export const OpenAIModels = {
  GPT_5_4: 'gpt-5.4',
  GPT_5_4_NANO: 'gpt-5.4-nano',
  GPT_4_1: 'gpt-4.1',
  GPT_4_1_MINI: 'gpt-4.1-mini',
} as const;

export type OpenAIModel = (typeof OpenAIModels)[keyof typeof OpenAIModels];

export const DEFAULT_MODEL: OpenAIModel = OpenAIModels.GPT_4_1_MINI;

export interface LLMOptions {
  model?: OpenAIModel;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: OpenAIModel;
  tokensUsed: number | null;
}

export interface StructuredResponse<T> {
  data: T;
  model: OpenAIModel;
  tokensUsed: number | null;
}

export interface TranscriptionResult {
  text: string;
  confidence: number | null;
  audioDurationMs: number | null;
  wordCount: number;
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly openaiApiKey: string;
  private readonly assemblyai: AssemblyAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService
  ) {
    const openaiApiKey = this.configService.get<string>('app.openai.apiKey');
    if (!openaiApiKey) throw new Error('Missing config: app.openai.apiKey');
    this.openaiApiKey = openaiApiKey;

    const assemblyaiApiKey = this.configService.get<string>('app.assemblyai.apiKey');
    if (!assemblyaiApiKey) throw new Error('Missing config: app.assemblyai.apiKey');

    // AssemblyAI client for transcription with PII redaction
    this.assemblyai = new AssemblyAI({
      apiKey: assemblyaiApiKey,
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
    options: LLMOptions = {}
  ): Promise<StructuredResponse<T>> {
    const { model = DEFAULT_MODEL, temperature = 0.1, maxTokens = 2000 } = options;

    this.logger.debug(
      `invokeStructured [${model}] messages:\n${messages.map((m) => `[${m.type}] ${m.content}`).join('\n')}`
    );

    const startTime = Date.now();
    try {
      return await backOff(
        async () => {
          const chatModel = this.createChatModel({ model, temperature, maxTokens });

          // Cast to `any` to avoid TS2589 (excessive type depth) from LangChain's
          // heavily overloaded withStructuredOutput generics. Caller-side type
          // safety is preserved by the method signature: schema: ZodType<T> → T.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const structuredModel = (chatModel as any).withStructuredOutput(schema);

          const data = (await structuredModel.invoke(messages)) as T;

          return { data, model, tokensUsed: null };
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
    } catch (error) {
      Sentry.captureException(error, {
        tags: { operation: 'invokeStructured', model },
        extra: { messageCount: messages.length, maxRetries: 3 },
      });
      throw error;
    } finally {
      this.metricsService.recordLLMDuration('invokeStructured', model, Date.now() - startTime);
    }
  }

  private createChatModel(options: Required<LLMOptions>): ChatOpenAI {
    return new ChatOpenAI({
      openAIApiKey: this.openaiApiKey,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });
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
      return await backOff(
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
    } catch (error) {
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
