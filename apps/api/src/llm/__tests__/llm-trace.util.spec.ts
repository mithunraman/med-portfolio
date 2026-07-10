jest.mock('fs', () => ({ appendFileSync: jest.fn(), mkdirSync: jest.fn() }));

import { appendFileSync } from 'fs';
import { type LlmTraceRecord, traceLlmCall } from '../llm-trace.util';

const RECORD: LlmTraceRecord = {
  op: 'invokeStructured',
  provider: 'openai',
  model: 'gpt-test',
  durationMs: 12,
  ok: true,
  input: [{ role: 'system', content: 'grade this' }],
  output: { sectionGrades: [{ sectionId: 'outcome', tier: 'adequate' }] },
};

describe('traceLlmCall', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it('writes nothing unless LLM_TRACE=1', () => {
    delete process.env.LLM_TRACE;
    traceLlmCall(RECORD);
    expect(appendFileSync).not.toHaveBeenCalled();
  });

  it('writes nothing in production even with LLM_TRACE=1', () => {
    process.env.LLM_TRACE = '1';
    process.env.NODE_ENV = 'production';
    traceLlmCall(RECORD);
    expect(appendFileSync).not.toHaveBeenCalled();
  });

  it('appends one self-describing JSON line when enabled', () => {
    process.env.LLM_TRACE = '1';
    process.env.NODE_ENV = 'development';
    traceLlmCall(RECORD);

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    const line = (appendFileSync as jest.Mock).mock.calls[0][1] as string;
    expect(line.endsWith('\n')).toBe(true);

    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ op: 'invokeStructured', ok: true, output: RECORD.output });
    expect(parsed.id).toEqual(expect.any(String));
    expect(parsed.ts).toEqual(expect.any(String));
  });

  it('never throws if the write fails', () => {
    process.env.LLM_TRACE = '1';
    process.env.NODE_ENV = 'development';
    (appendFileSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    expect(() => traceLlmCall(RECORD)).not.toThrow();
  });
});
