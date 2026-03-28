import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { MetricsService } from '../common/metrics';
import { sleep } from '../common/utils/sleep.util';
import { OutboxService } from './outbox.service';
import type { OutboxEntry } from './schemas/outbox.schema';

export interface OutboxHandler {
  readonly type: string;
  handle(payload: Record<string, unknown>): Promise<void>;
}

export const OUTBOX_HANDLERS = Symbol('OUTBOX_HANDLERS');

/** Default polling interval: 500ms */
const DEFAULT_POLL_INTERVAL_MS = 500;

/** Maximum number of jobs running concurrently */
const MAX_CONCURRENCY = 5;

@Injectable()
export class OutboxConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly handlers = new Map<string, OutboxHandler>();
  private running = false;
  private activeJobs = 0;

  constructor(
    @InjectPinoLogger(OutboxConsumer.name)
    private readonly logger: PinoLogger,
    private readonly outboxService: OutboxService,
    private readonly metricsService: MetricsService,
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
    this.logger.info(`Registered outbox handler for type: ${handler.type}`);
  }

  onModuleInit(): void {
    this.logger.info(
      `Outbox consumer starting with ${this.handlers.size} handler(s): ` +
        `[${[...this.handlers.keys()].join(', ')}]`
    );
    this.startPolling();
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    this.running = true;
    this.logger.info(
      `Polling outbox every ${DEFAULT_POLL_INTERVAL_MS}ms (max concurrency: ${MAX_CONCURRENCY})`
    );
    this.pollLoop();
  }

  private stopPolling(): void {
    this.running = false;
    this.logger.info('Outbox consumer stopped');
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.poll();
      } catch (error) {
        this.logger.error('Error during outbox poll cycle', error);
      }

      try {
        await sleep(DEFAULT_POLL_INTERVAL_MS);
      } catch {
        // sleep should never reject, but guard against loop death
      }
    }
  }

  private async poll(): Promise<void> {
    const freeSlots = MAX_CONCURRENCY - this.activeJobs;
    if (freeSlots <= 0) return;

    // Reset stale locks first (handles crashed consumers)
    await this.outboxService.resetStaleLocks();

    // Record queue depth before claiming
    const pendingCount = await this.outboxService.countPending();
    this.metricsService.recordOutboxQueueDepth(pendingCount);

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

    const startTime = Date.now();
    this.metricsService.recordOutboxJobStart();

    try {
      await handler.handle(entry.payload);
      await this.outboxService.markCompleted(entry._id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Handler failed for outbox entry ${entry._id} (type: ${entry.type}): ${errorMessage}`
      );
      Sentry.captureException(error, {
        tags: { outboxType: entry.type },
        extra: { entryId: String(entry._id) },
      });
      this.metricsService.recordOutboxJobFailure(entry.type);
      await this.outboxService.markFailed(entry._id, errorMessage);
    } finally {
      this.metricsService.recordOutboxJobEnd(entry.type, Date.now() - startTime);
    }
  }
}
