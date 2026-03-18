import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { backOff } from 'exponential-backoff';
import { ClientSession, Connection } from 'mongoose';

export interface TransactionOptions {
  context?: string;
}

const MAX_ATTEMPTS = 3;
const STARTING_DELAY_MS = 100;

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(@InjectConnection() private connection: Connection) {}

  async withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const context = options?.context || 'unknown';

    return backOff(
      async () => {
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
          throw error;
        } finally {
          session.endSession();
        }
      },
      {
        numOfAttempts: MAX_ATTEMPTS,
        startingDelay: STARTING_DELAY_MS,
        timeMultiple: 2,
        jitter: 'full',
        retry: (error) => {
          const isTransient =
            error instanceof Error &&
            'hasErrorLabel' in error &&
            typeof (error as any).hasErrorLabel === 'function' &&
            (error as any).hasErrorLabel('TransientTransactionError');

          if (isTransient) {
            this.logger.warn(`Transient transaction error (${context}), retrying...`);
          } else {
            this.logger.error(`Transaction aborted: ${context}`, error);
          }

          return isTransient;
        },
      }
    );
  }
}
