import { noticeDocumentSchema } from '@acme/shared';
import { NOTICE_REGISTRY } from '../registry';
import { NOTICE_V1_0 } from '../notices/v1.0';

describe('NOTICE_REGISTRY', () => {
  it('exposes NOTICE_V1_0 as active', () => {
    expect(NOTICE_REGISTRY.active).toBe(NOTICE_V1_0);
  });

  it('includes the active document in all', () => {
    expect(NOTICE_REGISTRY.all).toContain(NOTICE_REGISTRY.active);
  });

  it('has unique versions across all', () => {
    const versions = NOTICE_REGISTRY.all.map((v) => v.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe('NoticeDocument schema validation', () => {
  it('parses NOTICE_V1_0 successfully', () => {
    expect(() => noticeDocumentSchema.parse(NOTICE_V1_0)).not.toThrow();
  });

  it('requires requiresReAckFromPriorVersions', () => {
    const rest = { ...NOTICE_V1_0 } as Partial<typeof NOTICE_V1_0>;
    delete rest.requiresReAckFromPriorVersions;
    expect(() => noticeDocumentSchema.parse(rest)).toThrow();
  });

  it('rejects unknown block types', () => {
    const bad = {
      ...NOTICE_V1_0,
      body: [{ type: 'callout', text: 'Nope' }],
    };
    expect(() => noticeDocumentSchema.parse(bad)).toThrow();
  });

  it('rejects malformed link items (missing url)', () => {
    const bad = {
      ...NOTICE_V1_0,
      body: [{ type: 'links', items: [{ label: 'Privacy' }] }],
    };
    expect(() => noticeDocumentSchema.parse(bad)).toThrow();
  });
});

// The active notice carries the UK GDPR Art 9(2)(a) condition for every clinical
// reflection the product exists to process. These assertions are not style
// preferences: consent bundled into another agreement is not consent, and an
// optional consent item is not a condition. Either regression would silently
// invalidate the Art 9 basis while the app kept working — no runtime signal, no
// failing request, nothing until a regulator asks. See DPIA A-1 / gate C-1.
describe('Article 9 explicit consent (active notice)', () => {
  const byId = (id: string) => NOTICE_REGISTRY.active.acknowledgements.find((a) => a.id === id);
  const bodyProse = () =>
    NOTICE_REGISTRY.active.body
      .filter((b): b is { type: 'paragraph'; text: string } => b.type === 'paragraph')
      .map((b) => b.text)
      .join(' ');

  it('is present and required', () => {
    expect(byId('health_data_consent')).toEqual(
      expect.objectContaining({ id: 'health_data_consent', required: true })
    );
  });

  it('is a separate item from terms acceptance — consent must not be bundled', () => {
    expect(byId('accept_privacy_terms')).toBeDefined();
    expect(byId('health_data_consent')).not.toBe(byId('accept_privacy_terms'));
  });

  it('names the data and is explicit, so the consent is specific and informed', () => {
    const label = byId('health_data_consent')?.label ?? '';
    expect(label).toMatch(/explicitly consent/i);
    expect(label).toMatch(/health information/i);
  });

  // REMOVED 2026-08-04: an assertion that the label read "my own health
  // information". It was added to stop the label over-claiming on a patient's
  // behalf, but it tested the wrong thing. The ICO's explicit-consent test asks
  // that a label "specify the NATURE of the special category data" — health —
  // not that it scope itself by data subject; that requirement was invented
  // here, not derived. It also made the label confusing to the one audience that
  // matters, since a trainee reflecting on a patient reads "my own health
  // information" and reasonably objects that the entry is not about their
  // health. The over-claim risk it was guarding is real but lives in Privacy
  // Policy §5 and DPIA §4.2, which is where the two populations are separated.
  // Do not reinstate without re-reading those first.

  // The label names the DATA but not the PURPOSES — those were moved into the
  // body to keep the checkbox readable. That is a valid layered notice only for
  // as long as the body still states them: consent must be SPECIFIC, and a
  // reader who is told "we process your health information" without being told
  // what for has not given specific consent. Trimming the body for brevity is
  // the realistic way this breaks, and it breaks silently.
  it('states the purposes in the body, which the shortened label relies on', () => {
    const prose = bodyProse();
    expect(prose).toMatch(/transcrib/i);
    expect(prose).toMatch(/remove patient details|redact/i);
    expect(prose).toMatch(/draft/i);
  });

  it('tells the user how to withdraw, as Art 7(3) requires', () => {
    expect(bodyProse()).toMatch(/withdraw/i);
  });
});
