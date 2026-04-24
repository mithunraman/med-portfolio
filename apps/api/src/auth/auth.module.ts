import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User, UserSchema } from './schemas/user.schema';
import { Session, SessionSchema } from './schemas/session.schema';
import { SessionsRepository } from './sessions.repository';
import { SESSION_REPOSITORY } from './sessions.repository.interface';
import { OtpModule } from '../otp';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('app.jwt.accessSecret'),
        signOptions: {
          expiresIn: configService.get<string>('app.jwt.accessExpiresIn'),
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
    ]),
    OtpModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    { provide: SESSION_REPOSITORY, useClass: SessionsRepository },
  ],
  exports: [AuthService, TokenService, SESSION_REPOSITORY, MongooseModule],
})
export class AuthModule {}
