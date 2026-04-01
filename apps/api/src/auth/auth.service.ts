import {
  UserRole,
  type AuthUser,
  type LoginResponse,
  type OtpSendResponse,
  type UpdateProfileRequest,
} from '@acme/shared';
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
import ms from 'ms';
import { OtpService } from '../otp';
import { getSpecialtyConfig, isValidTrainingStage } from '../specialties/specialty.registry';
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

  async updateProfile(userId: string, dto: UpdateProfileRequest): Promise<AuthUser> {
    if (!isValidTrainingStage(dto.specialty, dto.trainingStage)) {
      throw new BadRequestException(
        `Training stage "${dto.trainingStage}" is not valid for specialty ${dto.specialty}`
      );
    }

    const updateFields: Record<string, unknown> = {
      specialty: dto.specialty,
      trainingStage: dto.trainingStage,
    };
    if (dto.name !== undefined) {
      updateFields.name = dto.name;
    }

    const user = await this.userModel.findByIdAndUpdate(userId, updateFields, { new: true });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    this.logger.log(
      `Profile updated for user ${userId}: specialty=${dto.specialty}, stage=${dto.trainingStage}`
    );
    return this.toAuthUser(user);
  }

  // ── Account deletion ──

  private static readonly DELETION_GRACE_PERIOD_MS = ms('48h');

  async requestDeletion(userId: string): Promise<AuthUser> {
    const user = await this.findUserOrThrow(userId);

    if (user.deletionRequestedAt) {
      throw new ConflictException('Account deletion already requested');
    }

    const now = new Date();
    user.deletionRequestedAt = now;
    user.deletionScheduledFor = new Date(now.getTime() + AuthService.DELETION_GRACE_PERIOD_MS);
    await user.save();

    this.logger.log(
      `Account deletion requested for user ${userId}, scheduled for ${user.deletionScheduledFor.toISOString()}`
    );
    return this.toAuthUser(user);
  }

  async cancelDeletion(userId: string): Promise<AuthUser> {
    const user = await this.findUserOrThrow(userId);

    if (!user.deletionRequestedAt) {
      throw new BadRequestException('No pending deletion request');
    }

    user.deletionRequestedAt = null;
    user.deletionScheduledFor = null;
    await user.save();

    this.logger.log(`Account deletion cancelled for user ${userId}`);
    return this.toAuthUser(user);
  }

  // ── Common ──

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.findUserOrThrow(userId);
    return this.toAuthUser(user);
  }

  private async findUserOrThrow(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
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

  toAuthUser(user: UserDocument): AuthUser {
    let specialty: AuthUser['specialty'] = null;

    if (user.specialty && user.trainingStage) {
      const config = getSpecialtyConfig(user.specialty);
      const stage = config.trainingStages.find((s) => s.code === user.trainingStage);

      specialty = {
        code: user.specialty,
        name: config.name,
        trainingStage: {
          code: user.trainingStage,
          label: stage?.label ?? user.trainingStage,
        },
      };
    }

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      specialty,
      deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
      deletionScheduledFor: user.deletionScheduledFor?.toISOString() ?? null,
    };
  }
}
