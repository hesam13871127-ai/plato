import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type { AppConfig } from '../config/configuration';
import { RefreshTokenEntity } from '../database/entities/refresh-token.entity';
import { UserEntity } from '../database/entities/user.entity';
import { generateRefreshToken, sha256 } from '../common/utils/crypto.util';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokens: Repository<RefreshTokenEntity>,
  ) {}

  /**
   * Issues a fresh token pair for a user. A new refresh-token family starts
   * here (on login / registration).
   */
  async issueTokens(user: UserEntity, meta: RequestMeta = {}): Promise<TokenPair> {
    const accessToken = await this.signAccessToken(user);
    const rawRefreshToken = generateRefreshToken();
    const familyId = uuidv4();

    const entity = this.refreshTokens.create({
      userId: user.id,
      tokenHash: sha256(rawRefreshToken),
      familyId,
      expiresAt: this.computeExpiry(this.configService.get('jwt.refreshTtl', { infer: true })),
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      rotatedAt: null,
      revokedAt: null,
      reused: false,
    });
    await this.refreshTokens.save(entity);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.ttlToSeconds(this.configService.get('jwt.accessTtl', { infer: true })),
    };
  }

  /**
   * Rotates a refresh token: validates the presented token, marks it rotated,
   * issues a successor in the same family and returns a new pair.
   *
   * Reuse detection: presenting an already-rotated/revoked token means the
   * family may be compromised — every token in the family is revoked.
   */
  async rotateTokens(rawRefreshToken: string, meta: RequestMeta = {}): Promise<TokenPair> {
    const tokenHash = sha256(rawRefreshToken);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });

    if (!stored) {
      throw new UnauthorizedException('Refresh token not recognized.');
    }

    const now = new Date();

    if (stored.revokedAt || stored.rotatedAt || stored.reused || stored.expiresAt < now) {
      // Reuse of a consumed token → compromise assumed → revoke the family.
      this.logger.warn(`Refresh token reuse detected for family ${stored.familyId}; revoking family.`);
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token has been invalidated. Please sign in again.');
    }

    // Rotate: mark the old token consumed and create a successor in-family.
    stored.rotatedAt = now;
    await this.refreshTokens.save(stored);

    const user = await this.refreshTokens.manager.findOne(UserEntity, {
      where: { id: stored.userId },
    });
    if (!user) {
      throw new UnauthorizedException('Account no longer exists.');
    }

    const accessToken = await this.signAccessToken(user);
    const newRawRefreshToken = generateRefreshToken();

    const successor = this.refreshTokens.create({
      userId: user.id,
      tokenHash: sha256(newRawRefreshToken),
      familyId: stored.familyId,
      expiresAt: this.computeExpiry(this.configService.get('jwt.refreshTtl', { infer: true })),
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      rotatedAt: null,
      revokedAt: null,
      reused: false,
    });
    await this.refreshTokens.save(successor);

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.ttlToSeconds(this.configService.get('jwt.accessTtl', { infer: true })),
    };
  }

  /** Revokes a single refresh token (logout of one device). */
  async revoke(rawRefreshToken: string): Promise<void> {
    const tokenHash = sha256(rawRefreshToken);
    await this.refreshTokens.update({ tokenHash }, { revokedAt: new Date() });
  }

  /** Revokes every token in a family (used on detected reuse). */
  async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date(), reused: true },
    );
  }

  /** Removes expired tokens; safe to call periodically (housekeeping). */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const result = await this.refreshTokens.delete({
      expiresAt: LessThan(now),
      rotatedAt: Not(IsNull()),
    });
    return result.affected ?? 0;
  }

  private async signAccessToken(user: UserEntity): Promise<string> {
    const jwt = this.configService.get('jwt', { infer: true });
    return this.jwtService.signAsync(
      {
        sub: user.id,
        isBot: user.isBot,
        provider: user.primaryProvider,
      },
      {
        secret: jwt.accessSecret,
        expiresIn: jwt.accessTtl,
        issuer: jwt.issuer,
      },
    );
  }

  private computeExpiry(ttl: string): Date {
    return new Date(Date.now() + this.ttlToSeconds(ttl) * 1000);
  }

  /** Parses Zeit/ms-style TTL strings (`900s`, `30d`, `15m`, `12h`) to seconds. */
  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
    if (!match) {
      return parseInt(ttl, 10) || 900;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * multipliers[unit];
  }
}
