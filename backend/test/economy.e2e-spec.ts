import './test-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Phase 2 end-to-end tests: safe economy, daily rewards, quests, shop,
 * inventory, equipping and gifting. Runs against in-memory SQLite.
 */
describe('VibeTable economy (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  // Catalogue item ids (see src/shop/shop-catalogue.ts).
  const CYAN_RING_FRAME = '33333333-0000-4000-8100-000000000002'; // 800, 10% -> 720
  const GLASS_BUBBLE = '33333333-0000-4000-8300-000000000001'; // 900
  const STARTER_BUBBLE = '33333333-0000-4000-8300-000000000003'; // 300, giftable
  const USERNAME_CHANGE = '33333333-0000-4000-8700-000000000001'; // 500, not giftable

  async function signUp(phone: string, displayName = 'Player') {
    const otp = await request(httpServer).post('/api/auth/phone/request-otp').send({ phone });
    const verify = await request(httpServer)
      .post('/api/auth/phone/verify')
      .send({ phone, code: otp.body.data.devCode, displayName });
    return {
      token: verify.body.data.tokens.accessToken as string,
      username: verify.body.data.user.username as string,
    };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Claims daily reward + the auto-completed login quest (+200 coins). */
  async function fundGiver(token: string): Promise<void> {
    await request(httpServer).post('/api/quests/daily/claim').set(auth(token)).expect(200);
    const panel = await request(httpServer).get('/api/quests/daily').set(auth(token)).expect(200);
    const loginQuest = panel.body.data.quests.find((q: { goalType: string }) => q.goalType === 'login');
    await request(httpServer).post(`/api/quests/${loginQuest.id}/claim`).set(auth(token)).expect(200);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: 0 }] });
    await app.init();
    httpServer = app.getHttpServer();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(() => app.close());

  describe('daily rewards + quests', () => {
    it('returns the daily panel with reward state and quests', async () => {
      const { token } = await signUp('+14155550001', 'Daily Dan');
      const res = await request(httpServer).get('/api/quests/daily').set(auth(token)).expect(200);
      expect(res.body.data.daily.claimedToday).toBe(false);
      expect(res.body.data.daily.rewardCoins).toBeGreaterThan(0);
      expect(Array.isArray(res.body.data.quests)).toBe(true);
      expect(res.body.data.quests.length).toBeGreaterThanOrEqual(4);
    });

    it('claims the free daily reward exactly once (double-claim rejected)', async () => {
      const { token } = await signUp('+14155550002', 'Reward Rita');
      const claim = await request(httpServer).post('/api/quests/daily/claim').set(auth(token)).expect(200);
      expect(claim.body.data.coinsAwarded).toBe(100); // day 1
      expect(claim.body.data.balance.coins).toBe(600); // 500 start + 100
      expect(claim.body.data.newStreakDay).toBe(1);

      const second = await request(httpServer).post('/api/quests/daily/claim').set(auth(token)).expect(409);
      expect(second.body.message).toContain('already claimed');
    });

    it('auto-completes the login quest and credits coins when claimed', async () => {
      const { token } = await signUp('+14155550003', 'Login Lou');
      await request(httpServer).post('/api/quests/daily/claim').set(auth(token)).expect(200);

      const panel = await request(httpServer).get('/api/quests/daily').set(auth(token)).expect(200);
      const loginQuest = panel.body.data.quests.find((q: { goalType: string }) => q.goalType === 'login') as {
        id: string;
        status: string;
      };
      expect(loginQuest.status).toBe('claimable');

      const claim = await request(httpServer).post(`/api/quests/${loginQuest.id}/claim`).set(auth(token)).expect(200);
      expect(claim.body.data.coinsAwarded).toBe(100);

      await request(httpServer).post(`/api/quests/${loginQuest.id}/claim`).set(auth(token)).expect(409);
    });

    it('rejects claiming an incomplete quest', async () => {
      const { token } = await signUp('+14155550004', 'Slow Sam');
      const panel = await request(httpServer).get('/api/quests/daily').set(auth(token)).expect(200);
      const winQuest = panel.body.data.quests.find((q: { goalType: string }) => q.goalType === 'win_match') as {
        id: string;
      };
      await request(httpServer).post(`/api/quests/${winQuest.id}/claim`).set(auth(token)).expect(400);
    });
  });

  describe('shop + economy safety', () => {
    it('lists the catalogue with effective (discounted) prices', async () => {
      const { token } = await signUp('+14155550005', 'Shopper Sam');
      const res = await request(httpServer).get('/api/shop/items').set(auth(token)).expect(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(8);
      const frame = res.body.data.items.find((i: { name: string }) => i.name === 'Cyan Ring Frame');
      expect(frame.price).toBe(800);
      expect(frame.discountPercent).toBe(10);
      expect(frame.effectivePrice).toBe(720);
    });

    it('filters by category', async () => {
      const { token } = await signUp('+14155550006', 'Filter Flo');
      const res = await request(httpServer).get('/api/shop/items?type=avatar_frame').set(auth(token)).expect(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
      res.body.data.items.forEach((i: { type: string }) => expect(i.type).toBe('avatar_frame'));
    });

    it('prevents overspending and leaves the balance intact (no double-spend)', async () => {
      const { token } = await signUp('+14155550007', 'Broke Ben');
      // 500 coins; Neon Halo Frame costs 1500.
      const res = await request(httpServer)
        .post('/api/shop/purchase')
        .set(auth(token))
        .send({ itemId: '33333333-0000-4000-8100-000000000001' })
        .expect(400);
      expect(res.body.message).toContain('Not enough coins');

      const me = await request(httpServer).get('/api/users/me').set(auth(token)).expect(200);
      expect(me.body.data.coins).toBe(500);
    });

    it('buys an affordable cosmetic, debits wallet, and adds to inventory', async () => {
      const { token } = await signUp('+14155550008', 'Buyer Bea');
      const purchase = await request(httpServer)
        .post('/api/shop/purchase')
        .set(auth(token))
        .send({ itemId: STARTER_BUBBLE })
        .expect(200);
      expect(purchase.body.data.inventory.itemId).toBe(STARTER_BUBBLE);

      const me = await request(httpServer).get('/api/users/me').set(auth(token)).expect(200);
      expect(me.body.data.coins).toBe(200); // 500 - 300

      const inventory = await request(httpServer).get('/api/shop/inventory').set(auth(token)).expect(200);
      expect(inventory.body.data.items.find((i: { itemId: string }) => i.itemId === STARTER_BUBBLE)).toBeTruthy();
    });

    it('blocks buying the same unique cosmetic twice', async () => {
      const { token } = await signUp('+14155550009', 'Dupe Dana');
      await request(httpServer).post('/api/shop/purchase').set(auth(token)).send({ itemId: STARTER_BUBBLE });
      const dup = await request(httpServer)
        .post('/api/shop/purchase')
        .set(auth(token))
        .send({ itemId: STARTER_BUBBLE })
        .expect(409);
      expect(dup.body.message).toContain('already own');
    });

    it('records a purchase ledger entry in the transaction history', async () => {
      const { token } = await signUp('+14155550010', 'Ledger Len');
      await request(httpServer).post('/api/shop/purchase').set(auth(token)).send({ itemId: STARTER_BUBBLE });
      const tx = await request(httpServer).get('/api/shop/transactions').set(auth(token)).expect(200);
      expect(tx.body.data.total).toBeGreaterThan(0);
      const purchaseTx = tx.body.data.items.find((t: { type: string }) => t.type === 'purchase');
      expect(purchaseTx).toBeTruthy();
      expect(Number(purchaseTx.amount)).toBe(-300);
    });
  });

  describe('equipping cosmetics', () => {
    it('equips and unequips an item and reflects it on the profile', async () => {
      const { token } = await signUp('+14155550011', 'Stylish Stu');
      // Fund to afford the 720 frame: 500 + 100 daily + 100 login quest = 700... frame is
      // 720, so use a 300 item and equip a chat bubble slot instead.
      await fundGiver(token); // balance 700
      await request(httpServer).post('/api/shop/purchase').set(auth(token)).send({ itemId: STARTER_BUBBLE }).expect(200);

      const inventory = await request(httpServer).get('/api/shop/inventory').set(auth(token));
      const owned = inventory.body.data.items.find((i: { itemId: string }) => i.itemId === STARTER_BUBBLE);

      await request(httpServer)
        .post('/api/shop/inventory/equip')
        .set(auth(token))
        .send({ inventoryId: owned.id })
        .expect(200);

      const me = await request(httpServer).get('/api/users/me').set(auth(token)).expect(200);
      expect(me.body.data.chatBubble).toBeTruthy();
      expect(me.body.data.chatBubble.name).toBe('Starter Bubble');

      await request(httpServer).post(`/api/shop/inventory/${owned.id}/unequip`).set(auth(token)).expect(200);
      const me2 = await request(httpServer).get('/api/users/me').set(auth(token)).expect(200);
      expect(me2.body.data.chatBubble).toBeNull();
    });
  });

  describe('gifting', () => {
    it('rejects gifting an item the giver cannot afford', async () => {
      const giver = await signUp('+14155550020', 'Giver Gus');
      const receiver = await signUp('+14155550021', 'Receiver Rae');
      await fundGiver(giver.token); // 700 coins
      // Glass Bubble is 900 → not affordable.
      const res = await request(httpServer)
        .post('/api/shop/gift')
        .set(auth(giver.token))
        .send({ itemId: GLASS_BUBBLE, recipientUsername: receiver.username })
        .expect(400);
      expect(res.body.message).toContain('Not enough coins');

      const receiverMe = await request(httpServer).get('/api/users/me').set(auth(receiver.token)).expect(200);
      expect(receiverMe.body.data.giftsReceived).toBe(0);
    });

    it('rejects unknown recipient, self-gift and non-giftable items', async () => {
      const giver = await signUp('+14155550022', 'Giver Gina');
      const pal = await signUp('+14155550023', 'Pal Pat');

      const unknown = await request(httpServer)
        .post('/api/shop/gift')
        .set(auth(giver.token))
        .send({ itemId: STARTER_BUBBLE, recipientUsername: 'nobody_here_xyz' })
        .expect(404);
      expect(unknown.body.message).toContain('not found');

      const self = await request(httpServer)
        .post('/api/shop/gift')
        .set(auth(giver.token))
        .send({ itemId: STARTER_BUBBLE, recipientUsername: giver.username })
        .expect(400);
      expect(self.body.message).toContain('yourself');

      const notGiftable = await request(httpServer)
        .post('/api/shop/gift')
        .set(auth(giver.token))
        .send({ itemId: USERNAME_CHANGE, recipientUsername: pal.username })
        .expect(400);
      expect(notGiftable.body.message).toContain('cannot be gifted');
    });

    it('successfully gifts an affordable item: debits giver, grants receiver, updates stats', async () => {
      const giver = await signUp('+14155550030', 'Funded Fay');
      const receiver = await signUp('+14155550031', 'Gift Glen');

      // Starter Bubble is 300; giver starts with 500 — affordable immediately.
      const gift = await request(httpServer)
        .post('/api/shop/gift')
        .set(auth(giver.token))
        .send({ itemId: STARTER_BUBBLE, recipientUsername: receiver.username, message: 'Hi!' })
        .expect(200);
      expect(gift.body.data.gifted).toBe(true);

      const giverMe = await request(httpServer).get('/api/users/me').set(auth(giver.token)).expect(200);
      expect(giverMe.body.data.coins).toBe(200); // 500 - 300
      expect(giverMe.body.data.giftsSent).toBe(1);

      const receiverMe = await request(httpServer).get('/api/users/me').set(auth(receiver.token)).expect(200);
      expect(receiverMe.body.data.giftsReceived).toBe(1);

      const inventory = await request(httpServer).get('/api/shop/inventory').set(auth(receiver.token)).expect(200);
      const gifted = inventory.body.data.items.find((i: { itemId: string }) => i.itemId === STARTER_BUBBLE);
      expect(gifted).toBeTruthy();
      expect(gifted.source).toBe('gift');

      // Receiver cannot be gifted the same unique item again.
      const duplicate = await request(httpServer)
        .post('/api/shop/gift')
        .set(auth(giver.token))
        .send({ itemId: STARTER_BUBBLE, recipientUsername: receiver.username })
        .expect(409);
      expect(duplicate.body.message).toContain('already owns');
    });
  });

  describe('username change', () => {
    it('requires a username-change token before renaming', async () => {
      const { token } = await signUp('+14155550040', 'Renamer Ro');
      const denied = await request(httpServer)
        .post('/api/shop/username/change')
        .set(auth(token))
        .send({ username: 'brand_new_me' })
        .expect(403);
      expect(denied.body.message).toContain('Username Change item');
    });
  });
});
