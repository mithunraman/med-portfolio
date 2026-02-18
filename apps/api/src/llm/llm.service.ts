import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssemblyAI, PiiPolicy, SpeechModel } from 'assemblyai';
import {
  MEDICAL_KEYTERMS,
  NHS_NUMBER_PATTERN,
  TRANSCRIPTION_TIMEOUT_MS,
} from './medical-keyterms';

export const OpenAIModels = {
  GPT_4_1: 'gpt-4.1',
  GPT_4O_MINI: 'gpt-4o-mini',
} as const;

export type OpenAIModel = (typeof OpenAIModels)[keyof typeof OpenAIModels];

export const DEFAULT_MODEL: OpenAIModel = OpenAIModels.GPT_4_1;

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

export interface TranscriptionResult {
  text: string;
  confidence: number | null;
  audioDurationMs: number | null;
  wordCount: number;
}

/**
 * UK-compliant PII policies for medical portfolio entries
 * Redacts identifiers while preserving clinical content
 * Covers GDPR, UK Data Protection Act 2018, and NHS guidelines
 *
 * Note: 'medical_record_number' is cast as PiiPolicy since SDK types may lag behind API
 */
const UK_PII_POLICIES: PiiPolicy[] = [
  'person_name', // Patient/relative/staff names
  'date_of_birth', // Date of birth
  'phone_number', // Phone numbers
  'email_address', // Email addresses
  'location', // Addresses, specific locations
  'organization', // Hospital names, GP surgery names
  'date', // Specific dates that could identify patient
  'drivers_license', // ID numbers
  'medical_record_number' as PiiPolicy, // NHS numbers and medical IDs
  'credit_card_number', // Financial info
  'banking_information', // Financial info
];

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly openaiApiKey: string;
  private readonly assemblyai: AssemblyAI;

  constructor(private readonly configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('app.openai.apiKey')!;

    // AssemblyAI client for transcription with PII redaction
    this.assemblyai = new AssemblyAI({
      apiKey: this.configService.get<string>('app.assemblyai.apiKey')!,
    });
  }

  /**
   * Invoke an LLM with a system prompt and user content
   * Uses LangChain for model abstraction
   */
  async invoke(
    systemPrompt: string,
    userContent: string,
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    const { model = 'gpt-4.1', temperature = 0.1, maxTokens = 2000 } = options;

    const chatModel = new ChatOpenAI({
      openAIApiKey: this.openaiApiKey,
      model: model,
      temperature,
      maxTokens,
    });

    const messages = [new SystemMessage(systemPrompt), new HumanMessage(userContent)];

    const response = await chatModel.invoke(messages);

    // Extract content - LangChain returns AIMessage
    const content =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Extract token usage if available
    const tokensUsed = response.usage_metadata?.total_tokens ?? null;

    return {
      content,
      model,
      tokensUsed,
    };
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

    // Create transcription with timeout
    const transcriptPromise = this.assemblyai.transcripts.transcribe({
      audio_url: audioUrl,
      speech_model: 'universal-3-pro' as SpeechModel, // Cast: SDK types lag behind API
      language_code: 'en_uk',
      // Medical keyterms for improved accuracy
      keyterms_prompt: MEDICAL_KEYTERMS,
      // PII redaction
      redact_pii: true,
      redact_pii_policies: UK_PII_POLICIES,
      redact_pii_sub: 'entity_name', // Replace with entity type e.g. [PERSON_NAME]
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

    // Post-process: catch any NHS numbers that slipped through PII redaction
    const sanitizedText =
      transcript.text?.replace(NHS_NUMBER_PATTERN, '[NHS_NUMBER]') ?? '';

    const wordCount = transcript.words?.length ?? 0;
    const confidence = transcript.confidence ?? null;
    const audioDurationMs = transcript.audio_duration
      ? Math.round(transcript.audio_duration * 1000)
      : null;

    this.logger.log(
      `Transcription completed: ${wordCount} words, confidence: ${confidence}, duration: ${audioDurationMs}ms`
    );

    return {
      text: sanitizedText,
      confidence,
      audioDurationMs,
      wordCount,
    };
  }
}
