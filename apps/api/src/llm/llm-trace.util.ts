import { randomUUID } from 'crypto';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Dev-only LLM I/O tracer.
 *
 * When `LLM_TRACE=1` (and NODE_ENV !== 'production'), every LLM call's input and
 * output is appended as one JSON object per line to `logs/llm-trace-<date>.jsonl`
 * (relative to the process CWD — i.e. `apps/api/logs/` under `pnpm dev:api`).
 *
 * This is a local debugging aid, NOT production observability — use Sentry /
 * MetricsService for that. Two deliberate guardrails:
 *  - it is off unless explicitly opted in via `LLM_TRACE=1`, and never runs in
 *    production, because traced inputs contain clinical transcript content;
 *  - the `logs/` folder is gitignored — keep it that way.
 *
 * Every failure is swallowed: tracing must never alter or break an LLM call.
 */

/** Optional correlation a caller can attach so trace lines are navigable. */
export interface LlmTraceContext {
  stage?: string;
  conversationId?: string;
}

export interface LlmTraceRecord {
  op: 'invokeStructured' | 'transcribeAudio';
  provider: string;
  model: string;
  /**
   * Which credential/quota bucket served the call (`pool:index`). Routing for a
   * non-affinity stage is randomised, so the key cannot be recomputed after the
   * fact — this is the only record of which endpoint actually ran the request.
   * Absent for transcription, which does not go through the endpoint resolver.
   */
  bucket?: string;
  temperature?: number;
  maxTokens?: number;
  durationMs: number;
  ok: boolean;
  input: unknown;
  output?: unknown;
  error?: string;
  context?: LlmTraceContext;
}

/** Opt-in and never in prod — evaluated per call so env changes/tests are honoured. */
function isEnabled(): boolean {
  return process.env.LLM_TRACE === '1' && process.env.NODE_ENV !== 'production';
}

let dirReady = false;
function traceFilePath(): string {
  const dir = join(process.cwd(), 'logs');
  if (!dirReady) {
    mkdirSync(dir, { recursive: true });
    dirReady = true;
  }
  // One file per day keeps a run's calls together without unbounded growth.
  const day = new Date().toISOString().slice(0, 10);
  return join(dir, `llm-trace-${day}.jsonl`);
}

export function traceLlmCall(record: LlmTraceRecord): void {
  if (!isEnabled()) return;
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), id: randomUUID(), ...record });
    appendFileSync(traceFilePath(), line + '\n');
  } catch {
    // Never let tracing affect the call path.
  }
}
