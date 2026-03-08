import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdpGoalsRepository } from './pdp-goals.repository';
import { PDP_GOALS_REPOSITORY } from './pdp-goals.repository.interface';
import { PdpGoal, PdpGoalSchema } from './schemas/pdp-goal.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: PdpGoal.name, schema: PdpGoalSchema }])],
  providers: [
    {
      provide: PDP_GOALS_REPOSITORY,
      useClass: PdpGoalsRepository,
    },
  ],
  exports: [PDP_GOALS_REPOSITORY],
})
export class PdpGoalsModule {}
