import { Controller, Get, Query } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/nestjs';
import { Connection } from 'mongoose';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DevOnly } from '../common/decorators/dev-only.decorator';
import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from '../common/metrics';

/**
 * Observability demo controller.
 *
 * Exercises Pino (logs), OpenTelemetry (traces + metrics), and Sentry (errors)
 * through a single request so you can see them correlated in Grafana & Sentry.
 *
 * All endpoints are @Public() and @DevOnly() — no auth needed, development only.
 * Returns 404 in non-development environments.
 */
@DevOnly()
@Controller('health/o11y-demo')
export class O11yDemoController {
  private readonly tracer = trace.getTracer('o11y-demo');

  constructor(
    @InjectPinoLogger(O11yDemoController.name)
    private readonly logger: PinoLogger,
    @InjectConnection() private readonly connection: Connection,
    private readonly metricsService: MetricsService
  ) {}

  // ──────────────────────────────────────────────────────────────────────
  // 1. Happy path — all three pillars working together
  //    GET /api/health/o11y-demo
  //
  //    What to look for:
  //    • Terminal  → Pino logs with trace_id, span_id, reqId
  //    • Grafana   → Trace waterfall: Express → NestJS → custom "demo-work"
  //                   span → Mongoose "db.ping"
  //    • Grafana   → Metric: demo.request.duration_ms
  // ──────────────────────────────────────────────────────────────────────
  @Get()
  @Public()
  async happyPath() {
    const start = Date.now();

    // --- PINO: structured log with automatic trace_id/span_id ---
    this.logger.info('o11y-demo: starting happy path');

    // --- OTEL: create a custom child span ---
    const result = await this.tracer.startActiveSpan('demo-work', async (span) => {
      span.setAttribute('demo.step', 'simulate-work');

      // Simulate some async work
      await new Promise((r) => setTimeout(r, 50));

      // --- MONGOOSE INSTRUMENTATION: this creates a Mongoose span ---
      const dbStatus = await this.connection.db!.admin().ping();
      this.logger.info({ dbStatus }, 'o11y-demo: MongoDB ping succeeded');

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return { db: 'ok', latencyMs: Date.now() - start };
    });

    // --- OTEL METRIC: record a custom histogram value ---
    this.metricsService.recordLLMDuration('demo', 'none', Date.now() - start);

    this.logger.info({ durationMs: Date.now() - start }, 'o11y-demo: happy path complete');

    return {
      status: 'ok',
      ...result,
      what_to_check: {
        terminal: 'Look for 3 log lines with matching reqId, trace_id, span_id',
        grafana_traces: 'Search traces for service=portfolio-api, span name "demo-work"',
        grafana_metrics: 'Query: llm_request_duration_ms{operation="demo"}',
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // 2. Error path — shows Sentry capture + error trace
  //    GET /api/health/o11y-demo/error
  //
  //    What to look for:
  //    • Sentry    → New issue with tag operation=demo, fingerprint visible
  //    • Terminal  → Pino ERROR log with trace_id
  //    • Grafana   → Trace with error status on the "demo-error" span
  // ──────────────────────────────────────────────────────────────────────
  @Get('error')
  @Public()
  async errorPath() {
    this.logger.info('o11y-demo: starting error path');

    let caughtError: Error | undefined;
    try {
      await this.tracer.startActiveSpan('demo-error', async (span) => {
        span.setAttribute('demo.step', 'will-fail');

        // Simulate a failure
        const error = new Error('Demo: simulated LLM timeout after 3 retries');
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        span.end();

        throw error;
      });
    } catch (error) {
      caughtError = error as Error;
      caughtError = error as Error;
    }

    // --- SENTRY: capture with tags, just like llm.service.ts does ---
    Sentry.captureException(caughtError, {
      tags: { operation: 'demo', model: 'none' },
      extra: { simulatedRetries: 3 },
    });

    this.logger.error('o11y-demo: error path triggered — check Sentry for the issue');

    return {
      status: 'error_captured',
      what_to_check: {
        sentry: 'New issue: "Demo: simulated LLM timeout after 3 retries" with tag operation=demo',
        terminal: 'Pino ERROR log with the same trace_id as the trace in Grafana',
        grafana_traces: 'Search traces for "demo-error" — span should show error status (red)',
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // 3. Metrics burst — fires a batch of metric data points
  //    GET /api/health/o11y-demo/metrics?count=10
  //
  //    What to look for:
  //    • Grafana   → Metric spike in demo.burst.count and demo.burst.duration_ms
  //                   (visible after the 60s export interval)
  // ──────────────────────────────────────────────────────────────────────
  @Get('metrics')
  @Public()
  async metricsBurst(@Query('count') countStr?: string) {
    const count = Math.min(parseInt(countStr || '10', 10) || 10, 100);

    this.logger.info({ count }, 'o11y-demo: recording metrics burst');

    for (let i = 0; i < count; i++) {
      // Simulate varied latencies between 50-500ms
      const fakeDuration = Math.floor(Math.random() * 450) + 50;
      this.metricsService.recordLLMDuration('demo-burst', 'gpt-4.1-mini', fakeDuration);
    }

    return {
      status: 'ok',
      recorded: count,
      what_to_check: {
        grafana_metrics: [
          'Wait ~60s for the metric export interval, then query:',
          'llm_request_duration_ms{operation="demo-burst"}',
          `You should see ${count} new data points with values 50-500ms`,
        ],
      },
    };
  }
}
