import { LocalPiiService } from '../local-pii.service';

describe('LocalPiiService', () => {
  let service: LocalPiiService;

  beforeEach(() => {
    service = new LocalPiiService();
  });

  it('redacts an NHS number regardless of phrasing', async () => {
    const { redactedText, entities } = await service.redactLocal(
      'Her NHS number is 943 476 5919 today'
    );

    expect(redactedText).not.toContain('943 476 5919');
    expect(entities.map((e) => e.type)).toContain('NHS_NUMBER');
  });

  it('redacts a UK sort code + account number', async () => {
    const { redactedText, entities } = await service.redactLocal('Refund to 12-34-56 87654321');

    expect(redactedText).not.toContain('12-34-56 87654321');
    expect(entities.map((e) => e.type)).toContain('BANK_ACCOUNT');
  });

  it('does NOT redact an invalid NHS number (checksum gate)', async () => {
    const { redactedText, entities } = await service.redactLocal('number 943 476 5918');

    expect(redactedText).toBe('number 943 476 5918');
    expect(entities).toHaveLength(0);
  });

  it('defers standard PII (phone/email/date) to Azure — does NOT redact it here', async () => {
    const t = 'call 07700900123, email x@nhs.net, DOB 12/05/1980';
    const { redactedText, entities } = await service.redactLocal(t);

    expect(redactedText).toBe(t);
    expect(entities).toHaveLength(0);
  });

  it('does NOT over-redact clinical prose (no false positives on BP/meds)', async () => {
    const clinical =
      'Lying and standing BP 140/90 then 120/70. Started tamsulosin 400mcg. eGFR 59.';
    const { redactedText, entities } = await service.redactLocal(clinical);

    expect(redactedText).toBe(clinical);
    expect(entities).toHaveLength(0);
  });

  it('leaves Azure placeholder tokens untouched (safe to run second)', async () => {
    const azureOutput = 'Seen by [PERSON] at the [ORGANIZATION].';
    const { redactedText, entities } = await service.redactLocal(azureOutput);

    expect(redactedText).toBe(azureOutput);
    expect(entities).toHaveLength(0);
  });

  it('returns blank input unchanged', async () => {
    expect(await service.redactLocal('   ')).toEqual({ redactedText: '   ', entities: [] });
  });

  it('performs no network I/O (offline residency invariant)', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await service.redactLocal('NHS 943 476 5919, sort code 12-34-56 87654321');

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  describe('redactStandalone (offline path for the message edit)', () => {
    it('redacts contact PII that redactLocal defers to Azure', async () => {
      const { redactedText } = await service.redactStandalone(
        'call 07700 900123, email x@nhs.net'
      );

      expect(redactedText).toBe('call [PHONE], email [EMAIL]');
    });

    it('still redacts structured identifiers', async () => {
      const { redactedText, entities } = await service.redactStandalone(
        'Her NHS number is 943 476 5919'
      );

      expect(redactedText).toBe('Her NHS number is [NHS_NUMBER]');
      expect(entities.map((e) => e.type)).toContain('NHS_NUMBER');
    });

    it('does NOT over-redact clinical prose', async () => {
      const clinical = 'BP 140/90, HR 88, tamsulosin 400mcg, eGFR 59';
      const { redactedText, entities } = await service.redactStandalone(clinical);

      expect(redactedText).toBe(clinical);
      expect(entities).toHaveLength(0);
    });

    it('returns blank input unchanged', async () => {
      expect(await service.redactStandalone('   ')).toEqual({ redactedText: '   ', entities: [] });
    });

    it('performs no network I/O', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');

      await service.redactStandalone('call 07700 900123, email x@nhs.net');

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});
