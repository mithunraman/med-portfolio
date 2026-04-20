import type { AdminNoticeResponse } from '@acme/shared';
import { UserRole } from '@acme/shared';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateNoticeDto, UpdateNoticeDto } from './dto';
import { NoticesService } from './notices.service';

@Controller('admin/notices')
@Roles(UserRole.ADMIN)
export class NoticesAdminController {
  constructor(private readonly service: NoticesService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('active') active?: string
  ): Promise<{ items: AdminNoticeResponse[]; total: number }> {
    const filter: { active?: boolean } = {};
    if (active === 'true') filter.active = true;
    if (active === 'false') filter.active = false;

    return this.service.adminList(filter, Number(page) || 1, Math.min(Number(limit) || 20, 100));
  }

  @Post()
  async create(@Body() dto: CreateNoticeDto): Promise<AdminNoticeResponse> {
    return this.service.adminCreate(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateNoticeDto): Promise<AdminNoticeResponse> {
    return this.service.adminUpdate(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.service.adminDelete(id);
  }
}
