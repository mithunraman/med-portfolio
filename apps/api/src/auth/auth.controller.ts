import type { AuthUser, LoginResponse, OtpSendResponse } from '@acme/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { OtpClaimDto, OtpSendDto, OtpVerifyDto, UpdateProfileDto } from './dto';

@SkipThrottle()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('otp/send')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async otpSend(@Body() dto: OtpSendDto): Promise<OtpSendResponse> {
    return this.authService.otpSend(dto.email);
  }

  @Public()
  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async otpVerify(@Body() dto: OtpVerifyDto): Promise<LoginResponse> {
    return this.authService.otpVerifyAndLogin(dto.email, dto.code, dto.name);
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

  @Post('me/request-deletion')
  @HttpCode(HttpStatus.OK)
  async requestDeletion(@CurrentUser() user: CurrentUserPayload): Promise<AuthUser> {
    return this.authService.requestDeletion(user.userId);
  }

  @Post('me/cancel-deletion')
  @HttpCode(HttpStatus.OK)
  async cancelDeletion(@CurrentUser() user: CurrentUserPayload): Promise<AuthUser> {
    return this.authService.cancelDeletion(user.userId);
  }

  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload): Promise<AuthUser> {
    return this.authService.getCurrentUser(user.userId);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProfileDto
  ): Promise<AuthUser> {
    return this.authService.updateProfile(user.userId, dto);
  }
}
