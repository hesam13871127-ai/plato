import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type { AppConfig } from '../config/configuration';
import { ProfileEntity } from '../database/entities/profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import { normalizePhone } from '../common/utils/phone.util';
import { UserDto } from '../users/dto/user.dto';
import { toUserDto } from '../users/user.serializer';
import { UsersService } from '../users/users.service';
import {
  EmailLoginDto,
  EmailRegisterDto,
  PhoneOtpVerifyDto,
} from './dto/auth.dto';
import { OtpService } from './otp.service';
import { TokenPair, TokenService } from './token.service';
import { ModerationService } from '../moderation/moderation.service';

export interface AuthResult {
  user: UserDto;
  tokens: TokenPair;
  isNewUser: boolean;
}

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly dataSource: DataSource,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly moderation: ModerationService,
  ) {}

  // ------------------------------------------------------------------
  // Phone OTP
  // ------------------------------------------------------------------

  async requestPhoneOtp(phone: string): Promise<{ sent: true; devCode?: string }> {
    const result = await this.otpService.requestCode(phone, 'login');
    return { sent: true, ...result };
  }

  async verifyPhoneOtp(dto: PhoneOtpVerifyDto, meta: RequestMeta): Promise<AuthResult> {
    await this.otpService.verifyCode(dto.phone, dto.code, 'login');

    const phone = normalizePhone(dto.phone);
    let user = await this.users.findOne({
      where: { phone },
      relations: { profile: true },
    });

    let isNewUser = false;
    if (!user) {
      user = await this.createUser({
        phone,
        isVerified: true,
        primaryProvider: 'phone',
        displayName: dto.displayName ?? `Player`,
      });
      isNewUser = true;
    }

    await this.assertCanAuthenticate(user);
    const tokens = await this.tokenService.issueTokens(user, meta);
    return { user: (await this.toDto(user.id)).user, tokens, isNewUser };
  }

  // ------------------------------------------------------------------
  // Email / password
  // ------------------------------------------------------------------

  async registerEmail(dto: EmailRegisterDto, meta: RequestMeta): Promise<AuthResult> {
    const email = dto.email.toLowerCase();

    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const usernameTaken = await this.profiles.findOne({ where: { username: dto.username } });
    if (usernameTaken) {
      throw new ConflictException('Username is already taken.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.createUser({
      email,
      passwordHash,
      isVerified: false,
      primaryProvider: 'email',
      displayName: dto.displayName,
      username: dto.username,
    });

    const tokens = await this.tokenService.issueTokens(user, meta);
    return { user: (await this.toDto(user.id)).user, tokens, isNewUser: true };
  }

  async loginEmail(dto: EmailLoginDto, meta: RequestMeta): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const user = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.assertCanAuthenticate(user);
    const tokens = await this.tokenService.issueTokens(user, meta);
    return { user: (await this.toDto(user.id)).user, tokens, isNewUser: false };
  }

  // ------------------------------------------------------------------
  // Refresh / logout
  // ------------------------------------------------------------------

  async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    return this.tokenService.rotateTokens(rawRefreshToken, meta);
  }

  async logout(rawRefreshToken: string): Promise<{ loggedOut: true }> {
    await this.tokenService.revoke(rawRefreshToken);
    return { loggedOut: true };
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async assertCanAuthenticate(user: UserEntity): Promise<void> {
    if (user.status === 'banned' || user.status === 'deleted' || user.status === 'suspended') {
      throw new ForbiddenException('This account is not permitted to sign in.');
    }
    // Enforce time-boxed / permanent suspension bans issued by moderation.
    await this.moderation.assertNotSuspended(user.id);
  }

  private async createUser(params: {
    phone?: string | null;
    email?: string | null;
    passwordHash?: string | null;
    primaryProvider: UserEntity['primaryProvider'];
    isVerified: boolean;
    displayName: string;
    username?: string;
  }): Promise<UserEntity> {
    const username = params.username ?? (await this.usersService.generateUniqueUsername(params.displayName));

    return this.dataSource.transaction(async (manager) => {
      const user = manager.create(UserEntity, {
        id: uuidv4(),
        phone: params.phone ?? null,
        phoneNormalized: params.phone ? normalizePhone(params.phone) : null,
        email: params.email ?? null,
        passwordHash: params.passwordHash ?? null,
        primaryProvider: params.primaryProvider,
        status: 'active',
        isVerified: params.isVerified,
        isBot: false,
        gender: 'unspecified',
        presence: 'offline',
      });
      await manager.save(user);

      const profile = manager.create(ProfileEntity, {
        userId: user.id,
        user,
        username,
        displayName: params.displayName,
        avatarUrl: null,
        country: null,
        bio: null,
        level: 1,
        xp: 0,
        coins: 500,
        pips: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamesDrawn: 0,
        streakDays: 0,
        settings: { notifications: true, sound: true, music: true },
      });
      await manager.save(profile);

      user.profile = profile;
      return user;
    });
  }

  private async toDto(userId: string): Promise<{ user: UserDto }> {
    const user = await this.usersService.findById(userId);
    return { user: toUserDto(user) };
  }
}
