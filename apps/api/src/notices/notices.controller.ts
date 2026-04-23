import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
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
    await this.service.dismiss(user.userId, noticeXid);
  }
}
