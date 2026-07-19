import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalysisRunsModule } from '../analysis-runs';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { DatabaseModule } from '../database';
import { MediaModule } from '../media';
import { OutboxModule } from '../outbox/outbox.module';
import { PdpGoalsModule } from '../pdp-goals/pdp-goals.module';
import { PortfolioGraphModule } from '../portfolio-graph';
import { RedactionModule } from '../processing/redaction/redaction.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { CONVERSATIONS_REPOSITORY } from './conversations.repository.interface';
import { ConversationContextService } from './conversation-context.service';
import { ConversationsService } from './conversations.service';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';

@Module({
  imports: [
    DatabaseModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    MediaModule,
    AnalysisRunsModule,
    PdpGoalsModule,
    RedactionModule,
    forwardRef(() => OutboxModule),
    forwardRef(() => ArtefactsModule),
    forwardRef(() => PortfolioGraphModule),
  ],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationContextService,
    {
      provide: CONVERSATIONS_REPOSITORY,
      useClass: ConversationsRepository,
    },
  ],
  exports: [ConversationsService, ConversationContextService, CONVERSATIONS_REPOSITORY],
})
export class ConversationsModule {}
