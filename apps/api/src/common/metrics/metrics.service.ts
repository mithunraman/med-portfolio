import { Injectable } from '@nestjs/common';
import { Counter, Histogram, metrics, UpDownCounter } from '@opentelemetry/api';

@Injectable()
export class MetricsService {
  private readonly meter = metrics.getMeter('portfolio-api');

  // --- Outbox metrics ---
  private readonly outboxJobsActive: UpDownCounter;
  private readonly outboxJobDuration: Histogram;
  private readonly outboxJobsFailed: Counter;
  private readonly outboxQueueDepth: Histogram;

  // --- LLM metrics ---
  private readonly llmRequestDuration: Histogram;
  private readonly llmRequestRetries: Counter;

  constructor() {
    this.outboxJobsActive = this.meter.createUpDownCounter('outbox.jobs.active', {
      description: 'Number of outbox jobs currently in flight',
    });

    this.outboxJobDuration = this.meter.createHistogram('outbox.job.duration_ms', {
      description: 'Processing time per outbox job in milliseconds',
      unit: 'ms',
    });

    this.outboxJobsFailed = this.meter.createCounter('outbox.jobs.failed_total', {
      description: 'Total number of failed outbox jobs',
    });

    this.outboxQueueDepth = this.meter.createHistogram('outbox.queue.depth', {
      description: 'Number of pending entries in the outbox queue',
    });

    this.llmRequestDuration = this.meter.createHistogram('llm.request.duration_ms', {
      description: 'LLM API call latency in milliseconds',
      unit: 'ms',
    });

    this.llmRequestRetries = this.meter.createCounter('llm.request.retries_total', {
      description: 'Total number of LLM API retry attempts',
    });
  }

  // --- Outbox ---

  recordOutboxJobStart(): void {
    this.outboxJobsActive.add(1);
  }

  recordOutboxJobEnd(type: string, durationMs: number): void {
    this.outboxJobsActive.add(-1);
    this.outboxJobDuration.record(durationMs, { type });
  }

  recordOutboxJobFailure(type: string): void {
    this.outboxJobsFailed.add(1, { type });
  }

  recordOutboxQueueDepth(count: number): void {
    this.outboxQueueDepth.record(count);
  }

  // --- LLM ---

  recordLLMDuration(operation: string, model: string, durationMs: number): void {
    this.llmRequestDuration.record(durationMs, { operation, model });
  }

  recordLLMRetry(operation: string): void {
    this.llmRequestRetries.add(1, { operation });
  }
}
