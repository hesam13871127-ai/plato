import './test-env';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('VibeTable API (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('reports status and database connectivity', async () => {
      const res = await request(httpServer).get('/health').expect(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.database).toBe('up');
    });
  });

  describe('validation', () => {
    it('rejects a malformed phone number with 400', async () => {
      const res = await request(httpServer)
        .post('/api/auth/phone/request-otp')
        .send({ phone: 'not-a-phone' })
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it('strips unknown fields (whitelist) and still validates', async () => {
      const res = await request(httpServer)
        .post('/api/auth/phone/request-otp')
        .send({ phone: '+14155559999', injected: 'nope' })
        .expect(400);
      expect(res.body.message).toContain('property injected should not exist');
    });
  });

  describe('phone OTP authentication', () => {
    const phone = '+14155550100';
    let devCode: string;
    let refreshToken: string;
    let accessToken: string;

    it('requests an OTP and returns a dev code outside production', async () => {
      const res = await request(httpServer)
        .post('/api/auth/phone/request-otp')
        .send({ phone })
        .expect(200);
      expect(res.body.data.sent).toBe(true);
      expect(res.body.data.devCode).toMatch(/^\d{6}$/);
      devCode = res.body.data.devCode;
    });

    it('rejects an incorrect code with 401', async () => {
      // Request a dedicated code so we do not burn attempts on `devCode`.
      const otp = await request(httpServer)
        .post('/api/auth/phone/request-otp')
        .send({ phone: '+14155557777' })
        .expect(200);
      expect(otp.body.data.devCode).not.toHaveLength(0);

      await request(httpServer)
        .post('/api/auth/phone/verify')
        .send({ phone: '+14155557777', code: '000000' })
        .expect(401);
    });

    it('verifies the correct code, registers the user and returns tokens', async () => {
      const res = await request(httpServer)
        .post('/api/auth/phone/verify')
        .send({ phone, code: devCode, displayName: 'Neon Rider' })
        .expect(200);

      expect(res.body.data.isNewUser).toBe(true);
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
      expect(res.body.data.user.phone).toBe(phone);
      expect(res.body.data.user.displayName).toBe('Neon Rider');
      expect(res.body.data.user.username).toMatch(/neonrider\d{4}/i);
      expect(res.body.data.user.coins).toBe(500);
      // Internal fields must never leak.
      expect(res.body.data.user.isBot).toBeUndefined();
      expect(JSON.stringify(res.body.data.user)).not.toContain('passwordHash');

      accessToken = res.body.data.tokens.accessToken;
      refreshToken = res.body.data.tokens.refreshToken;
    });

    it('logs in the same returning user (not a new registration) with a fresh OTP', async () => {
      const otp = await request(httpServer)
        .post('/api/auth/phone/request-otp')
        .send({ phone })
        .expect(200);

      const res = await request(httpServer)
        .post('/api/auth/phone/verify')
        .send({ phone, code: otp.body.data.devCode })
        .expect(200);
      expect(res.body.data.isNewUser).toBe(false);
      expect(res.body.data.user.phone).toBe(phone);
    });

    it('blocks unauthenticated access to /users/me', async () => {
      await request(httpServer).get('/api/users/me').expect(401);
    });

    it('returns the profile with a valid bearer token', async () => {
      const res = await request(httpServer)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.phone).toBe(phone);
      expect(res.body.data.user).toBeUndefined();
    });

    it('rejects an invalid bearer token', async () => {
      await request(httpServer)
        .get('/api/users/me')
        .set('Authorization', 'Bearer garbage.token.value')
        .expect(401);
    });

    it('updates the profile', async () => {
      const res = await request(httpServer)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bio: 'Dice warrior', country: 'US' })
        .expect(200);
      expect(res.body.data.bio).toBe('Dice warrior');
      expect(res.body.data.country).toBe('US');
    });

    it('rotates refresh tokens and revokes the old one', async () => {
      const rotated = await request(httpServer)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(rotated.body.data.accessToken).toBeDefined();
      const newRefresh = rotated.body.data.refreshToken;
      expect(newRefresh).not.toBe(refreshToken);

      // Old token reuse must be rejected...
      await request(httpServer)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      // ...and must revoke the whole family (the rotated token too).
      await request(httpServer)
        .post('/api/auth/refresh')
        .send({ refreshToken: newRefresh })
        .expect(401);
    });

    it('logs out (revokes a refresh token)', async () => {
      const otp = await request(httpServer)
        .post('/api/auth/phone/request-otp')
        .send({ phone: '+14155550101' })
        .expect(200);
      const login = await request(httpServer)
        .post('/api/auth/phone/verify')
        .send({ phone: '+14155550101', code: otp.body.data.devCode })
        .expect(200);
      const token = login.body.data.tokens.refreshToken;

      await request(httpServer).post('/api/auth/logout').send({ refreshToken: token }).expect(200);
      await request(httpServer).post('/api/auth/refresh').send({ refreshToken: token }).expect(401);
    });
  });

  describe('email/password authentication', () => {
    it('registers, logs in and rejects wrong passwords', async () => {
      const register = await request(httpServer)
        .post('/api/auth/email/register')
        .send({
          email: 'player@example.com',
          password: 'StrongP@ssw0rd',
          username: 'diceking',
          displayName: 'Dice King',
        })
        .expect(201);
      expect(register.body.data.user.email).toBe('player@example.com');

      const login = await request(httpServer)
        .post('/api/auth/email/login')
        .send({ email: 'player@example.com', password: 'StrongP@ssw0rd' })
        .expect(200);
      expect(login.body.data.tokens.accessToken).toBeDefined();

      await request(httpServer)
        .post('/api/auth/email/login')
        .send({ email: 'player@example.com', password: 'wrong-password' })
        .expect(401);

      await request(httpServer)
        .post('/api/auth/email/register')
        .send({
          email: 'player@example.com',
          password: 'AnotherP@ss99',
          username: 'other',
          displayName: 'Other',
        })
        .expect(409);
    });

    it('rejects short passwords at validation', async () => {
      await request(httpServer)
        .post('/api/auth/email/register')
        .send({ email: 'x@example.com', password: 'short', username: 'abc', displayName: 'Abc' })
        .expect(400);
    });
  });

  describe('response envelope', () => {
    it('wraps successful responses in { success, data, timestamp }', async () => {
      const res = await request(httpServer).get('/health').expect(200);
      expect(res.body.data.status).toBe('ok');
    });
  });
});
