import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpCodeEntity } from '../database/entities/otp-code.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { RefreshTokenEntity } from '../database/entities/refresh-token.entity';
import { UserEntity } from '../database/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { ConsoleSmsService } from './sms/sms.service';
import { TwilioSmsService } from './sms/twilio-sms.service';
import { SocialProviderService } from './social/social-provider.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, ProfileEntity, RefreshTokenEntity, OtpCodeEntity]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    OtpService,
    SocialProviderService,
    ConsoleSmsService,
    TwilioSmsService,
    JwtStrategy,
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
