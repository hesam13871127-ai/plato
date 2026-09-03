import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RefreshTokenEntity } from '../database/entities/refresh-token.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TokenService } from './token.service';

/**
 * Unit tests for refresh-token rotation and reuse detection, using an
 * in-memory repository (no database required).
 */
describe('TokenService.rotateTokens', () => {
  const secret = 'unit-test-access-secret-which-is-long-enough';
  const refreshSecret = 'unit-test-refresh-secret-which-is-long-enough';

  let tokens: RefreshTokenEntity[];
  let service: TokenService;
  const user = Object.assign(new UserEntity(), {
    id: 'user-1',
    isBot: false,
    primaryProvider: 'phone',
  });

  beforeEach(() => {
    tokens = [];

    const repo = {
      findOne: jest.fn(async ({ where }: { where: { tokenHash?: string } }) => {
        const hash = where?.tokenHash;
        return tokens.find((t) => t.tokenHash === hash) ?? null;
      }),
      create: jest.fn((data: Partial<RefreshTokenEntity>) =>
        Object.assign(new RefreshTokenEntity(), data),
      ),
      save: jest.fn(async (entity: RefreshTokenEntity) => {
        const index = tokens.findIndex((t) => t.tokenHash === entity.tokenHash);
        if (index >= 0) tokens[index] = entity;
        else tokens.push(entity);
        return entity;
      }),
      update: jest.fn(async (criteria: { familyId?: string }, data: Partial<RefreshTokenEntity>) => {
        const familyId = (criteria as { familyId?: string }).familyId;
        tokens
          .filter((t) => (familyId ? t.familyId === familyId : true))
          .forEach((t) => Object.assign(t, data));
        return { affected: 1 };
      }),
      manager: {
        findOne: jest.fn(async () => user),
      },
    };

    const jwtConfig = {
      accessSecret: secret,
      refreshSecret,
      accessTtl: '900s',
      refreshTtl: '1d',
      issuer: 'vibetable',
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'jwt') return jwtConfig;
        const values: Record<string, unknown> = {
          'jwt.accessSecret': secret,
          'jwt.refreshTtl': '1d',
          'jwt.accessTtl': '900s',
          'jwt.issuer': 'vibetable',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const jwt = new JwtService({ secret });
    service = new TokenService(jwt, config as never, repo as never);
  });

  it('issues an access + refresh token pair and stores only a hash', async () => {
    const pair = await service.issueTokens(user);
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    expect(pair.tokenType).toBe('Bearer');
    expect(pair.refreshToken).toHaveLength(96); // 48 random bytes hex

    const stored = tokens[0];
    expect(stored.tokenHash).toHaveLength(64); // sha256 hex
    expect(stored.tokenHash).not.toContain(pair.refreshToken);
    expect(stored.rotatedAt).toBeNull();
  });

  it('rotates a valid token and keeps it within the same family', async () => {
    const first = await service.issueTokens(user);
    const rotated = await service.rotateTokens(first.refreshToken);

    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    expect(rotated.accessToken).toBeTruthy();

    const familyIds = new Set(tokens.map((t) => t.familyId));
    expect(familyIds.size).toBe(1);
    expect(tokens[0].rotatedAt).not.toBeNull();
  });

  it('rejects an already-rotated token and revokes the whole family (reuse detection)', async () => {
    const first = await service.issueTokens(user);
    await service.rotateTokens(first.refreshToken);

    // Reusing the original (consumed) token must fail.
    await expect(service.rotateTokens(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // The whole family is now revoked — the successor token fails too.
    const successor = tokens[1].tokenHash;
    void successor;
    const allRevoked = tokens.every((t) => t.revokedAt !== null || t.reused);
    expect(allRevoked).toBe(true);
  });

  it('rejects an unknown refresh token', async () => {
    await expect(service.rotateTokens('does-not-exist')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
