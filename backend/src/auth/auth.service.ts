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
  SocialLoginDto,
} from './dto/auth.dto';
import { OtpService } from './otp.service';
import { SocialIdentity, SocialProviderService } from './social/social-provider.service';
import { TokenPair, TokenService } from './token.service';

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
    private readonly socialProviderService: SocialProviderService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService<AppConfig, true>,
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

    this.assertCanAuthenticate(user);
    const tokens = await this.tokenService.issueTokens(user, meta);
    return { user: (await this.toDto(user.id)).user, tokens, isNewUser };
  }

  // ------------------------------------------------------------------
  // Social (Google / Apple)
  // ------------------------------------------------------------------

  async googleLogin(dto: SocialLoginDto, meta: RequestMeta): Promise<AuthResult> {
    const identity = await this.socialProviderService.verifyGoogleIdToken(dto.idToken);
    return this.socialSignIn(identity, dto.displayName, meta);
  }

  async appleLogin(dto: SocialLoginDto, meta: RequestMeta): Promise<AuthResult> {
    const identity = await this.socialProviderService.verifyAppleIdToken(dto.idToken);
    return this.socialSignIn(identity, dto.displayName, meta);
  }

  private async socialSignIn(
    identity: SocialIdentity,
    displayName: string | undefined,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const subjectColumn = identity.provider === 'google' ? 'googleSub' : 'appleSub';

    let user = await this.users.findOne({
      where: { [subjectColumn]: identity.subject },
      relations: { profile: true },
    });

    // Link to an existing same-email account if present.
    if (!user && identity.email) {
      const byEmail = await this.users.findOne({
        where: { email: identity.email.toLowerCase() },
        relations: { profile: true },
      });
      if (byEmail) {
        byEmail[subjectColumn] = identity.subject;
        byEmail.isVerified = true;
        await this.users.save(byEmail);
        user = byEmail;
      }
    }

    let isNewUser = false;
    if (!user) {
      user = await this.createUser({
        email: identity.email ? identity.email.toLowerCase() : null,
        isVerified: true,
        primaryProvider: identity.provider,
        displayName: displayName ?? identity.displayName ?? `${identity.provider} Player`,
        [subjectColumn]: identity.subject,
      });
      isNewUser = true;
    }

    this.assertCanAuthenticate(user);
    const tokens = await this.tokenService.issueTokens(user, meta);
    return { user: (await this.toDto(user.id)).user, tokens, isNewUser };
  }

  // ------------------------------------------------------------------
  // Email / password (supplementary provider used in development/tests)
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

    this.assertCanAuthenticate(user);
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

  private assertCanAuthenticate(user: UserEntity): void {
    if (user.status === 'banned' || user.status === 'deleted') {
      throw new ForbiddenException('This account is not permitted to sign in.');
    }
  }

  private async createUser(params: {
    phone?: string | null;
    email?: string | null;
    passwordHash?: string | null;
    googleSub?: string | null;
    appleSub?: string | null;
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
        googleSub: params.googleSub ?? null,
        appleSub: params.appleSub ?? null,
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
        gems: 0,
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
