import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession, FilterQuery } from 'mongoose';
import { Item, ItemDocument } from './schemas/item.schema';
import {
  IItemsRepository,
  CreateItemData,
  UpdateItemData,
  ListItemsQuery,
  ListItemsResult,
  DBError,
} from './items.repository.interface';
import { Result, ok, err } from '../common/utils/result.util';

@Injectable()
export class ItemsRepository implements IItemsRepository {
  private readonly logger = new Logger(ItemsRepository.name);

  constructor(@InjectModel(Item.name) private itemModel: Model<ItemDocument>) {}

  async create(
    data: CreateItemData,
    session?: ClientSession,
  ): Promise<Result<Item, DBError>> {
    try {
      const [item] = await this.itemModel.create([data], { session });
      return ok(item);
    } catch (error) {
      this.logger.error('Failed to create item', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create item' });
    }
  }

  async findById(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<Item | null, DBError>> {
    try {
      const item = await this.itemModel
        .findOne({ _id: id, userId })
        .lean()
        .session(session || null);
      return ok(item);
    } catch (error) {
      this.logger.error('Failed to find item', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find item' });
    }
  }

  async findByUserId(
    query: ListItemsQuery,
    session?: ClientSession,
  ): Promise<Result<ListItemsResult, DBError>> {
    try {
      const filter: FilterQuery<ItemDocument> = { userId: query.userId };

      if (query.status !== undefined) {
        filter.status = query.status;
      }

      const skip = (query.page - 1) * query.limit;

      const [items, total] = await Promise.all([
        this.itemModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(query.limit)
          .lean()
          .session(session || null),
        this.itemModel.countDocuments(filter).session(session || null),
      ]);

      return ok({ items, total });
    } catch (error) {
      this.logger.error('Failed to list items', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list items' });
    }
  }

  async update(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    data: UpdateItemData,
    session?: ClientSession,
  ): Promise<Result<Item | null, DBError>> {
    try {
      const item = await this.itemModel
        .findOneAndUpdate(
          { _id: id, userId },
          { $set: data },
          { new: true, session },
        )
        .lean();
      return ok(item);
    } catch (error) {
      this.logger.error('Failed to update item', error);
      return err({ code: 'DB_ERROR', message: 'Failed to update item' });
    }
  }

  async delete(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<boolean, DBError>> {
    try {
      const result = await this.itemModel
        .deleteOne({ _id: id, userId })
        .session(session || null);
      return ok(result.deletedCount > 0);
    } catch (error) {
      this.logger.error('Failed to delete item', error);
      return err({ code: 'DB_ERROR', message: 'Failed to delete item' });
    }
  }
}
