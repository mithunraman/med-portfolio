import { Module } from '@nestjs/common';
import { CheckpointRepository } from './checkpoint.repository';
import { CHECKPOINT_REPOSITORY } from './checkpoint.repository.interface';

/**
 * Deliberately standalone: it depends on nothing but the Mongoose connection.
 *
 * `PortfolioGraphModule → ConversationsModule → AnalysisRunsModule` is an
 * existing chain, so hanging this repository off either end would risk a cycle
 * for any consumer at the other. A leaf module can be imported from anywhere.
 */
@Module({
  providers: [
    {
      provide: CHECKPOINT_REPOSITORY,
      useClass: CheckpointRepository,
    },
  ],
  exports: [CHECKPOINT_REPOSITORY],
})
export class CheckpointsModule {}
