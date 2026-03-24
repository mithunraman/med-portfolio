import { Specialty } from '@acme/shared';
import {
  getAllSpecialtyOptions,
  getSpecialtyConfig,
  isValidTrainingStage,
} from '../specialty.registry';

describe('SpecialtyRegistry', () => {
  describe('getSpecialtyConfig', () => {
    it.each([Specialty.GP, Specialty.PSYCHIATRY, Specialty.INTERNAL_MEDICINE])(
      'should return config for specialty %s',
      (specialty) => {
        const config = getSpecialtyConfig(specialty);

        expect(config.specialty).toBe(specialty);
        expect(config.name).toBeDefined();
        expect(config.entryTypes.length).toBeGreaterThan(0);
        expect(config.capabilities.length).toBeGreaterThan(0);
        expect(config.trainingStages.length).toBeGreaterThan(0);
        expect(Object.keys(config.templates).length).toBeGreaterThan(0);
      }
    );

    it('should throw for unregistered specialty', () => {
      expect(() => getSpecialtyConfig(999 as Specialty)).toThrow(
        'No configuration found for specialty: 999'
      );
    });
  });

  describe('getAllSpecialtyOptions', () => {
    it('should return all registered specialties', () => {
      const options = getAllSpecialtyOptions();

      expect(options.length).toBe(3);

      const specialties = options.map((o) => o.specialty);
      expect(specialties).toContain(Specialty.GP);
      expect(specialties).toContain(Specialty.PSYCHIATRY);
      expect(specialties).toContain(Specialty.INTERNAL_MEDICINE);
    });

    it('should include training stages for each specialty', () => {
      const options = getAllSpecialtyOptions();

      for (const option of options) {
        expect(option.trainingStages.length).toBeGreaterThan(0);
        for (const stage of option.trainingStages) {
          expect(stage.code).toBeDefined();
          expect(stage.label).toBeDefined();
          expect(stage.description).toBeDefined();
        }
      }
    });

    it('should not expose templates or entry type details', () => {
      const options = getAllSpecialtyOptions();

      for (const option of options) {
        expect(option).not.toHaveProperty('templates');
        expect(option).not.toHaveProperty('entryTypes');
        expect(option).not.toHaveProperty('capabilities');
      }
    });
  });

  describe('isValidTrainingStage', () => {
    it('should accept valid GP stages', () => {
      expect(isValidTrainingStage(Specialty.GP, 'ST1')).toBe(true);
      expect(isValidTrainingStage(Specialty.GP, 'ST2')).toBe(true);
      expect(isValidTrainingStage(Specialty.GP, 'ST3')).toBe(true);
    });

    it('should accept valid Psychiatry stages', () => {
      expect(isValidTrainingStage(Specialty.PSYCHIATRY, 'CT1')).toBe(true);
      expect(isValidTrainingStage(Specialty.PSYCHIATRY, 'CT3')).toBe(true);
      expect(isValidTrainingStage(Specialty.PSYCHIATRY, 'ST6')).toBe(true);
    });

    it('should accept valid IM stages', () => {
      expect(isValidTrainingStage(Specialty.INTERNAL_MEDICINE, 'IMY1')).toBe(true);
      expect(isValidTrainingStage(Specialty.INTERNAL_MEDICINE, 'IMY3')).toBe(true);
    });

    it('should reject cross-specialty stage codes', () => {
      expect(isValidTrainingStage(Specialty.GP, 'CT1')).toBe(false);
      expect(isValidTrainingStage(Specialty.PSYCHIATRY, 'ST1')).toBe(false);
      expect(isValidTrainingStage(Specialty.INTERNAL_MEDICINE, 'ST1')).toBe(false);
    });

    it('should reject unknown stage codes', () => {
      expect(isValidTrainingStage(Specialty.GP, 'ST99')).toBe(false);
    });

    it('should reject unregistered specialty', () => {
      expect(isValidTrainingStage(999 as Specialty, 'ST1')).toBe(false);
    });
  });

  describe('config integrity', () => {
    it.each([Specialty.GP, Specialty.PSYCHIATRY, Specialty.INTERNAL_MEDICINE])(
      'specialty %s: every entry type should map to an existing template',
      (specialty) => {
        const config = getSpecialtyConfig(specialty);

        for (const entryType of config.entryTypes) {
          const templateId = config.entryTypeToTemplate[entryType.code];
          expect(templateId).toBeDefined();
          expect(config.templates[templateId]).toBeDefined();
        }
      }
    );

    it.each([Specialty.GP, Specialty.PSYCHIATRY, Specialty.INTERNAL_MEDICINE])(
      'specialty %s: template section weights should sum to approximately 1.0',
      (specialty) => {
        const config = getSpecialtyConfig(specialty);

        for (const [_, template] of Object.entries(config.templates)) {
          const totalWeight = template.sections.reduce((sum, s) => sum + s.weight, 0);
          expect(totalWeight).toBeCloseTo(1.0, 1);
        }
      }
    );

    it.each([Specialty.GP, Specialty.PSYCHIATRY, Specialty.INTERNAL_MEDICINE])(
      'specialty %s: capabilities should have unique codes',
      (specialty) => {
        const config = getSpecialtyConfig(specialty);
        const codes = config.capabilities.map((c) => c.code);
        expect(new Set(codes).size).toBe(codes.length);
      }
    );

    it.each([Specialty.GP, Specialty.PSYCHIATRY, Specialty.INTERNAL_MEDICINE])(
      'specialty %s: entry types should have unique codes',
      (specialty) => {
        const config = getSpecialtyConfig(specialty);
        const codes = config.entryTypes.map((e) => e.code);
        expect(new Set(codes).size).toBe(codes.length);
      }
    );

    it.each([Specialty.GP, Specialty.PSYCHIATRY, Specialty.INTERNAL_MEDICINE])(
      'specialty %s: training stages should have unique codes',
      (specialty) => {
        const config = getSpecialtyConfig(specialty);
        const codes = config.trainingStages.map((s) => s.code);
        expect(new Set(codes).size).toBe(codes.length);
      }
    );
  });
});
