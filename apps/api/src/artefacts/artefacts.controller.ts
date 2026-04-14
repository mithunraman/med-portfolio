import type { Artefact, ArtefactListResponse, ArtefactVersionHistoryResponse } from '@acme/shared';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ArtefactsService } from './artefacts.service';
import {
  CreateArtefactDto,
  EditArtefactDto,
  FinaliseArtefactDto,
  ListArtefactsDto,
  RestoreArtefactVersionDto,
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

  @Delete(':id')
  async deleteArtefact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return this.artefactsService.deleteArtefact(user.userId, id);
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

  @Patch(':id')
  async editArtefact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: EditArtefactDto
  ): Promise<Artefact> {
    return this.artefactsService.editArtefact(user.userId, id, dto);
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

  @Get(':id/versions')
  async getVersionHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string
  ): Promise<ArtefactVersionHistoryResponse> {
    return this.artefactsService.getVersionHistory(user.userId, id);
  }

  @Post(':id/versions/restore')
  async restoreVersion(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: RestoreArtefactVersionDto
  ): Promise<Artefact> {
    return this.artefactsService.restoreVersion(user.userId, id, dto);
  }
}
