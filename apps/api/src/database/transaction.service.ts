import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession } from 'mongoose';

export interface TransactionOptions {
  context?: string;
}

const MAX_TRANSIENT_RETRIES = 2;

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(@InjectConnection() private connection: Connection) {}

  async withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    const context = options?.context || 'unknown';

    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      const session = await this.connection.startSession();

      try {
        session.startTransaction();
        this.logger.debug(`Transaction started: ${context}`);

        const result = await fn(session);

        await session.commitTransaction();
        this.logger.debug(`Transaction committed: ${context}`);

        return result;
      } catch (error) {
        await session.abortTransaction();

        // MongoDB tags transient errors (e.g. replica set elections) with
        // TransientTransactionError. These are safe and recommended to retry.
        const isTransient =
          error instanceof Error &&
          'hasErrorLabel' in error &&
          typeof (error as any).hasErrorLabel === 'function' &&
          (error as any).hasErrorLabel('TransientTransactionError');

        if (isTransient && attempt < MAX_TRANSIENT_RETRIES) {
          this.logger.warn(
            `Transient transaction error (${context}), retry ${attempt + 1}/${MAX_TRANSIENT_RETRIES}`,
          );
          continue;
        }

        this.logger.error(`Transaction aborted: ${context}`, error);
        throw error;
      } finally {
        session.endSession();
      }
    }

    // This is unreachable in practice — the loop always returns or throws.
    // Included for TypeScript exhaustiveness.
    throw new Error(`Transaction failed after ${MAX_TRANSIENT_RETRIES} retries: ${context}`);
  }
}
