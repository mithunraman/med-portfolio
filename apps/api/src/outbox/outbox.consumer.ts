import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { OutboxService } from './outbox.service';
import type { OutboxEntry } from './schemas/outbox.schema';

export interface OutboxHandler {
  readonly type: string;
  handle(payload: Record<string, unknown>): Promise<void>;
}

export const OUTBOX_HANDLERS = Symbol('OUTBOX_HANDLERS');

/** Default polling interval: 1 second */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/** Maximum number of jobs running concurrently */
const MAX_CONCURRENCY = 5;

@Injectable()
export class OutboxConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxConsumer.name);
  private readonly handlers = new Map<string, OutboxHandler>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activeJobs = 0;
  private isPolling = false;

  constructor(
    private readonly outboxService: OutboxService,
    @Optional() @Inject(OUTBOX_HANDLERS) handlers?: OutboxHandler[]
  ) {
    if (handlers) {
      for (const handler of handlers) {
        this.handlers.set(handler.type, handler);
      }
    }
  }

  /**
   * Register a handler for a specific outbox job type at runtime.
   */
  registerHandler(handler: OutboxHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`Handler already registered for type: ${handler.type}`);
    }
    this.handlers.set(handler.type, handler);
    this.logger.log(`Registered outbox handler for type: ${handler.type}`);
  }

  onModuleInit(): void {
    this.logger.log(
      `Outbox consumer starting with ${this.handlers.size} handler(s): ` +
        `[${[...this.handlers.keys()].join(', ')}]`
    );
    this.startPolling();
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    this.logger.log(
      `Polling outbox every ${DEFAULT_POLL_INTERVAL_MS}ms (max concurrency: ${MAX_CONCURRENCY})`
    );
    this.pollTimer = setInterval(() => this.poll(), DEFAULT_POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.log('Outbox consumer stopped');
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    const freeSlots = MAX_CONCURRENCY - this.activeJobs;
    if (freeSlots <= 0) return;

    this.isPolling = true;
    try {
      // Reset stale locks first (handles crashed consumers)
      await this.outboxService.resetStaleLocks();

      // Claim only as many jobs as we have capacity for
      const entries = await this.outboxService.claimBatch(freeSlots);
      if (entries.length === 0) return;

      this.logger.debug(`Claimed ${entries.length} outbox entries (active: ${this.activeJobs})`);

      // Launch each job independently — no waiting for siblings
      for (const entry of entries) {
        this.activeJobs++;
        this.processEntry(entry).finally(() => {
          this.activeJobs--;
        });
      }
    } catch (error) {
      this.logger.error('Error during outbox poll cycle', error);
    } finally {
      this.isPolling = false;
    }
  }

  private async processEntry(entry: OutboxEntry): Promise<void> {
    const handler = this.handlers.get(entry.type);
    if (!handler) {
      this.logger.error(`No handler registered for outbox type: ${entry.type}`);
      await this.outboxService.markFailed(
        entry._id,
        `No handler registered for type: ${entry.type}`
      );
      return;
    }

    try {
      await handler.handle(entry.payload);
      await this.outboxService.markCompleted(entry._id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Handler failed for outbox entry ${entry._id} (type: ${entry.type}): ${errorMessage}`
      );
      await this.outboxService.markFailed(entry._id, errorMessage);
    }
  }
}
