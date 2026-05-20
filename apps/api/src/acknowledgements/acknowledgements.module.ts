import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AcknowledgementsController } from './acknowledgements.controller';
import { AcknowledgementsRepository } from './acknowledgements.repository';
import { AcknowledgementsService } from './acknowledgements.service';
import { Acknowledgement, AcknowledgementSchema } from './schemas/acknowledgement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Acknowledgement.name, schema: AcknowledgementSchema },
    ]),
  ],
  controllers: [AcknowledgementsController],
  providers: [AcknowledgementsRepository, AcknowledgementsService],
  exports: [AcknowledgementsRepository],
})
export class AcknowledgementsModule {}
