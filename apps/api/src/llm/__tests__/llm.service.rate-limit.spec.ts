import { ChatOpenAI } from '@langchain/openai';
import type { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { z } from 'zod';
import type { MetricsService } from '../../common/metrics';
import type { LlmEndpointResolver } from '../llm-endpoint.resolver';
import type { LlmRateLimiterService } from '../llm-rate-limiter.service';
import { LLMService } from '../llm.service';
import { TRANSCRIPTION_TIMEOUT_MS } from '../medical-keyterms';

// Shared invoke mock so individual tests can make the model resolve or reject.
// (Prefixed `mock*` so jest.mock's factory may reference it.)
const mockInvoke = jest.fn();

// Constrain LangChain to a fake structured model so no real network call happens.
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: () => ({ invoke: mockInvoke }),
  })),
}));

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

// Fake AssemblyAI client. The default (completed) response is (re)set in
// beforeEach so a test that overrides it (e.g. a timeout) can't leak into others.
const transcribeMock = jest.fn();
jest.mock('assemblyai', () => ({
  AssemblyAI: jest.fn().mockImplementation(() => ({
    transcripts: { transcribe: transcribeMock },
  })),
  SpeechModel: {},
}));

function configStub(): ConfigService {
  const values: Record<string, unknown> = {
    'app.openai.apiKey': 'sk-test',
    'app.assemblyai.apiKey': 'aai-test',
    'app.assemblyai.baseUrl': 'https://api.eu.assemblyai.com',
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

type MetricsMock = {
  recordLLMDuration: jest.Mock;
  recordLLMRetry: jest.Mock;
  recordLLMQueueDepth: jest.Mock;
  recordLLMRateLimited: jest.Mock;
  recordLLMWait: jest.Mock;
};

function metricsStub(): MetricsMock {
  return {
    recordLLMDuration: jest.fn(),
    recordLLMRetry: jest.fn(),
    recordLLMQueueDepth: jest.fn(),
    recordLLMRateLimited: jest.fn(),
    recordLLMWait: jest.fn(),
  };
}

describe('LLMService rate-limit wiring', () => {
  let scheduleSpy: jest.Mock;
  let metrics: MetricsMock;
  let service: LLMService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke.mockResolvedValue({ ok: true });
    transcribeMock.mockReset().mockResolvedValue({
      status: 'completed',
      text: 'hello',
      words: [{ text: 'hello' }],
      confidence: 0.9,
      audio_duration: 1,
    });
    // Transparent limiter: run the job immediately but record that it was gated.
    // Signature mirrors the real schedule(bucketKey, fn) — the key is ignored here.
    scheduleSpy = jest.fn((_bucketKey: string, fn: () => Promise<unknown>) => fn());
    const rateLimiter = { schedule: scheduleSpy } as unknown as LlmRateLimiterService;
    // Single-bucket resolver: every call routes to openai:0. The pool routing and
    // spread logic itself is covered in llm-endpoint.resolver.spec.ts.
    const resolver = {
      resolveBucket: jest.fn(() => ({
        bucketKey: 'openai:0',
        pool: 'openai',
        index: 0,
        endpoint: { apiKey: 'az-key', baseURL: 'https://res.services.ai.azure.com/openai/v1/' },
      })),
      buckets: () => [{ bucketKey: 'openai:0', pool: 'openai', index: 0 }],
    } as unknown as LlmEndpointResolver;
    metrics = metricsStub();
    service = new LLMService(
      configStub(),
      metrics as unknown as MetricsService,
      rateLimiter,
      resolver
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('routes structured LLM calls through the rate limiter', async () => {
    const result = await service.invokeStructured([], z.object({ ok: z.boolean() }), {
      provider: 'openai',
      model: 'gpt-test',
    });

    expect(result.data).toEqual({ ok: true });
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it('records provider latency (excluding limiter wait) and wait time separately', async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // Limiter that delays ~50ms before running the provider call — simulates
    // queue/pacing wait. The provider call itself (mockInvoke) is ~instant.
    scheduleSpy.mockImplementation(async (_bucketKey: string, fn: () => Promise<unknown>) => {
      await sleep(50);
      return fn();
    });

    await service.invokeStructured([], z.object({ ok: z.boolean() }), {
      provider: 'openai',
      model: 'gpt-test',
    });

    // Provider-latency SLI must EXCLUDE the 50ms wait...
    const durationCall = metrics.recordLLMDuration.mock.calls.find(
      (c) => c[0] === 'invokeStructured'
    );
    expect(durationCall).toBeDefined();
    expect(durationCall![2]).toBeLessThan(50);

    // ...and the wait is captured separately as its own signal, attributed to the
    // pool whose limiter did the waiting.
    expect(metrics.recordLLMWait).toHaveBeenCalledWith(
      'invokeStructured',
      'openai',
      expect.any(Number)
    );
    expect(metrics.recordLLMWait.mock.calls[0][2]).toBeGreaterThanOrEqual(40);
  });

  it('builds the chat model with maxRetries: 0 so the limiter is the only retry layer', async () => {
    await service.invokeStructured([], z.object({ ok: z.boolean() }), {
      provider: 'openai',
      model: 'gpt-test',
    });

    // Guards against LangChain's AsyncCaller (default 6 retries, 429 included)
    // firing extra provider requests inside a single rate-limiter slot.
    expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
  });

  it('sends a Foundry call with the credentials of the bucket that paced it', async () => {
    await service.invokeStructured([], z.object({ ok: z.boolean() }), {
      provider: 'azure-foundry',
      model: 'DeepSeek-V4-Flash',
      pool: 'analysis',
    });

    // The invariant at the transport boundary: the bucket handed to the limiter
    // and the credentials handed to the client come from ONE resolved value, so
    // a call can never be paced by one key and sent with another.
    expect(scheduleSpy).toHaveBeenCalledWith('openai:0', expect.any(Function));
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'az-key',
        configuration: { baseURL: 'https://res.services.ai.azure.com/openai/v1/' },
      })
    );
  });

  it('does NOT rate-limit audio transcription', async () => {
    const result = await service.transcribeAudio('https://example.com/audio.mp3');

    expect(result.text).toBe('hello');
    expect(transcribeMock).toHaveBeenCalledTimes(1);
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it('delegates the timeout to the SDK via its pollingTimeout budget', async () => {
    await service.transcribeAudio('https://example.com/audio.mp3');

    // The SDK bounds its own polling loop — no manual setTimeout/Promise.race.
    expect(transcribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ audio_url: 'https://example.com/audio.mp3' }),
      { pollingTimeout: TRANSCRIPTION_TIMEOUT_MS }
    );
  });

  // Case/wrapping variants pin the case-insensitive includes() matcher so it
  // survives minor SDK message changes. (A full rename would still degrade — an
  // inherent limit of matching an undocumented SDK string; see the TODO in
  // llm.service.ts on de-coupling this via the wall-clock race.)
  it.each(['Polling timeout', 'polling timeout', 'Error: Polling timeout after 120000ms'])(
    'normalizes SDK timeout message %p to a descriptive error and does not retry it',
    async (sdkMessage) => {
      transcribeMock.mockReset().mockRejectedValue(new Error(sdkMessage));

      await expect(service.transcribeAudio('https://example.com/audio.mp3')).rejects.toThrow(
        /Transcription timed out after \d+ms/
      );

      expect(transcribeMock).toHaveBeenCalledTimes(1); // a timeout is non-retryable
    }
  );

  it('records a distinct 429 signal and tags Sentry when the provider rate-limits', async () => {
    jest.useFakeTimers();
    const err = Object.assign(new Error('Rate limit exceeded'), { status: 429 });
    mockInvoke.mockReset().mockRejectedValue(err);

    // Attach the rejection expectation BEFORE advancing timers, so backOff's
    // rejection during the flush isn't briefly flagged as unhandled.
    const settled = expect(
      service.invokeStructured([], z.object({ ok: z.boolean() }), {
        provider: 'openai',
        model: 'gpt-test',
      })
    ).rejects.toThrow('Rate limit exceeded');
    await jest.advanceTimersByTimeAsync(10_000); // flush backOff retry delays
    await settled;

    // Ground-truth quota signal fired, attributed to the pool whose cap was hit —
    // with several pools at different caps, "we're 429ing" isn't actionable alone.
    expect(metrics.recordLLMRateLimited).toHaveBeenCalledWith('invokeStructured', 'openai');
    // …and the hard failure is tagged as rate-limited for alerting.
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: expect.objectContaining({
          rateLimited: true,
          pool: 'openai',
          bucket: 'openai:0',
        }),
      })
    );
  });

  it('does NOT treat a 400 whose message contains "8429" as rate-limited or retryable', async () => {
    const err = Object.assign(
      new Error('max context is 8192 tokens, however you requested 8429 tokens'),
      { status: 400 }
    );
    mockInvoke.mockReset().mockRejectedValue(err);

    await expect(
      service.invokeStructured([], z.object({ ok: z.boolean() }), {
        provider: 'openai',
        model: 'gpt-test',
      })
    ).rejects.toThrow('8429');

    // Not a rate limit: no quota signal, tagged rateLimited: false...
    expect(metrics.recordLLMRateLimited).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ tags: expect.objectContaining({ rateLimited: false }) })
    );
    // ...and not retryable (a 400): exactly one provider call, no backOff retries.
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('does NOT flag a non-429 failure as rate-limited', async () => {
    jest.useFakeTimers();
    const err = Object.assign(new Error('Internal server error'), { status: 500 });
    mockInvoke.mockReset().mockRejectedValue(err);

    const settled = expect(
      service.invokeStructured([], z.object({ ok: z.boolean() }), {
        provider: 'openai',
        model: 'gpt-test',
      })
    ).rejects.toThrow('Internal server error');
    await jest.advanceTimersByTimeAsync(10_000);
    await settled;

    expect(metrics.recordLLMRateLimited).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ tags: expect.objectContaining({ rateLimited: false }) })
    );
  });

  /**
   * `providerErrorDetail` is private, so these drive it through the public failure
   * path and assert on the Sentry `extra.providerDetail` it produces.
   *
   * What is being pinned: `body.code` means different things per provider, so the
   * decoder splits it by TYPE. Getting this wrong is not a behaviour bug (nothing
   * here feeds retry/429 classification) but it does break log alerting — and the
   * fallback only fires when LangChain has swallowed the real status, i.e. exactly
   * when the log line is the only evidence left.
   */
  describe('providerErrorDetail — status vs code', () => {
    /** Fail once with `err`, then return the decoded providerDetail string. */
    async function detailFor(err: unknown): Promise<string> {
      mockInvoke.mockReset().mockRejectedValue(err);
      await service
        .invokeStructured([], z.object({ ok: z.boolean() }), {
          provider: 'openai',
          model: 'gpt-test',
        })
        .catch(() => undefined);

      const call = (Sentry.captureException as jest.Mock).mock.calls.at(-1);
      return (call?.[1] as { extra: { providerDetail: string } }).extra.providerDetail;
    }

    it('reads a NUMERIC body code as the status (OpenRouter envelope)', async () => {
      // OpenRouter reports `{ error: { code: 429 } }` with no top-level status.
      // That number IS the HTTP status, so it must land under `status=` — a log
      // alert grepping `status=429` has to match here.
      const detail = await detailFor(
        Object.assign(new Error('wrapped'), { error: { code: 429, message: 'slow down' } })
      );

      expect(detail).toContain('status=429');
      expect(detail).not.toContain('code=429');
    });

    it('reads a STRING body code under its own label, never as a status', async () => {
      // OpenAI reports a slug. It is often more actionable than the status, so it
      // is kept — but under `code=`, because `status=context_length_exceeded`
      // would silently defeat any status-based log matching.
      const detail = await detailFor(
        Object.assign(new Error('wrapped'), {
          error: { code: 'context_length_exceeded', message: 'too long' },
        })
      );

      expect(detail).toContain('code=context_length_exceeded');
      expect(detail).not.toContain('status=context_length_exceeded');
      expect(detail).not.toContain('status=');
    });

    it('emits neither field for a null body code (OpenAI’s common shape)', async () => {
      // `??` only skips null on its LEFT, so an unguarded fallback would pass
      // `null` through and print the literal `status=null`.
      const detail = await detailFor(
        Object.assign(new Error('wrapped'), { error: { code: null, message: 'boom' } })
      );

      expect(detail).not.toContain('status=');
      expect(detail).not.toContain('code=');
      expect(detail).toContain('raw=boom'); // the useful part still survives
    });

    it('prefers a real top-level status over the body code', async () => {
      const detail = await detailFor(
        Object.assign(new Error('bad request'), {
          status: 400,
          error: { code: 'unsupported_parameter', message: "Unsupported parameter: 'temperature'" },
        })
      );

      // Both are kept, each under the right label — the status for matching, the
      // slug for diagnosis.
      expect(detail).toContain('status=400');
      expect(detail).toContain('code=unsupported_parameter');
    });
  });
});
