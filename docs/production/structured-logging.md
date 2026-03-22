# Structured Logging with Pino

## Overview

Replace the default NestJS console logger with Pino (`nestjs-pino`) so all log output becomes structured JSON. In development, logs are pretty-printed to the console. In production, raw NDJSON goes to stdout for collection by ELK, Datadog, or any log aggregator — with zero application code changes.

## Current State

- 34 files use `new Logger(ClassName.name)` from `@nestjs/common`
- No HTTP request logging exists
- No structured logging, correlation IDs, or header redaction
- No `LOG_LEVEL` environment variable

---

## Phase 1: Install and Bootstrap Pino Logger ✅

### Objective

Replace the default NestJS console logger with Pino. All existing `Logger` call sites continue working with no code changes.

### Scope

- **Included:** Install dependencies, register `LoggerModule` in `AppModule`, wire Pino as the app logger in `main.ts`, add `LOG_LEVEL` env var.
- **Excluded:** No changes to existing `new Logger()` call sites. No request logging configuration. No header redaction.

### Implementation

1. Install `nestjs-pino`, `pino-http` (prod), `pino-pretty` (dev)
2. Add `LOG_LEVEL` to env schema in `app.config.ts`
3. Register `LoggerModule.forRootAsync()` in `app.module.ts` with env-driven config
4. Call `app.useLogger(app.get(Logger))` in `main.ts`

### Key Decisions

- `pino-pretty` is a dev dependency only — production uses raw JSON (faster, no extra serialization)
- `transport` is `undefined` in production — Pino writes directly to stdout (12-factor logging)
- Log level controlled via `LOG_LEVEL` env var, defaults to `info`

---

## Phase 2: HTTP Request Logging ✅

### Objective

Log every incoming HTTP request with method, URL, status code, response time, and user ID.

### Scope

- **Included:** `pino-http` request/response logging, user ID from JWT, sensitive header redaction, health-check exclusion.
- **Excluded:** No correlation IDs. No custom serializers.

### Implementation

1. Add `customProps` to attach `userId` from `req.user` (populated by Passport)
2. Add `redact` for `Authorization` and `cookie` headers
3. Add `autoLogging.ignore` to skip health-check endpoints
4. Custom success/error messages for cleaner output

### Key Decisions

- Logs on `res.finish` (not request arrival) — captures final status code and total duration
- `userId` is `undefined` on `@Public()` routes — expected and informative
- Response bodies are NOT logged — PII risk and volume concern

---

## Phase 3: Request Correlation IDs ✅

### Objective

Assign every request a unique ID. All log lines from a single request share the same `reqId`.

### Implementation

1. `genReqId` honours client `X-Request-Id` header, falls back to `crypto.randomUUID()`
2. `X-Request-Id` returned in response headers via `customProps`
3. `nestjs-pino` uses `AsyncLocalStorage` to auto-propagate `reqId` to all `Logger` calls within the request

### Notes

- Portfolio graph nodes using module-level `const logger = new Logger('NodeName')` won't get request-scoped context automatically (they're not injectable). Can be addressed by injecting `PinoLogger` if needed.

---

## Phase 4: Production Readiness (planned)

### Objective

Optimise log format for production — lean serializers, structured error stacks, documented schema.

### Implementation (future)

1. Custom request serializer: only `method` and `url` (omit headers, remote address)
2. Custom response serializer: only `statusCode`
3. Error serializer via `pino.stdSerializers.err` for structured stack traces
4. Document log schema for infrastructure team

### Log Schema (target)

| Field | Type | Description |
|-------|------|-------------|
| `level` | number | Pino log level (30=info, 40=warn, 50=error) |
| `time` | number | Unix timestamp (ms) |
| `reqId` | string | Request correlation ID |
| `req.method` | string | HTTP method |
| `req.url` | string | Request URL |
| `res.statusCode` | number | HTTP status code |
| `responseTime` | number | Duration in ms |
| `userId` | string | User ID from JWT (undefined for public routes) |
| `msg` | string | Log message |

### Production Collection

- Format: Newline-delimited JSON (NDJSON) on stdout
- **ELK:** Filebeat/Fluentd reads container stdout → Elasticsearch
- **Datadog:** Datadog Agent auto-collects container stdout
- **CloudWatch:** ECS/Lambda auto-captures stdout
- **Zero application code changes** required to switch aggregators
