import { Specialty } from '@acme/shared';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
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
      expect(result.specialties.length).toBe(1);
    });

    it('should include GP', () => {
      const result = controller.getSpecialties();
      const gp = result.specialties.find((s) => s.specialty === Specialty.GP);

      expect(gp).toBeDefined();
      expect(gp!.name).toBe('General Practice');
      expect(gp!.trainingStages.length).toBe(3);
    });

    it('should exclude inactive specialties (Psychiatry, Internal Medicine)', () => {
      const result = controller.getSpecialties();

      expect(
        result.specialties.find((s) => s.specialty === Specialty.PSYCHIATRY)
      ).toBeUndefined();
      expect(
        result.specialties.find((s) => s.specialty === Specialty.INTERNAL_MEDICINE)
      ).toBeUndefined();
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
        expect(raw['capabilities']).toBeUndefined();
      }
    });

    it('should expose entry types as code/label/description only', () => {
      // The entry-type picker needs these, but this response is public and cached
      // for an hour — templateId is a config internal and must not ride along.
      const result = controller.getSpecialties();

      for (const specialty of result.specialties) {
        expect(specialty.entryTypes.length).toBeGreaterThan(0);
        for (const entryType of specialty.entryTypes) {
          expect(Object.keys(entryType).sort()).toEqual(['code', 'description', 'label']);
        }
      }
    });

    it('should not expose the sample case in the specialty list', () => {
      for (const specialty of controller.getSpecialties().specialties) {
        expect((specialty as Record<string, unknown>)['sampleCase']).toBeUndefined();
      }
    });
  });

  describe('getSampleCase', () => {
    const mockResponse = () => ({ setHeader: jest.fn() }) as unknown as Response;

    it('should return the GP sample case with a public cache header', () => {
      const res = mockResponse();
      const result = controller.getSampleCase(Specialty.GP, res);

      expect(result.specialty).toBe(Specialty.GP);
      expect(result.sections.length).toBeGreaterThan(0);
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
    });

    it.each([Specialty.PSYCHIATRY, 999])(
      'should 404 for specialty %s with no sample, without making it cacheable',
      (s) => {
        const res = mockResponse();

        expect(() => controller.getSampleCase(s, res)).toThrow(NotFoundException);
        expect(res.setHeader).not.toHaveBeenCalled();
      }
    );
  });
});
