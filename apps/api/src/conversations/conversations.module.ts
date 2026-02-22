import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from '../database';
import { MediaModule } from '../media';
import { PortfolioGraphModule } from '../portfolio-graph';
import { ProcessingModule } from '../processing';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { CONVERSATIONS_REPOSITORY } from './conversations.repository.interface';
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
    forwardRef(() => ProcessingModule),
    forwardRef(() => PortfolioGraphModule),
  ],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    {
      provide: CONVERSATIONS_REPOSITORY,
      useClass: ConversationsRepository,
    },
  ],
  exports: [ConversationsService, CONVERSATIONS_REPOSITORY],
})
export class ConversationsModule {}
