import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config';
import { DatabaseModule } from './database';
import { AuthModule } from './auth/auth.module';
import { ItemsModule } from './items/items.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ArtefactsModule } from './artefacts/artefacts.module';
import { StorageModule } from './storage';
import { LLMModule } from './llm';
import { MediaModule } from './media';
import { ProcessingModule } from './processing';
import { JwtAuthGuard, RolesGuard } from './common/guards';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    ItemsModule,
    StorageModule,
    LLMModule,
    MediaModule,
    ProcessingModule,
    ConversationsModule,
    ArtefactsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
