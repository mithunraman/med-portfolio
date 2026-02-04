import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession } from 'mongoose';

export interface TransactionOptions {
  context?: string;
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(@InjectConnection() private connection: Connection) {}

  async withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    const session = await this.connection.startSession();
    const context = options?.context || 'unknown';

    try {
      session.startTransaction();
      this.logger.debug(`Transaction started: ${context}`);

      const result = await fn(session);

      await session.commitTransaction();
      this.logger.debug(`Transaction committed: ${context}`);

      return result;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(`Transaction aborted: ${context}`, error);
      throw error;
    } finally {
      session.endSession();
    }
  }
}
