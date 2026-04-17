import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuotaController } from './quota.controller';
import { QuotaRepository } from './quota.repository';
import { QUOTA_REPOSITORY } from './quota.repository.interface';
import { QuotaService } from './quota.service';
import { UsageEvent, UsageEventSchema } from './schemas/usage-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UsageEvent.name, schema: UsageEventSchema }]),
  ],
  controllers: [QuotaController],
  providers: [
    QuotaService,
    {
      provide: QUOTA_REPOSITORY,
      useClass: QuotaRepository,
    },
  ],
  exports: [QuotaService],
})
export class QuotaModule {}
