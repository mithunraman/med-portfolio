import { Specialty } from '@acme/shared';
import {
  getAllRegisteredConfigs,
  getAllSpecialtyOptions,
  getSpecialtyConfig,
  isValidTrainingStage,
} from '../specialty.registry';

describe('SpecialtyRegistry', () => {
  describe('getSpecialtyConfig', () => {
    it('should return config for active specialty GP', () => {
      const config = getSpecialtyConfig(Specialty.GP);

      expect(config.specialty).toBe(Specialty.GP);
      expect(config.name).toBeDefined();
      expect(config.entryTypes.length).toBeGreaterThan(0);
      expect(config.capabilities.length).toBeGreaterThan(0);
      expect(config.trainingStages.length).toBeGreaterThan(0);
      expect(Object.keys(config.templates).length).toBeGreaterThan(0);
    });

    it.each([Specialty.PSYCHIATRY, Specialty.INTERNAL_MEDICINE])(
      'should throw for inactive specialty %s',
      (specialty) => {
        expect(() => getSpecialtyConfig(specialty)).toThrow(
          `No active configuration found for specialty: ${specialty}`
        );
      }
    );

    it('should throw for unregistered specialty', () => {
      expect(() => getSpecialtyConfig(999 as Specialty)).toThrow(
        'No active configuration found for specialty: 999'
      );
    });
  });

  describe('getAllSpecialtyOptions', () => {
    it('should return only active specialties', () => {
      const options = getAllSpecialtyOptions();

      expect(options.length).toBeGreaterThan(0);

      for (const option of options) {
        expect(() => getSpecialtyConfig(option.specialty)).not.toThrow();
      }
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

    it('should reject all stages for inactive Psychiatry specialty', () => {
      expect(isValidTrainingStage(Specialty.PSYCHIATRY, 'CT1')).toBe(false);
      expect(isValidTrainingStage(Specialty.PSYCHIATRY, 'CT3')).toBe(false);
      expect(isValidTrainingStage(Specialty.PSYCHIATRY, 'ST6')).toBe(false);
    });

    it('should reject all stages for inactive Internal Medicine specialty', () => {
      expect(isValidTrainingStage(Specialty.INTERNAL_MEDICINE, 'IMY1')).toBe(false);
      expect(isValidTrainingStage(Specialty.INTERNAL_MEDICINE, 'IMY3')).toBe(false);
    });

    it('should reject cross-specialty stage codes', () => {
      expect(isValidTrainingStage(Specialty.GP, 'CT1')).toBe(false);
    });

    it('should reject unknown stage codes', () => {
      expect(isValidTrainingStage(Specialty.GP, 'ST99')).toBe(false);
    });

    it('should reject unregistered specialty', () => {
      expect(isValidTrainingStage(999 as Specialty, 'ST1')).toBe(false);
    });
  });

  describe('config integrity', () => {
    const allConfigs = getAllRegisteredConfigs();

    it.each(allConfigs.map((c) => [c.name, c] as const))(
      '%s: every entry type should map to an existing template',
      (_name, config) => {
        for (const entryType of config.entryTypes) {
          expect(config.templates[entryType.templateId]).toBeDefined();
        }
      }
    );

    it.each(allConfigs.map((c) => [c.name, c] as const))(
      '%s: template section weights should sum to approximately 1.0',
      (_name, config) => {
        for (const [_, template] of Object.entries(config.templates)) {
          const totalWeight = template.sections.reduce((sum, s) => sum + s.weight, 0);
          expect(totalWeight).toBeCloseTo(1.0, 1);
        }
      }
    );

    it.each(allConfigs.map((c) => [c.name, c] as const))(
      '%s: capabilities should have unique codes',
      (_name, config) => {
        const codes = config.capabilities.map((c) => c.code);
        expect(new Set(codes).size).toBe(codes.length);
      }
    );

    it.each(allConfigs.map((c) => [c.name, c] as const))(
      '%s: entry types should have unique codes',
      (_name, config) => {
        const codes = config.entryTypes.map((e) => e.code);
        expect(new Set(codes).size).toBe(codes.length);
      }
    );

    it.each(allConfigs.map((c) => [c.name, c] as const))(
      '%s: training stages should have unique codes',
      (_name, config) => {
        const codes = config.trainingStages.map((s) => s.code);
        expect(new Set(codes).size).toBe(codes.length);
      }
    );
  });
});
