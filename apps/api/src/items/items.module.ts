import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { ItemsRepository } from './items.repository';
import { ITEMS_REPOSITORY } from './items.repository.interface';
import { Item, ItemSchema } from './schemas/item.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Item.name, schema: ItemSchema }])],
  controllers: [ItemsController],
  providers: [
    ItemsService,
    {
      provide: ITEMS_REPOSITORY,
      useClass: ItemsRepository,
    },
  ],
  exports: [ItemsService],
})
export class ItemsModule {}
