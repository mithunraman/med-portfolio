import { Module } from '@nestjs/common';
import { SpecialtiesController } from './specialties.controller';

@Module({
  controllers: [SpecialtiesController],
})
export class SpecialtiesModule {}
