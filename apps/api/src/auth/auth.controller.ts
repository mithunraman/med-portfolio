import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, OtpSendDto, OtpVerifyDto, OtpClaimDto } from './dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import type { LoginResponse, AuthUser } from '@acme/shared';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── OTP-based auth ──

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
    @Body() dto: OtpClaimDto,
  ): Promise<LoginResponse> {
    return this.authService.claimGuestAccount(
      user.userId,
      dto.email,
      dto.code,
      dto.name,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ message: string }> {
    return this.authService.logoutAll(user.userId);
  }

  // ── Legacy (to be removed in Phase 3) ──

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<LoginResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
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
