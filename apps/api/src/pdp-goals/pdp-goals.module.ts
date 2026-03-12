import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdpGoalsController } from './pdp-goals.controller';
import { PdpGoalsRepository } from './pdp-goals.repository';
import { PDP_GOALS_REPOSITORY } from './pdp-goals.repository.interface';
import { PdpGoalsService } from './pdp-goals.service';
import { PdpGoal, PdpGoalSchema } from './schemas/pdp-goal.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: PdpGoal.name, schema: PdpGoalSchema }])],
  controllers: [PdpGoalsController],
  providers: [
    PdpGoalsService,
    {
      provide: PDP_GOALS_REPOSITORY,
      useClass: PdpGoalsRepository,
    },
  ],
  exports: [PDP_GOALS_REPOSITORY],
})
export class PdpGoalsModule {}
