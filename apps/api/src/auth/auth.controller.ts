import type { AuthUser, LoginResponse } from '@acme/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { OtpClaimDto, OtpSendDto, OtpVerifyDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  async otpSend(@Body() dto: OtpSendDto): Promise<{ message: string }> {
    return this.authService.otpSend(dto.email);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async otpVerify(@Body() dto: OtpVerifyDto): Promise<LoginResponse> {
    return this.authService.otpVerifyAndLogin(dto.email, dto.code);
  }

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  async claimGuest(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: OtpClaimDto
  ): Promise<LoginResponse> {
    return this.authService.claimGuestAccount(user.userId, dto.email, dto.code, dto.name);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: CurrentUserPayload): Promise<{ message: string }> {
    return this.authService.logoutAll(user.userId);
  }

  @Public()
  @Post('guest')
  async registerGuest(): Promise<LoginResponse> {
    return this.authService.registerGuest();
  }

  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload): Promise<AuthUser> {
    return this.authService.getCurrentUser(user.userId);
  }
}
