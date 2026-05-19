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
