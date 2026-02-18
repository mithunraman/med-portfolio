import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { InitiateUploadDto } from './dto';
import { InitiateUploadResult, MediaInfo, MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('initiate')
  async initiateUpload(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: InitiateUploadDto
  ): Promise<InitiateUploadResult> {
    return this.mediaService.initiateUpload(user.userId, dto.mediaType, dto.mimeType);
  }

  @Get(':mediaId')
  async getMedia(
    @CurrentUser() user: CurrentUserPayload,
    @Param('mediaId') mediaId: string
  ): Promise<MediaInfo> {
    return this.mediaService.getMediaInfo(user.userId, mediaId);
  }
}
