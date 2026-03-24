import { Types } from 'mongoose';
import { Specialty } from '@acme/shared';
import { RedactionStage } from '../stages/redaction.stage';
import { StageContext } from '../stages/stage.interface';

// ── Helpers ──

const context: StageContext = {
  messageId: new Types.ObjectId(),
  conversationId: new Types.ObjectId(),
  specialty: Specialty.GP,
  mediaType: null,
};

// ── Mocks ──

const mockLlmService = {
  invokeStructured: jest.fn(),
};

describe('RedactionStage', () => {
  let stage: RedactionStage;

  beforeEach(() => {
    jest.clearAllMocks();
    stage = new RedactionStage(mockLlmService as any);
  });

  it('should pass through text unchanged when LLM returns needsRedaction: false and no regex matches', async () => {
    const input = 'The patient presented with chest pain and shortness of breath.';

    mockLlmService.invokeStructured.mockResolvedValue({
      data: { needsRedaction: false, redactedText: '', redactedEntities: [] },
      model: 'gpt-5.4-nano',
      tokensUsed: null,
    });

    const result = await stage.execute(input, context);

    expect(result.text).toBe(input);
    expect(result.metadata?.needsLlmRedaction).toBe(false);
    expect(result.metadata?.regexRedactedEntities).toEqual([]);
  });

  it('should redact structured PII via regex even when LLM returns needsRedaction: false', async () => {
    const input = 'Patient NHS number 943 476 5919 presented with chest pain.';

    mockLlmService.invokeStructured.mockResolvedValue({
      data: { needsRedaction: false, redactedText: '', redactedEntities: [] },
      model: 'gpt-5.4-nano',
      tokensUsed: null,
    });

    const result = await stage.execute(input, context);

    expect(result.text).toBe('Patient NHS number [NHS-NUMBER] presented with chest pain.');
    expect(result.metadata?.regexRedactedEntities).toContain('healthcare_number');
  });

  it('should apply LLM redaction when needsRedaction: true', async () => {
    const input = 'I saw Mrs Patel today at St Thomas Hospital.';

    mockLlmService.invokeStructured.mockResolvedValue({
      data: {
        needsRedaction: true,
        redactedText: 'I saw [NAME] today at [ORGANISATION].',
        redactedEntities: ['person_name', 'organisation'],
      },
      model: 'gpt-5.4-nano',
      tokensUsed: null,
    });

    const result = await stage.execute(input, context);

    expect(result.text).toBe('I saw [NAME] today at [ORGANISATION].');
    expect(result.metadata?.llmRedactedEntities).toEqual(['person_name', 'organisation']);
    expect(result.metadata?.needsLlmRedaction).toBe(true);
  });

  it('should combine regex and LLM redaction results', async () => {
    const input = 'Mrs Patel, NHS 943 476 5919, phone 07700 900123, from Brixton.';

    // After regex: 'Mrs Patel, NHS [NHS-NUMBER], phone [PHONE], from Brixton.'
    mockLlmService.invokeStructured.mockResolvedValue({
      data: {
        needsRedaction: true,
        redactedText: '[NAME], NHS [NHS-NUMBER], phone [PHONE], from [LOCATION].',
        redactedEntities: ['person_name', 'location'],
      },
      model: 'gpt-5.4-nano',
      tokensUsed: null,
    });

    const result = await stage.execute(input, context);

    expect(result.text).toBe('[NAME], NHS [NHS-NUMBER], phone [PHONE], from [LOCATION].');
    expect(result.metadata?.regexRedactedEntities).toContain('healthcare_number');
    expect(result.metadata?.regexRedactedEntities).toContain('phone_number');
    expect(result.metadata?.llmRedactedEntities).toContain('person_name');
    expect(result.metadata?.llmRedactedEntities).toContain('location');
  });

  it('should call LLM with temperature 0 for maximum determinism', async () => {
    const input = 'Some text.';

    mockLlmService.invokeStructured.mockResolvedValue({
      data: { needsRedaction: false, redactedText: '', redactedEntities: [] },
      model: 'gpt-5.4-nano',
      tokensUsed: null,
    });

    await stage.execute(input, context);

    expect(mockLlmService.invokeStructured).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ temperature: 0 })
    );
  });
});
