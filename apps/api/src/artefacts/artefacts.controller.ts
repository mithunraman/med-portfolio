import type { Artefact, ArtefactListResponse } from '@acme/shared';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ArtefactsService } from './artefacts.service';
import { CreateArtefactDto, ListArtefactsDto } from './dto';

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
}
