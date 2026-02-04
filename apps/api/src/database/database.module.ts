import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { TransactionService } from './transaction.service';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('app.mongodb.uri'),
      }),
    }),
  ],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class DatabaseModule { }
