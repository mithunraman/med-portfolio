import { UserRole, type AuthUser, type LoginResponse, type OtpSendResponse } from '@acme/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { OtpService } from '../otp';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private otpService: OtpService
  ) {}

  // ── OTP-based auth ──

  async otpSend(email: string): Promise<OtpSendResponse> {
    const result = await this.otpService.sendOtp(email);
    const normalizedEmail = email.toLowerCase();
    const existingUser = await this.userModel.findOne({ email: normalizedEmail });

    return {
      message: result.message,
      isNewUser: !existingUser,
      ...(result.devOtp && { devOtp: result.devOtp }),
    };
  }

  async otpVerifyAndLogin(email: string, code: string, name?: string): Promise<LoginResponse> {
    await this.otpService.verifyOtp(email, code);

    const normalizedEmail = email.toLowerCase();
    let user = await this.userModel.findOne({ email: normalizedEmail });

    if (!user) {
      user = await this.userModel.create({
        name: name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
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
    name: string
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
    guestUser.name = name;
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

  async registerGuest(): Promise<LoginResponse> {
    const guestId = crypto.randomUUID();

    const user = await this.userModel.create({
      name: 'Guest',
      email: `guest_${guestId}@guest.local`,
      role: UserRole.USER_GUEST,
      tokenVersion: 0,
    });

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
