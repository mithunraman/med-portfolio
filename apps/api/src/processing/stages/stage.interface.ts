import { MediaType, Specialty } from '@acme/shared';
import { Types } from 'mongoose';

export interface StageContext {
  messageId: Types.ObjectId;
  conversationId: Types.ObjectId;
  specialty: Specialty;
  mediaType: MediaType | null;
}

export interface StageResult {
  text: string;
  /**
   * Set by a stage when it detects a prompt-injection attempt in the input. The
   * verdict travels here — a typed control channel — never inside `text`, so it
   * cannot collide with real content or be smuggled downstream. The processing
   * service maps this to a terminal REJECTED status.
   */
  injectionDetected?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IProcessingStage {
  readonly name: string;
  execute(input: string, context: StageContext): Promise<StageResult>;
}
