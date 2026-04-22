import type { VersionPolicyResponse } from '@acme/shared';
import { UserRole } from '@acme/shared';
import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UpsertVersionPolicyDto } from './dto';
import { VersionPolicyService } from './version-policy.service';

@Controller('admin/version-policy')
@Roles(UserRole.ADMIN)
export class VersionPolicyAdminController {
  constructor(private readonly service: VersionPolicyService) {}

  @Get()
  async getAll(): Promise<VersionPolicyResponse[]> {
    return this.service.getAll();
  }

  @Put(':platform')
  async upsert(
    @Param('platform') platform: string,
    @Body() dto: UpsertVersionPolicyDto
  ): Promise<VersionPolicyResponse> {
    if (platform !== dto.platform) {
      throw new BadRequestException(
        `URL platform "${platform}" does not match body platform "${dto.platform}"`
      );
    }
    return this.service.upsert(dto);
  }
}
