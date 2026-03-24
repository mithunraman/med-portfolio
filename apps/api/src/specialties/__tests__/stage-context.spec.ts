import { Specialty } from '@acme/shared';
import { getStageContext } from '../stage-context';

const GENERIC_FALLBACK =
  "Adjust your coaching to the trainee's apparent level of experience based on their language and clinical reasoning.";

describe('getStageContext', () => {
  describe('GP stages', () => {
    it.each(['ST1', 'ST2', 'ST3'])('should return context for GP %s', (stage) => {
      const context = getStageContext(Specialty.GP, stage);

      expect(context).not.toBe(GENERIC_FALLBACK);
      expect(context.length).toBeGreaterThan(50);
      expect(context).toContain(stage);
    });
  });

  describe('Psychiatry stages', () => {
    it.each(['CT1', 'CT2', 'CT3', 'ST4', 'ST5', 'ST6'])(
      'should return context for Psychiatry %s',
      (stage) => {
        const context = getStageContext(Specialty.PSYCHIATRY, stage);

        expect(context).not.toBe(GENERIC_FALLBACK);
        expect(context.length).toBeGreaterThan(50);
      }
    );
  });

  describe('Internal Medicine stages', () => {
    it.each(['IMY1', 'IMY2', 'IMY3'])(
      'should return context for IM %s',
      (stage) => {
        const context = getStageContext(Specialty.INTERNAL_MEDICINE, stage);

        expect(context).not.toBe(GENERIC_FALLBACK);
        expect(context.length).toBeGreaterThan(50);
      }
    );
  });

  describe('fallback behaviour', () => {
    it('should return fallback for empty training stage', () => {
      expect(getStageContext(Specialty.GP, '')).toBe(GENERIC_FALLBACK);
    });

    it('should return fallback for unknown stage code', () => {
      expect(getStageContext(Specialty.GP, 'ST99')).toBe(GENERIC_FALLBACK);
    });

    it('should return fallback for unregistered specialty', () => {
      expect(getStageContext(999 as Specialty, 'ST1')).toBe(GENERIC_FALLBACK);
    });

    it('should return fallback for cross-specialty stage', () => {
      expect(getStageContext(Specialty.GP, 'CT1')).toBe(GENERIC_FALLBACK);
      expect(getStageContext(Specialty.PSYCHIATRY, 'IMY1')).toBe(GENERIC_FALLBACK);
    });
  });
});
