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
  metadata?: Record<string, unknown>;
}

export interface IProcessingStage {
  readonly name: string;
  execute(input: string, context: StageContext): Promise<StageResult>;
}
