import './test-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { SchemaCheckRepairService } from '../src/database/schema-check-repair.service';
import { UserEntity } from '../src/database/entities/user.entity';

/**
 * CHECK-constraint reconciliation (schema-check-repair.service).
 *
 * The MySQL driver family is where the stale-check bug lived (TypeORM 0.3.x
 * never rewrites existing CHECK constraints there); the pure planning logic
 * is covered by unit tests in src. This suite proves, against the driver
 * that DOES enforce checks (in-memory SQLite), that:
 *
 *  1. the repair service is wired into the boot and is a clean no-op on
 *     sqljs (fresh in-memory database — nothing to heal);
 *  2. the seeded schema actually contains the current
 *     `chk_users_phone_or_identity` expression, and that the invariant
 *     itself works: bot rows without phone/email are accepted, non-bot rows
 *     without both are rejected at the database level.
 */
describe('Schema check repair (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let dataSource: DataSource;
  let userRepo: Repository<UserEntity>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    httpServer = app.getHttpServer();
    await app.init();
    dataSource = app.get(DataSource);
    userRepo = app.get(getRepositoryToken(UserEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  const minimalUser = (over: Partial<UserEntity>) =>
    userRepo.create({
      id: randomUUID(),
      phone: null,
      email: null,
      passwordHash: null,
      primaryProvider: 'email',
      status: 'active',
      isVerified: true,
      isBot: true,
      gender: 'unspecified',
      presence: 'offline',
      ...over,
    } as Partial<UserEntity>);

  it('runs the repair as a clean no-op on the in-memory test driver', async () => {
    const repair = app.get(SchemaCheckRepairService);
    await expect(repair.repairCheckConstraints()).resolves.toBeUndefined();
  });

  it('stores the current chk_users_phone_or_identity expression', async () => {
    const rows = await dataSource.query(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
    );
    const ddl: string = rows[0]?.sql ?? '';
    expect(ddl).toMatch(/chk_users_phone_or_identity/);
    expect(ddl).toMatch(/phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1/i);
  });

  it('accepts a bot row without phone or email (the case the stale check broke)', async () => {
    const bot = minimalUser({ isBot: true });
    await expect(userRepo.save(bot)).resolves.toEqual(
      expect.objectContaining({ isBot: true }),
    );
  });

  it('rejects a non-bot row without phone or email at the DB level', async () => {
    const orphan = minimalUser({ isBot: false });
    await expect(userRepo.save(orphan)).rejects.toBeInstanceOf(QueryFailedError);
    await expect(userRepo.findOneBy({ id: orphan.id })).resolves.toBeNull();
  });
});
