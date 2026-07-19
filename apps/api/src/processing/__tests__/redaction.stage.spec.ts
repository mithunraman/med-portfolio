import { Specialty } from '@acme/shared';
import { Types } from 'mongoose';
import type { PhiRedactionResult } from '../../language';
import { LocalPiiService } from '../redaction/local-pii.service';
import { RedactionStage } from '../stages/redaction.stage';
import { StageContext } from '../stages/stage.interface';
import { UK_CLINICAL_FIXTURES } from './fixtures/uk-clinical';

const context: StageContext = {
  messageId: new Types.ObjectId(),
  conversationId: new Types.ObjectId(),
  specialty: Specialty.GP,
  mediaType: null,
};

/** A stub Azure service with a controllable redactPhi. */
function azureStub(redactPhi: jest.Mock) {
  return { redactPhi } as unknown as { redactPhi: jest.Mock };
}

describe('RedactionStage', () => {
  describe('layering and ordering', () => {
    it('runs Azure PHI first, then the local backstop on Azure output', async () => {
      const order: string[] = [];
      const redactPhi = jest.fn(async (): Promise<PhiRedactionResult> => {
        order.push('azure');
        return { redactedText: 'seen by [PERSON]', entities: [{ category: 'Person', confidenceScore: 0.9 }] };
      });
      const localPii = {
        redactLocal: jest.fn(async (text: string) => {
          order.push('local');
          expect(text).toBe('seen by [PERSON]'); // local receives Azure's output
          return { redactedText: text, entities: [] };
        }),
      };
      const stage = new RedactionStage(azureStub(redactPhi) as never, localPii as never);

      const result = await stage.execute('seen by Dr Okafor', context);

      expect(order).toEqual(['azure', 'local']);
      expect(redactPhi).toHaveBeenCalledWith('seen by Dr Okafor');
      expect(result.text).toBe('seen by [PERSON]');
    });

    it('reports both layers in metadata and never flags injection', async () => {
      const redactPhi = jest.fn(
        async (): Promise<PhiRedactionResult> => ({
          redactedText: '[PERSON] on [PHONE_NUMBER]',
          entities: [
            { category: 'Person', confidenceScore: 0.9 },
            { category: 'PhoneNumber', confidenceScore: 0.8 },
          ],
        })
      );
      const localPii = {
        redactLocal: jest.fn(async (text: string) => ({
          redactedText: text,
          entities: [{ type: 'NHS_NUMBER' }],
        })),
      };
      const stage = new RedactionStage(azureStub(redactPhi) as never, localPii as never);

      const result = await stage.execute('input', context);

      expect(result.injectionDetected).toBe(false);
      expect(result.metadata).toMatchObject({
        phiEntityCount: 2,
        phiEntityCategories: ['Person', 'PhoneNumber'],
        structuredEntityCount: 1,
        structuredEntityTypes: ['NHS_NUMBER'],
      });
    });
  });

  describe('fail-closed', () => {
    it('propagates an Azure error and never invokes the local layer', async () => {
      const redactPhi = jest.fn(async () => {
        throw new Error('Azure PHI redaction failed for document 0: boom');
      });
      const localPii = { redactLocal: jest.fn() };
      const stage = new RedactionStage(azureStub(redactPhi) as never, localPii as never);

      await expect(stage.execute('some clinical text', context)).rejects.toThrow(
        /Azure PHI redaction failed/
      );
      // Local layer must not run — nothing partially-redacted can be returned.
      expect(localPii.redactLocal).not.toHaveBeenCalled();
    });
  });

  describe('golden clinical fixtures (real local backstop, stubbed Azure)', () => {
    // Real LocalPiiService proves structured-ID removal offline; the Azure stub
    // redacts the fixture's contextual names/places by simple token replacement.
    const localPii = new LocalPiiService();

    for (const fixture of UK_CLINICAL_FIXTURES) {
      it(`redacts PHI + structured identifiers: ${fixture.name}`, async () => {
        const redactPhi = jest.fn(async (text: string): Promise<PhiRedactionResult> => {
          let redacted = text;
          for (const { token, category } of fixture.phi) {
            redacted = redacted.split(token).join(`[${category.toUpperCase()}]`);
          }
          return {
            redactedText: redacted,
            entities: fixture.phi.map((p) => ({ category: p.category, confidenceScore: 0.95 })),
          };
        });
        const stage = new RedactionStage(azureStub(redactPhi) as never, localPii);

        const { text } = await stage.execute(fixture.text, context);

        // Contextual identifiers (names/places) gone via Azure layer.
        for (const { token } of fixture.phi) {
          expect(text).not.toContain(token);
        }
        // Structured UK identifiers gone via the offline backstop.
        for (const identifier of fixture.structured) {
          expect(text).not.toContain(identifier);
        }
        // Clinically meaningful content preserved (no over-redaction).
        for (const kept of fixture.preserve) {
          expect(text).toContain(kept);
        }
      });
    }
  });
});
