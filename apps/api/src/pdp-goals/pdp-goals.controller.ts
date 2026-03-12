import type { ListPdpGoalsResponse, PdpGoalResponse } from '@acme/shared';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  AddPdpGoalActionDto,
  ListPdpGoalsDto,
  UpdatePdpGoalActionDto,
  UpdatePdpGoalDto,
} from './dto';
import { PdpGoalsService } from './pdp-goals.service';

@Controller('pdp-goals')
export class PdpGoalsController {
  constructor(private readonly pdpGoalsService: PdpGoalsService) {}

  @Get()
  async listGoals(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListPdpGoalsDto
  ): Promise<ListPdpGoalsResponse> {
    return this.pdpGoalsService.listGoals(user.userId, query.status);
  }

  @Get(':xid')
  async getGoal(
    @CurrentUser() user: CurrentUserPayload,
    @Param('xid') xid: string
  ): Promise<PdpGoalResponse> {
    return this.pdpGoalsService.getGoal(user.userId, xid);
  }

  @Patch(':xid')
  async updateGoal(
    @CurrentUser() user: CurrentUserPayload,
    @Param('xid') xid: string,
    @Body() dto: UpdatePdpGoalDto
  ): Promise<PdpGoalResponse> {
    return this.pdpGoalsService.updateGoal(user.userId, xid, dto);
  }

  @Post(':xid/actions')
  async addAction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('xid') xid: string,
    @Body() dto: AddPdpGoalActionDto
  ): Promise<PdpGoalResponse> {
    return this.pdpGoalsService.addAction(user.userId, xid, dto);
  }

  @Patch(':xid/actions/:actionXid')
  async updateAction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('xid') xid: string,
    @Param('actionXid') actionXid: string,
    @Body() dto: UpdatePdpGoalActionDto
  ): Promise<PdpGoalResponse> {
    return this.pdpGoalsService.updateAction(user.userId, xid, actionXid, dto);
  }
}
