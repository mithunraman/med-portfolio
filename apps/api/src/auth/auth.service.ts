import {
  AuthErrorCode,
  SessionRevokedReason,
  UserRole,
  type AuthUser,
  type LoginResponse,
  type OtpSendResponse,
  type RefreshTokenResponse,
  type SessionView,
  type UpdateProfileRequest,
} from '@acme/shared';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import ms from 'ms';
import { DeviceInfo } from '../common/decorators/device-info.decorator';
import { isMongoDuplicateKeyError } from '../common/utils/mongo-errors.util';
import { nanoidAlphanumeric } from '../common/utils/nanoid.util';
import { isErr } from '../common/utils/result.util';
import { OtpService } from '../otp';
import { getSpecialtyConfig, isValidTrainingStage } from '../specialties/specialty.registry';
import { SessionRecord } from './schemas/session.schema';
import { User, UserDocument } from './schemas/user.schema';
import { ISessionRepository, SESSION_REPOSITORY } from './sessions.repository.interface';
import { TokenService } from './token.service';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtlMs: number;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly configService: ConfigService
  ) {
    const days = this.configService.get<number>('app.jwt.refreshTtlDays', 90);
    this.refreshTtlMs = days * ms('1d');
  }

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

  async otpVerifyAndLogin(
    email: string,
    code: string,
    device: DeviceInfo,
    name?: string
  ): Promise<LoginResponse> {
    await this.otpService.verifyOtp(email, code);

    const normalizedEmail = email.toLowerCase();
    let user = await this.userModel.findOne({ email: normalizedEmail });

    if (!user) {
      user = await this.userModel.create({
        name: name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        role: UserRole.USER,
      });
      this.logger.log(`New user created via OTP: ${normalizedEmail}`);
    }

    const tokens = await this.createSessionAndTokens(user, device);
    this.logger.log(
      `auth.login userId=${user._id.toString()} method=otp device=${device.deviceId}`
    );

    return { ...tokens, user: this.toAuthUser(user) };
  }

  async claimGuestAccount(
    guestUserId: string,
    guestSessionId: string,
    email: string,
    code: string,
    name: string,
    device: DeviceInfo
  ): Promise<LoginResponse> {
    await this.otpService.verifyOtp(email, code);

    const normalizedEmail = email.toLowerCase();

    const existingUser = await this.userModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const guestUser = await this.userModel.findById(guestUserId);
    if (!guestUser) throw new BadRequestException('Guest account not found');
    if (guestUser.role !== UserRole.USER_GUEST)
      throw new BadRequestException('Account is already registered');

    guestUser.email = normalizedEmail;
    guestUser.role = UserRole.USER;
    guestUser.name = name;
    try {
      await guestUser.save();
    } catch (error) {
      // Translate the unique-index race: two concurrent claims with the same
      // email both pass the pre-check above, then one save() wins and the
      // other raises E11000.
      if (isMongoDuplicateKeyError(error, 'email')) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    // Revoke the guest's current session — best-effort. If this fails (DB
    // glitch), the stale session dies at its 90-day TTL. We log and continue
    // because the primary action (claim) is already successful.
    const revokeResult = await this.sessionRepo.revoke(
      guestSessionId,
      SessionRevokedReason.SUPERSEDED
    );
    if (isErr(revokeResult)) {
      this.logger.error(
        `Failed to revoke guest session ${guestSessionId} during claim for user ${guestUser._id.toString()}`
      );
    }

    const tokens = await this.createSessionAndTokens(guestUser, device);
    this.logger.log(
      `auth.login userId=${guestUser._id.toString()} method=claim device=${device.deviceId}`
    );

    return { ...tokens, user: this.toAuthUser(guestUser) };
  }

  async registerGuest(device: DeviceInfo): Promise<LoginResponse> {
    const user = await this.userModel.create({
      name: 'Guest',
      email: `guest_${nanoidAlphanumeric()}@guest.local`,
      role: UserRole.USER_GUEST,
    });

    const tokens = await this.createSessionAndTokens(user, device);
    this.logger.log(
      `auth.login userId=${user._id.toString()} method=guest device=${device.deviceId}`
    );

    return { ...tokens, user: this.toAuthUser(user) };
  }

  // ── Refresh ──

  async refreshSession(rawRefreshToken: string, device: DeviceInfo): Promise<RefreshTokenResponse> {
    const hash = this.tokenService.hashRefreshToken(rawRefreshToken);

    const activeResult = await this.sessionRepo.findActiveByRefreshHash(hash);
    if (isErr(activeResult)) {
      throw new UnauthorizedException({
        code: AuthErrorCode.REFRESH_INVALID,
        message: 'Failed to validate refresh token',
      });
    }

    let session = activeResult.value;

    if (!session) {
      // Not an active token — check if it's a rotated-away token being replayed.
      const replayResult = await this.sessionRepo.findByPreviousHash(hash);
      if (!isErr(replayResult) && replayResult.value) {
        const replay = replayResult.value;
        await this.sessionRepo.revokeFamily(
          replay.refreshTokenFamily,
          SessionRevokedReason.ROTATION_REPLAY
        );
        this.logger.warn(
          `auth.refresh.replay userId=${replay.userId} family=${replay.refreshTokenFamily}`
        );
        throw new UnauthorizedException({
          code: AuthErrorCode.REFRESH_REPLAY,
          message: 'Refresh token replay detected',
        });
      }
      throw new UnauthorizedException({
        code: AuthErrorCode.REFRESH_INVALID,
        message: 'Refresh token is invalid',
      });
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: AuthErrorCode.SESSION_EXPIRED,
        message: 'Session has expired',
      });
    }

    const user = await this.userModel.findById(session.userId).select('role anonymizedAt').lean();
    if (!user || user.anonymizedAt) {
      throw new UnauthorizedException({
        code: AuthErrorCode.USER_INACTIVE,
        message: 'User is not active',
      });
    }

    // CAS on the current hash — if a concurrent refresh rotated first, this
    // lookup misses and we return REFRESH_INVALID (defence against client-side
    // single-flight failures and replay attempts that slipped past the active
    // lookup above).
    const newRefresh = this.tokenService.generateRefreshToken();
    const rotateResult = await this.sessionRepo.rotate(session.id, hash, newRefresh.hash);
    if (isErr(rotateResult)) {
      throw new UnauthorizedException({
        code: AuthErrorCode.REFRESH_INVALID,
        message: 'Failed to rotate refresh token',
      });
    }
    session = rotateResult.value;

    const userIdStr = session.userId;
    const accessToken = this.tokenService.signAccessToken(
      { id: userIdStr, role: user.role },
      session.id
    );
    this.logger.log(
      `auth.refresh userId=${userIdStr} sessionId=${session.id} device=${device.deviceId}`
    );

    return { accessToken, refreshToken: newRefresh.raw };
  }

  // ── Logout ──

  async logout(sessionId: string): Promise<{ message: string }> {
    const result = await this.sessionRepo.revoke(sessionId, SessionRevokedReason.LOGOUT);
    if (isErr(result)) {
      this.logger.error(`Failed to revoke session ${sessionId}`);
    } else {
      this.logger.log(`auth.logout sessionId=${sessionId}`);
    }
    return { message: 'Logged out' };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    const result = await this.sessionRepo.revokeAllByUser(userId, SessionRevokedReason.LOGOUT_ALL);
    if (isErr(result)) {
      this.logger.error(`Failed to revoke all sessions for user ${userId}`);
    } else {
      this.logger.log(`auth.logout_all userId=${userId} revoked=${result.value}`);
    }
    return { message: 'All sessions invalidated' };
  }

  // ── Session management ──

  async listSessions(userId: string, currentSessionId: string): Promise<SessionView[]> {
    const result = await this.sessionRepo.listActiveByUser(userId);
    if (isErr(result)) return [];
    return result.value.map((s) => this.toSessionView(s, currentSessionId));
  }

  // isCurrent compares the internal session id because that's what the JWT's
  // `sid` claim carries. External callers (mobile/web) see xid and never the
  // internal id — so they don't need to reason about this detail.

  async revokeSession(userId: string, sessionXid: string): Promise<{ message: string }> {
    // Single-statement atomic ownership check + revoke. Returns false if:
    //   - the xid doesn't exist, or
    //   - the session belongs to someone else, or
    //   - it was already revoked.
    // All three collapse to 400 — we don't disclose which it was.
    const result = await this.sessionRepo.revokeOwnedByUserXid(
      sessionXid,
      userId,
      SessionRevokedReason.LOGOUT
    );
    if (isErr(result) || !result.value) {
      throw new BadRequestException('Session not found');
    }
    this.logger.log(`auth.session.revoked userId=${userId} sessionXid=${sessionXid}`);
    return { message: 'Session revoked' };
  }

  // ── Profile / deletion (unchanged behavior) ──

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
    return this.toAuthUser(user);
  }

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
    return this.toAuthUser(user);
  }

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.findUserOrThrow(userId);
    return this.toAuthUser(user);
  }

  // ── Internals ──

  private async createSessionAndTokens(user: UserDocument, device: DeviceInfo): Promise<TokenPair> {
    if (!device.deviceId) {
      throw new BadRequestException('X-Device-Id header is required');
    }

    // Atomically revoke any prior active session on this device.
    // One round-trip; safe against concurrent logins from the same device.
    await this.sessionRepo.revokeActiveByUserAndDevice(
      user._id.toString(),
      device.deviceId,
      SessionRevokedReason.SUPERSEDED
    );

    const refresh = this.tokenService.generateRefreshToken();
    const family = this.tokenService.generateFamily();
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);

    const created = await this.sessionRepo.create({
      userId: user._id.toString(),
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      refreshTokenHash: refresh.hash,
      refreshTokenFamily: family,
      expiresAt,
    });
    if (isErr(created)) {
      throw new UnauthorizedException('Failed to create session');
    }

    const accessToken = this.tokenService.signAccessToken(
      { id: user._id.toString(), role: user.role },
      created.value.id
    );
    return { accessToken, refreshToken: refresh.raw };
  }

  private async findUserOrThrow(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  private toSessionView(session: SessionRecord, currentSessionId: string): SessionView {
    return {
      id: session.xid,
      deviceName: session.deviceName,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      isCurrent: session.id === currentSessionId,
    };
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
