import type { Artefact, ArtefactListResponse } from '@acme/shared';
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ArtefactsService } from './artefacts.service';
import {
  CreateArtefactDto,
  FinaliseArtefactDto,
  ListArtefactsDto,
  UpdateArtefactStatusDto,
} from './dto';

@Controller('artefacts')
export class ArtefactsController {
  constructor(private readonly artefactsService: ArtefactsService) {}

  @Post()
  async createArtefact(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateArtefactDto
  ): Promise<Artefact> {
    return this.artefactsService.createArtefact(user.userId, dto);
  }

  @Get()
  async listArtefacts(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListArtefactsDto
  ): Promise<ArtefactListResponse> {
    return this.artefactsService.listArtefacts(user.userId, query);
  }

  @Get(':id')
  async getArtefact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string
  ): Promise<Artefact> {
    return this.artefactsService.getArtefact(user.userId, id);
  }

  @Put(':id/status')
  async updateArtefactStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateArtefactStatusDto
  ): Promise<Artefact> {
    return this.artefactsService.updateArtefactStatus(user.userId, id, dto);
  }

  @Post(':id/finalise')
  async finaliseArtefact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: FinaliseArtefactDto
  ): Promise<Artefact> {
    return this.artefactsService.finaliseArtefact(user.userId, id, dto);
  }

  @Post(':id/duplicate')
  async duplicateToReview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string
  ): Promise<Artefact> {
    return this.artefactsService.duplicateToReview(user.userId, id);
  }
}
