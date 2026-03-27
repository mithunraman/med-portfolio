// OpenTelemetry must be initialized before NestJS/Express/Mongoose are imported
// so it can monkey-patch their modules for auto-instrumentation.
// Import order in main.ts: instrument.ts (Sentry) → tracing.ts (OTel) → NestFactory.

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// .env already loaded by instrument.ts (runs first).
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const headers = process.env.OTEL_EXPORTER_OTLP_HEADERS;

if (!endpoint || !headers) {
  console.error(
    '❌ OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS are required. Set them in your .env file.'
  );
  process.exit(1);
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'portfolio-api',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),

  traceExporter: new OTLPTraceExporter(),

  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis: 60_000,
  }),

  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable fs instrumentation — too noisy, no value
      '@opentelemetry/instrumentation-fs': { enabled: false },
      // Disable DNS — low value, adds noise
      '@opentelemetry/instrumentation-dns': { enabled: false },
      // Disable Net — low-level socket spans are noise
      '@opentelemetry/instrumentation-net': { enabled: false },
    }),
  ],
});

sdk.start();

// Graceful shutdown — flush pending telemetry on process exit
process.on('SIGTERM', () => {
  sdk.shutdown().catch(console.error);
});
