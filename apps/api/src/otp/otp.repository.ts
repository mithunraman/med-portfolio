import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import { CreateOtpData, IOtpRepository } from './otp.repository.interface';
import { Otp, OtpDocument } from './schemas/otp.schema';

@Injectable()
export class OtpRepository implements IOtpRepository {
  private readonly logger = new Logger(OtpRepository.name);

  constructor(
    @InjectModel(Otp.name)
    private otpModel: Model<OtpDocument>
  ) {}

  async create(data: CreateOtpData): Promise<Result<Otp, DBError>> {
    try {
      const otp = await this.otpModel.create(data);
      return ok(otp);
    } catch (error) {
      this.logger.error('Failed to create OTP', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create OTP' });
    }
  }

  async findLatestByEmail(email: string): Promise<Result<Otp | null, DBError>> {
    try {
      const otp = await this.otpModel
        .findOne({ email: email.toLowerCase() })
        // _id tiebreak makes "latest" deterministic when two sends share a
        // millisecond createdAt (rows now coexist since sendOtp stopped deleting).
        .sort({ createdAt: -1, _id: -1 })
        .lean();
      return ok(otp);
    } catch (error) {
      this.logger.error('Failed to find OTP by email', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find OTP' });
    }
  }

  async claimVerificationAttempt(
    id: string,
    maxAttempts: number
  ): Promise<Result<Otp | null, DBError>> {
    try {
      // Atomic check-and-consume: only increment if still under the cap. Under
      // concurrency at most maxAttempts requests match { attempts: { $lt } } and
      // increment; the rest get null. Closes the read-then-$inc TOCTOU race.
      const otp = await this.otpModel
        .findOneAndUpdate(
          { _id: id, attempts: { $lt: maxAttempts } },
          { $inc: { attempts: 1 } },
          { new: true }
        )
        .lean();
      return ok(otp); // null → no slot available (cap reached or row gone)
    } catch (error) {
      this.logger.error('Failed to claim OTP attempt', error);
      return err({ code: 'DB_ERROR', message: 'Failed to verify OTP' });
    }
  }

  async deleteByEmail(email: string): Promise<Result<number, DBError>> {
    try {
      const result = await this.otpModel.deleteMany({ email: email.toLowerCase() });
      return ok(result.deletedCount);
    } catch (error) {
      this.logger.error('Failed to delete OTPs by email', error);
      return err({ code: 'DB_ERROR', message: 'Failed to delete OTPs' });
    }
  }

  async deleteById(id: string): Promise<Result<number, DBError>> {
    try {
      const result = await this.otpModel.deleteOne({ _id: id });
      return ok(result.deletedCount);
    } catch (error) {
      this.logger.error('Failed to delete OTP by id', error);
      return err({ code: 'DB_ERROR', message: 'Failed to delete OTP' });
    }
  }

  async countRecentByEmail(email: string, since: Date): Promise<Result<number, DBError>> {
    try {
      const count = await this.otpModel.countDocuments({
        email: email.toLowerCase(),
        createdAt: { $gte: since },
      });
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count recent OTPs', error);
      return err({ code: 'DB_ERROR', message: 'Failed to count recent OTPs' });
    }
  }
}
