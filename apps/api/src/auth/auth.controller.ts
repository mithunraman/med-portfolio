import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import type { LoginResponse, AuthUser } from '@acme/shared';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload): Promise<AuthUser> {
    return this.authService.getCurrentUser(user.userId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(): Promise<{ message: string }> {
    // For JWT, logout is typically handled client-side
    // This endpoint can be used for token blacklisting or audit logging
    return { message: 'Logged out successfully' };
  }
}
