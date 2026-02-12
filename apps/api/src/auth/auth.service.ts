import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { User, UserDocument } from './schemas/user.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserRole, type LoginResponse, type AuthUser } from '@acme/shared';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) { }

  async register(dto: RegisterDto): Promise<LoginResponse> {
    // Check if user already exists
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

    // Use generic error message to prevent user enumeration
    if (!user) {
      this.logger.debug(`Login attempt for non-existent email: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.logger.debug(`Login attempt for locked account: ${dto.email}`);
      throw new UnauthorizedException('Account is temporarily locked. Please try again later.');
    }

    // Verify password
    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!isPasswordValid) {
      // Increment failed attempts
      const failedAttempts = user.failedLoginAttempts + 1;
      const updates: Partial<User> = { failedLoginAttempts: failedAttempts };

      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        this.logger.warn(`Account locked due to too many failed attempts: ${dto.email}`);
      }

      await this.userModel.updateOne({ _id: user._id }, updates);

      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.userModel.updateOne(
        { _id: user._id },
        { failedLoginAttempts: 0, lockedUntil: null },
      );
    }

    // Generate token
    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: this.toAuthUser(user),
    };
  }

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toAuthUser(user);
  }

  private generateToken(user: UserDocument): string {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
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
