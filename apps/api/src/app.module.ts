import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config';
import { DatabaseModule } from './database';
import { AuthModule } from './auth/auth.module';
import { ItemsModule } from './items/items.module';
import { JwtAuthGuard, RolesGuard } from './common/guards';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    ItemsModule,
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
