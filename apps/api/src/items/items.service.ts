import { Injectable, Inject, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Item, ItemListResponse } from '@acme/shared';
import { ITEMS_REPOSITORY, IItemsRepository } from './items.repository.interface';
import { CreateItemDto, UpdateItemDto, ListItemsDto, UpdateItemStatusDto } from './dto';
import { toItemDto } from './mappers/item.mapper';
import { isErr } from '../common/utils/result.util';

@Injectable()
export class ItemsService {
  constructor(
    @Inject(ITEMS_REPOSITORY)
    private readonly itemsRepository: IItemsRepository,
  ) {}

  async create(userId: string, dto: CreateItemDto): Promise<Item> {
    const result = await this.itemsRepository.create({
      userId: new Types.ObjectId(userId),
      name: dto.name,
      description: dto.description,
    });

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    return toItemDto(result.value);
  }

  async findById(userId: string, itemId: string): Promise<Item> {
    const result = await this.itemsRepository.findById(
      new Types.ObjectId(itemId),
      new Types.ObjectId(userId),
    );

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    if (!result.value) {
      throw new NotFoundException('Item not found');
    }

    return toItemDto(result.value);
  }

  async list(userId: string, query: ListItemsDto): Promise<ItemListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const result = await this.itemsRepository.findByUserId({
      userId: new Types.ObjectId(userId),
      status: query.status,
      page,
      limit,
    });

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    return {
      items: result.value.items.map(toItemDto),
      total: result.value.total,
      page,
      limit,
    };
  }

  async update(userId: string, itemId: string, dto: UpdateItemDto): Promise<Item> {
    const result = await this.itemsRepository.update(
      new Types.ObjectId(itemId),
      new Types.ObjectId(userId),
      dto,
    );

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    if (!result.value) {
      throw new NotFoundException('Item not found');
    }

    return toItemDto(result.value);
  }

  async updateStatus(userId: string, itemId: string, dto: UpdateItemStatusDto): Promise<Item> {
    return this.update(userId, itemId, { status: dto.status });
  }

  async delete(userId: string, itemId: string): Promise<void> {
    const result = await this.itemsRepository.delete(
      new Types.ObjectId(itemId),
      new Types.ObjectId(userId),
    );

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    if (!result.value) {
      throw new NotFoundException('Item not found');
    }
  }
}
