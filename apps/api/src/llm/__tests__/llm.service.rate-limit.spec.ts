import { ChatOpenAI } from '@langchain/openai';
import type { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { z } from 'zod';
import type { MetricsService } from '../../common/metrics';
import type { LlmRateLimiterService } from '../llm-rate-limiter.service';
import { LLMService } from '../llm.service';

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

// Fake AssemblyAI client so transcribeAudio resolves without a network call.
const transcribeMock = jest.fn().mockResolvedValue({
  status: 'completed',
  text: 'hello',
  words: [{ text: 'hello' }],
  confidence: 0.9,
  audio_duration: 1,
});
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
    // Transparent limiter: run the job immediately but record that it was gated.
    scheduleSpy = jest.fn((fn: () => Promise<unknown>) => fn());
    const rateLimiter = { schedule: scheduleSpy } as unknown as LlmRateLimiterService;
    metrics = metricsStub();
    service = new LLMService(configStub(), metrics as unknown as MetricsService, rateLimiter);
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
    scheduleSpy.mockImplementation(async (fn: () => Promise<unknown>) => {
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

    // ...and the wait is captured separately as its own signal.
    expect(metrics.recordLLMWait).toHaveBeenCalledWith('invokeStructured', expect.any(Number));
    expect(metrics.recordLLMWait.mock.calls[0][1]).toBeGreaterThanOrEqual(40);
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

  it('does NOT rate-limit audio transcription', async () => {
    const result = await service.transcribeAudio('https://example.com/audio.mp3');

    expect(result.text).toBe('hello');
    expect(transcribeMock).toHaveBeenCalledTimes(1);
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

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

    // Ground-truth quota signal fired…
    expect(metrics.recordLLMRateLimited).toHaveBeenCalledWith('invokeStructured');
    // …and the hard failure is tagged as rate-limited for alerting.
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ tags: expect.objectContaining({ rateLimited: true }) })
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
});
