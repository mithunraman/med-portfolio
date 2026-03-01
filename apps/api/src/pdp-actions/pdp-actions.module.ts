import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdpActionsRepository } from './pdp-actions.repository';
import { PDP_ACTIONS_REPOSITORY } from './pdp-actions.repository.interface';
import { PdpAction, PdpActionSchema } from './schemas/pdp-action.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: PdpAction.name, schema: PdpActionSchema }])],
  providers: [
    {
      provide: PDP_ACTIONS_REPOSITORY,
      useClass: PdpActionsRepository,
    },
  ],
  exports: [PDP_ACTIONS_REPOSITORY],
})
export class PdpActionsModule {}
