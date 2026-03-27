// Sentry must be initialized before any other imports.
// This file is imported first in main.ts.
import * as Sentry from '@sentry/nestjs';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env early — NestJS ConfigModule hasn't booted yet at this point.
config({ path: resolve(__dirname, '..', '.env') });

const dsn = process.env.SENTRY_DSN;

if (!dsn) {
  console.error('❌ SENTRY_DSN is required. Set it in your .env file.');
  process.exit(1);
}

Sentry.init({
  dsn,
  environment: process.env.NODE_ENV || 'development',

  // Tracing handled by OpenTelemetry (tracing.ts) — Sentry is error-only.
  tracesSampleRate: 0,

  // Avoid capturing PII in request bodies by default
  sendDefaultPii: false,
});
