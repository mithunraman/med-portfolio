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
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { DeviceInfo, DeviceInfoHeaders } from '../common/decorators/device-info.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RateLimit } from '../common/throttler/throttler.decorators';
import { AuthService } from './auth.service';
import { OtpClaimDto, OtpSendDto, OtpVerifyDto, RefreshTokenDto, UpdateProfileDto } from './dto';

// No class-level @SkipThrottle: routes without @RateLimit inherit the global
// tiers as a baseline; sensitive routes set a tighter cap with @RateLimit below.
// Note @RateLimit REPLACES all tiers with its single {limit, ttl} (it does not
// intersect the global tiers) — every value below is tighter than all of them.
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('otp/send')
  // Per-IP cap is a COARSE anti-spray backstop only — the real send control is
  // per-EMAIL (rateLimitMax, 3/10min in OtpService), which bounds inbox spam,
  // provider cost, and live-code count per recipient. This IP cap exists solely
  // to blunt one source spraying many distinct emails. Sized generously (60/10min
  // ≈ 20 distinct users at 3 sends each) so a shared CGNAT/NAT egress IP doesn't
  // lock legitimate users out of login. Distributed abuse (IP rotation) is out of
  // scope for a per-IP cap — a global send-rate alarm is the backstop for that.
  @RateLimit({ limit: 60, ttl: 600_000 })
  @HttpCode(HttpStatus.OK)
  async otpSend(@Body() dto: OtpSendDto): Promise<OtpSendResponse> {
    return this.authService.otpSend(dto.email);
  }

  @Public()
  @Post('otp/verify')
  // Tighter than otp/send (verify is the brute-force surface) but still CGNAT-
  // tolerant. The real verify control is per-EMAIL (maxAttempts + EmailLockout),
  // so this per-IP cap is secondary defense-in-depth, not the primary guard.
  @RateLimit({ limit: 30, ttl: 600_000 })
  @HttpCode(HttpStatus.OK)
  async otpVerify(
    @Body() dto: OtpVerifyDto,
    @DeviceInfoHeaders() device: DeviceInfo
  ): Promise<LoginResponse> {
    return this.authService.otpVerifyAndLogin(dto.email, dto.code, device, dto.name);
  }

  @Post('claim')
  @RateLimit({ limit: 10, ttl: 600_000 })
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
  @RateLimit({ limit: 30, ttl: 60_000 })
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
  // Guest registration is unauthenticated and mints a user + session per call,
  // so bound it per-IP to stop it being scripted into unbounded account/session
  // creation (item 45).
  @RateLimit({ limit: 5, ttl: 60_000 })
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
