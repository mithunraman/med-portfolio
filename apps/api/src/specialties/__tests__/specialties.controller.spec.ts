import { Specialty } from '@acme/shared';
import { SpecialtiesController } from '../specialties.controller';

describe('SpecialtiesController', () => {
  let controller: SpecialtiesController;

  beforeEach(() => {
    controller = new SpecialtiesController();
  });

  describe('getSpecialties', () => {
    it('should return all registered specialties', () => {
      const result = controller.getSpecialties();

      expect(result.specialties).toBeDefined();
      expect(result.specialties.length).toBe(3);
    });

    it('should include GP', () => {
      const result = controller.getSpecialties();
      const gp = result.specialties.find((s) => s.specialty === Specialty.GP);

      expect(gp).toBeDefined();
      expect(gp!.name).toBe('General Practice');
      expect(gp!.trainingStages.length).toBe(3);
    });

    it('should include Psychiatry', () => {
      const result = controller.getSpecialties();
      const psych = result.specialties.find((s) => s.specialty === Specialty.PSYCHIATRY);

      expect(psych).toBeDefined();
      expect(psych!.name).toBe('Psychiatry');
      expect(psych!.trainingStages.length).toBe(6);
    });

    it('should include Internal Medicine', () => {
      const result = controller.getSpecialties();
      const im = result.specialties.find((s) => s.specialty === Specialty.INTERNAL_MEDICINE);

      expect(im).toBeDefined();
      expect(im!.name).toBe('Internal Medicine');
      expect(im!.trainingStages.length).toBe(3);
    });

    it('should return training stages with code, label, and description', () => {
      const result = controller.getSpecialties();

      for (const specialty of result.specialties) {
        for (const stage of specialty.trainingStages) {
          expect(typeof stage.code).toBe('string');
          expect(typeof stage.label).toBe('string');
          expect(typeof stage.description).toBe('string');
          expect(stage.code.length).toBeGreaterThan(0);
          expect(stage.label.length).toBeGreaterThan(0);
          expect(stage.description.length).toBeGreaterThan(0);
        }
      }
    });

    it('should not expose internal config details', () => {
      const result = controller.getSpecialties();

      for (const specialty of result.specialties) {
        const raw = specialty as Record<string, unknown>;
        expect(raw['templates']).toBeUndefined();
        expect(raw['entryTypes']).toBeUndefined();
        expect(raw['capabilities']).toBeUndefined();
        expect(raw['entryTypeToTemplate']).toBeUndefined();
      }
    });
  });
});
