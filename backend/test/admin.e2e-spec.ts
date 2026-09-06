import './test-env';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { UserEntity } from '../src/database/entities/user.entity';

/**
 * Phase 10 — full admin panel API coverage: a non-admin is denied, an admin
 * can manage users, currency, shop items, games and seasons.
 */
describe('VibeTable admin panel (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let userRepo: Repository<UserEntity>;

  async function signUp(phone: string, displayName: string): Promise<{ token: string; userId: string }> {
    const otp = await request(httpServer).post('/api/auth/phone/request-otp').send({ phone });
    const verify = await request(httpServer)
      .post('/api/auth/phone/verify')
      .send({ phone, code: otp.body.data.devCode, displayName });
    return { token: verify.body.data.tokens.accessToken as string, userId: verify.body.data.user.id as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
    await app.init();
    httpServer = app.getHttpServer();
    userRepo = app.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies a regular player access to admin endpoints', async () => {
    const { token } = await signUp('+15559000001', 'Regular');
    const res = await request(httpServer).get('/api/admin/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('serves analytics overview to an admin', async () => {
    const admin = await signUp('+15559000002', 'TheBoss');
    await userRepo.update({ id: admin.userId }, { role: 'admin' });

    const res = await request(httpServer).get('/api/admin/overview').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.users).toBeDefined();
    expect(res.body.data.matches).toBeDefined();
    expect(res.body.data.moderation).toBeDefined();
    expect(res.body.data.matchesByDay).toBeInstanceOf(Array);
  });

  it('lists and searches users', async () => {
    const admin = await signUp('+15559000003', 'AdminList');
    await userRepo.update({ id: admin.userId }, { role: 'admin' });

    const target = await signUp('+15559000004', 'FindMePlz');
    const res = await request(httpServer)
      .get('/api/admin/users')
      .query({ search: 'FindMePlz' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect((res.body.data.items as Array<{ username: string }>).some((u) => u.username.includes('findme'))).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('grants and deducts currency through the ledger', async () => {
    const admin = await signUp('+15559000005', 'AdminWallet');
    await userRepo.update({ id: admin.userId }, { role: 'admin' });
    const target = await signUp('+15559000006', 'WalletTarget');

    const grant = await request(httpServer)
      .post('/api/admin/users/grant-currency')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: target.userId, currency: 'coins', amount: 500, reason: 'test grant' });
    expect(grant.status).toBe(201);
    expect(grant.body.data.balance.coins).toBeGreaterThanOrEqual(500);

    const deduct = await request(httpServer)
      .post('/api/admin/users/grant-currency')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: target.userId, currency: 'coins', amount: -200 });
    expect(deduct.status).toBe(201);
    expect(deduct.body.data.balance.coins).toBeGreaterThanOrEqual(300);
  });

  it('creates, edits and deletes a shop item', async () => {
    const admin = await signUp('+15559000007', 'AdminShop');
    await userRepo.update({ id: admin.userId }, { role: 'admin' });

    const create = await request(httpServer)
      .post('/api/admin/shop/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Admin Test Frame',
        type: 'avatar_frame',
        rarity: 'epic',
        price: 1200,
        currency: 'coins',
        isAvailable: true,
      });
    expect(create.status).toBe(201);
    const itemId = create.body.data.id as string;

    const edit = await request(httpServer)
      .post('/api/admin/shop/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ id: itemId, name: 'Admin Test Frame v2', type: 'avatar_frame', price: 999, isAvailable: false });
    expect(edit.status).toBe(201);
    expect(edit.body.data.name).toBe('Admin Test Frame v2');

    const del = await request(httpServer)
      .delete(`/api/admin/shop/items/${itemId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);
  });

  it('disables and re-enables a game', async () => {
    const admin = await signUp('+15559000008', 'AdminGames');
    await userRepo.update({ id: admin.userId }, { role: 'admin' });

    const disable = await request(httpServer)
      .post('/api/admin/games/status')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: 'trivia', status: 'maintenance' });
    expect(disable.status).toBe(201);
    expect(disable.body.data.status).toBe('maintenance');

    const enable = await request(httpServer)
      .post('/api/admin/games/status')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: 'trivia', status: 'active' });
    expect(enable.status).toBe(201);
    expect(enable.body.data.status).toBe('active');
  });

  it('refuses to activate a game with no engine', async () => {
    const admin = await signUp('+15559000009', 'AdminGames2');
    await userRepo.update({ id: admin.userId }, { role: 'admin' });

    const add = await request(httpServer)
      .post('/api/admin/games')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: 'fictional_game', name: 'Fictional Game', status: 'active' });
    expect(add.status).toBe(201);
    // No engine → forced to coming_soon, not active.
    expect(add.body.data.status).toBe('coming_soon');

    const tryActivate = await request(httpServer)
      .post('/api/admin/games/status')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: 'fictional_game', status: 'active' });
    expect(tryActivate.status).toBe(400);
  });

  it('returns the seasons list including an active season', async () => {
    const admin = await signUp('+15559000010', 'AdminSeason');
    await userRepo.update({ id: admin.userId }, { role: 'admin' });

    const res = await request(httpServer).get('/api/admin/seasons').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ status: string }>).some((s) => s.status === 'active')).toBe(true);
  });
});
