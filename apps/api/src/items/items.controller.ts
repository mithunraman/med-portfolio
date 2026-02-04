import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { CreateItemDto, UpdateItemDto, ListItemsDto, UpdateItemStatusDto } from './dto';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import type { Item, ItemListResponse } from '@acme/shared';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateItemDto,
  ): Promise<Item> {
    return this.itemsService.create(user.userId, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListItemsDto,
  ): Promise<ItemListResponse> {
    return this.itemsService.list(user.userId, query);
  }

  @Get(':id')
  async findById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<Item> {
    return this.itemsService.findById(user.userId, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ): Promise<Item> {
    return this.itemsService.update(user.userId, id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateItemStatusDto,
  ): Promise<Item> {
    return this.itemsService.updateStatus(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.itemsService.delete(user.userId, id);
  }
}
