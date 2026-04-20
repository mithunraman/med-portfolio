import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Types } from 'mongoose';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { NoticesService } from './notices.service';

@Controller('notices')
export class NoticesController {
  constructor(private readonly service: NoticesService) {}

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') noticeXid: string
  ): Promise<void> {
    const userId = new Types.ObjectId(user.userId);
    await this.service.dismiss(userId, noticeXid);
  }
}
