import { UserRole, type AuthUser, type LoginResponse } from '@acme/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { OtpService } from '../otp';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User, UserDocument } from './schemas/user.schema';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private otpService: OtpService
  ) {}

  // ── OTP-based auth ──

  async otpSend(email: string): Promise<{ message: string }> {
    return this.otpService.sendOtp(email);
  }

  async otpVerifyAndLogin(email: string, code: string): Promise<LoginResponse> {
    await this.otpService.verifyOtp(email, code);

    const normalizedEmail = email.toLowerCase();
    let user = await this.userModel.findOne({ email: normalizedEmail });

    if (!user) {
      // Create new user (passwordless — store a random hash as placeholder)
      const placeholderHash = await argon2.hash(crypto.randomBytes(32).toString('base64'), {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      user = await this.userModel.create({
        name: normalizedEmail.split('@')[0],
        email: normalizedEmail,
        passwordHash: placeholderHash,
        role: UserRole.USER,
        tokenVersion: 0,
      });

      this.logger.log(`New user created via OTP: ${normalizedEmail}`);
    }

    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: this.toAuthUser(user),
    };
  }

  async claimGuestAccount(
    guestUserId: string,
    email: string,
    code: string,
    name?: string
  ): Promise<LoginResponse> {
    await this.otpService.verifyOtp(email, code);

    const normalizedEmail = email.toLowerCase();

    // Check the email isn't already taken by another user
    const existingUser = await this.userModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    // Find the guest user
    const guestUser = await this.userModel.findById(guestUserId);
    if (!guestUser) {
      throw new BadRequestException('Guest account not found');
    }

    if (guestUser.role !== UserRole.USER_GUEST) {
      throw new BadRequestException('Account is already registered');
    }

    // Upgrade in place — all data stays linked to the same _id
    guestUser.email = normalizedEmail;
    guestUser.role = UserRole.USER;
    if (name) {
      guestUser.name = name;
    }
    guestUser.tokenVersion = (guestUser.tokenVersion ?? 0) + 1;
    await guestUser.save();

    this.logger.log(`Guest account claimed: ${normalizedEmail}`);

    const accessToken = this.generateToken(guestUser);

    return {
      accessToken,
      user: this.toAuthUser(guestUser),
    };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.userModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
    return { message: 'All sessions invalidated' };
  }

  // ── Legacy password-based auth (to be removed in Phase 3) ──

  async register(dto: RegisterDto): Promise<LoginResponse> {
    const existingUser = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    return this.createUser({
      email: dto.email,
      password: dto.password,
      name: dto.name,
    });
  }

  async registerGuest(): Promise<LoginResponse> {
    const guestId = crypto.randomUUID();
    const password = crypto.randomBytes(32).toString('base64');

    const response = await this.createUser({
      email: `guest_${guestId}@guest.local`,
      password,
      name: 'Guest',
      role: UserRole.USER_GUEST,
    });

    return { ...response, password };
  }

  private async createUser(params: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
  }): Promise<LoginResponse> {
    const passwordHash = await argon2.hash(params.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await this.userModel.create({
      name: params.name,
      email: params.email.toLowerCase(),
      passwordHash,
      ...(params.role !== undefined && { role: params.role }),
    });

    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: this.toAuthUser(user),
    };
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });

    if (!user) {
      this.logger.debug(`Login attempt for non-existent email: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.logger.debug(`Login attempt for locked account: ${dto.email}`);
      throw new UnauthorizedException('Account is temporarily locked. Please try again later.');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!isPasswordValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const updates: Partial<User> = { failedLoginAttempts: failedAttempts };

      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        this.logger.warn(`Account locked due to too many failed attempts: ${dto.email}`);
      }

      await this.userModel.updateOne({ _id: user._id }, updates);

      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.userModel.updateOne(
        { _id: user._id },
        { failedLoginAttempts: 0, lockedUntil: null }
      );
    }

    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: this.toAuthUser(user),
    };
  }

  // ── Common ──

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toAuthUser(user);
  }

  generateToken(user: UserDocument): string {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    };
    return this.jwtService.sign(payload);
  }

  private toAuthUser(user: UserDocument): AuthUser {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
