import type {
  AuthUser,
  LoginResponse,
  OtpSendResponse,
  RefreshTokenResponse,
  SessionView,
} from '@acme/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { DeviceInfo, DeviceInfoHeaders } from '../common/decorators/device-info.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { OtpClaimDto, OtpSendDto, OtpVerifyDto, RefreshTokenDto, UpdateProfileDto } from './dto';

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
  async otpVerify(
    @Body() dto: OtpVerifyDto,
    @DeviceInfoHeaders() device: DeviceInfo
  ): Promise<LoginResponse> {
    return this.authService.otpVerifyAndLogin(dto.email, dto.code, device, dto.name);
  }

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  async claimGuest(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: OtpClaimDto,
    @DeviceInfoHeaders() device: DeviceInfo
  ): Promise<LoginResponse> {
    return this.authService.claimGuestAccount(
      user.userId,
      user.sessionId,
      dto.email,
      dto.code,
      dto.name,
      device
    );
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @DeviceInfoHeaders() device: DeviceInfo
  ): Promise<RefreshTokenResponse> {
    return this.authService.refreshSession(dto.refreshToken, device);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: CurrentUserPayload): Promise<{ message: string }> {
    return this.authService.logout(user.sessionId);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() user: CurrentUserPayload): Promise<{ message: string }> {
    return this.authService.logoutAll(user.userId);
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: CurrentUserPayload): Promise<SessionView[]> {
    return this.authService.listSessions(user.userId, user.sessionId);
  }

  @Delete('sessions/:xid')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('xid') xid: string
  ): Promise<{ message: string }> {
    return this.authService.revokeSession(user.userId, xid);
  }

  @Public()
  @Post('guest')
  async registerGuest(@DeviceInfoHeaders() device: DeviceInfo): Promise<LoginResponse> {
    return this.authService.registerGuest(device);
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
