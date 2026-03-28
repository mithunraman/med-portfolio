import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { ReviewPeriodsController } from './review-periods.controller';
import { ReviewPeriodsRepository } from './review-periods.repository';
import { REVIEW_PERIODS_REPOSITORY } from './review-periods.repository.interface';
import { ReviewPeriodsService } from './review-periods.service';
import { ReviewPeriod, ReviewPeriodSchema } from './schemas/review-period.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReviewPeriod.name, schema: ReviewPeriodSchema },
      { name: User.name, schema: UserSchema },
    ]),
    ArtefactsModule,
  ],
  controllers: [ReviewPeriodsController],
  providers: [
    ReviewPeriodsService,
    {
      provide: REVIEW_PERIODS_REPOSITORY,
      useClass: ReviewPeriodsRepository,
    },
  ],
  exports: [ReviewPeriodsService, REVIEW_PERIODS_REPOSITORY],
})
export class ReviewPeriodsModule {}
