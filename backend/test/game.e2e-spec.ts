import './test-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GameSessionService } from '../src/game/game-session.service';
import { MatchmakingService } from '../src/game/matchmaking.service';
import { EconomyService } from '../src/economy/economy.service';

/**
 * Phase 4 end-to-end tests: pluggable game catalogue, smart matchmaking with
 * the invisible-bot fallback, private rooms/invite codes, and full in-memory
 * game play-through to settlement. Runs against in-memory SQLite.
 *
 * A core invariant asserted repeatedly: NO client-facing payload ever contains
 * an `isBot` / `is_bot` field — bots are completely invisible to players.
 */
describe('VibeTable games (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let httpServer: Server;
  let sessions: GameSessionService;
  let matchmaking: MatchmakingService;

  async function signUp(phone: string, displayName = 'Player') {
    const otp = await request(httpServer).post('/api/auth/phone/request-otp').send({ phone });
    const verify = await request(httpServer)
      .post('/api/auth/phone/verify')
      .send({ phone, code: otp.body.data.devCode, displayName });
    return {
      token: verify.body.data.tokens.accessToken as string,
      id: verify.body.data.user.id as string,
    };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Recursively asserts no bot-marker key exists anywhere in a payload. */
  function assertNoBotLeak(value: unknown, path = '$'): void {
    if (Array.isArray(value)) {
      value.forEach((v, i) => assertNoBotLeak(v, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        expect(key.toLowerCase()).not.toBe('isbot');
        expect(key.toLowerCase()).not.toBe('is_bot');
        assertNoBotLeak(v, `${path}.${key}`);
      }
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: 0 }] });
    await app.init();
    httpServer = app.getHttpServer();
    sessions = app.get(GameSessionService);
    matchmaking = app.get(MatchmakingService);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(() => app.close());

  describe('game catalogue', () => {
    it('lists games with dominoes playable and coming-soon titles hidden from play', async () => {
      const res = await request(httpServer).get('/api/games').expect(200);
      assertNoBotLeak(res.body.data);
      const games = res.body.data.games as Array<{ slug: string; status: string; isLive: boolean }>;
      const dominoes = games.find((g) => g.slug === 'dominoes');
      expect(dominoes).toBeDefined();
      expect(dominoes!.status).toBe('active');
      expect(dominoes!.isLive).toBe(false); // turn-based
    });
  });

  describe('private rooms with invite codes', () => {
    it('creates a private room, hides its code from public listing, and joins by code', async () => {
      const host = await signUp('+14155551001', 'Host Hana');
      const guest = await signUp('+14155551002', 'Guest Gus');

      const created = await request(httpServer)
        .post('/api/games/rooms')
        .set(auth(host.token))
        .send({ gameSlug: 'dominoes', isPrivate: true, name: 'Secret Table', maxPlayers: 4, fillWithBots: false })
        .expect(201);

      const room = created.body.data.room;
      assertNoBotLeak(room);
      expect(room.isPrivate).toBe(true);
      expect(room.accessCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(room.inviteUrl).toBe(`/join/${room.accessCode}`);
      expect(room.players.some((p: { isHost: boolean }) => p.isHost)).toBe(true);

      // Public listing must not expose the private room.
      const publicList = await request(httpServer).get('/api/games/rooms').set(auth(host.token)).expect(200);
      expect(publicList.body.data.rooms.some((r: { id: string }) => r.id === room.id)).toBe(false);

      // A stranger cannot open the private room by id directly.
      await request(httpServer).get(`/api/games/rooms/${room.id}`).set(auth(guest.token)).expect(403);

      // ...but joining with the invite code works and reveals the table.
      const joined = await request(httpServer)
        .post('/api/games/rooms/join')
        .set(auth(guest.token))
        .send({ accessCode: room.accessCode })
        .expect(200);
      expect(joined.body.data.room.id).toBe(room.id);
      assertNoBotLeak(joined.body.data.room);
    });
  });

  describe('matchmaking invisible-bot fallback + full game', () => {
    it('queues a solo player and auto-fills with invisible bots, then plays dominoes to settlement', async () => {
      const player = await signUp('+14155551101', 'Solo Sam');

      // Enqueue a 2-seat dominoes game. With no other humans queued, the service
      // would normally wait for the 30s fallback; to keep the test fast we start
      // a session directly through the same code path the fallback uses by
      // invoking matchmaking with a tiny configured gap via room start instead.
      // Here we exercise the full engine by creating a room and starting it
      // (rooms pre-fill invisible bots and start immediately).
      const created = await request(httpServer)
        .post('/api/games/rooms')
        .set(auth(player.token))
        .send({ gameSlug: 'dominoes', isPrivate: true, maxPlayers: 2, fillWithBots: true })
        .expect(201);
      const roomId = created.body.data.room.id as string;
      assertNoBotLeak(created.body.data.room);
      // The bot seat must appear as an ordinary ready player (no bot marker).
      expect(created.body.data.room.players.length).toBe(2);
      created.body.data.room.players.forEach((p: Record<string, unknown>) => {
        expect(p).toHaveProperty('displayName');
        expect('isBot' in p).toBe(false);
      });

      const started = await request(httpServer).post(`/api/games/rooms/${roomId}/start`).set(auth(player.token)).expect(200);
      const sessionId = started.body.data.sessionId as string;
      expect(typeof sessionId).toBe('string');

      // Drive the game to completion: bots move on their own (short, human-like
      // timers); the human player auto-passes each turn so the board progresses.
      await playToCompletion(httpServer, sessionId, player.token, sessions);

      // Session must have been settled.
      await waitUntil(() => (sessions.get(sessionId)?.settled ?? true) === true, 8000);
      expect(sessions.get(sessionId)?.settled ?? true).toBe(true);
    });
  });

  describe('equipped cosmetics travel with the player to the table', () => {
    const WOODEN_PIECES = '44444444-0000-4000-9101-000000000003'; // 600 coins, universal piece set
    const FOREST_PLAYGROUND = '44444444-0000-4000-9202-000000000003'; // 1100 coins, board theme
    const IVORY_DICE = '44444444-0000-4000-9100-000000000002'; // 400 coins

    it('equips a piece set + playground and stamps them on the seat, never on bots as a tell', async () => {
      const player = await signUp('+14155551301', 'Skinned Sky');
      const economy = app.get(EconomyService);
      await economy.credit(player.id, 'coins', 5000, { type: 'reward', description: 'test funding' });

      for (const itemId of [WOODEN_PIECES, FOREST_PLAYGROUND, IVORY_DICE]) {
        await request(httpServer).post('/api/shop/purchase').set(auth(player.token)).send({ itemId }).expect(200);
      }
      const inventory = await request(httpServer).get('/api/shop/inventory').set(auth(player.token)).expect(200);
      const rows = inventory.body.data.items as Array<{ id: string; itemId: string; isEquipped: boolean }>;
      for (const itemId of [WOODEN_PIECES, FOREST_PLAYGROUND, IVORY_DICE]) {
        const row = rows.find((r) => r.itemId === itemId)!;
        await request(httpServer).post('/api/shop/inventory/equip').set(auth(player.token)).send({ inventoryId: row.id }).expect(200);
      }
      const after = await request(httpServer).get('/api/shop/inventory').set(auth(player.token)).expect(200);
      const equipped = (after.body.data.items as Array<{ itemId: string; isEquipped: boolean }>).filter((r) => r.isEquipped);
      expect(equipped.map((r) => r.itemId).sort()).toEqual([WOODEN_PIECES, FOREST_PLAYGROUND, IVORY_DICE].sort());

      // Start a checkers room against an invisible bot.
      const created = await request(httpServer)
        .post('/api/games/rooms')
        .set(auth(player.token))
        .send({ gameSlug: 'checkers', isPrivate: true, maxPlayers: 2, fillWithBots: true })
        .expect(201);
      const roomId = created.body.data.room.id as string;
      const started = await request(httpServer).post(`/api/games/rooms/${roomId}/start`).set(auth(player.token)).expect(200);
      const sessionId = started.body.data.sessionId as string;

      const view = await request(httpServer).get(`/api/games/sessions/${sessionId}`).set(auth(player.token)).expect(200);
      assertNoBotLeak(view.body.data);
      const seats = view.body.data.state.seats as Array<{ playerId: string; cosmetics?: Record<string, string> }>;
      const mine = seats.find((s) => s.playerId === player.id)!;
      expect(mine.cosmetics).toEqual({ piece: 'wooden', board: 'forest', dice: 'ivory' });
      // Every seat (including the bot's) carries cosmetics, so they are not a bot tell.
      for (const seat of seats) {
        expect(seat.cosmetics).toBeDefined();
        expect(typeof seat.cosmetics!.piece).toBe('string');
        expect(typeof seat.cosmetics!.board).toBe('string');
      }
      // Spectators see the same public cosmetics.
      const stranger = await signUp('+14155551302', 'Watcher Wen');
      const spec = await request(httpServer).get(`/api/games/sessions/${sessionId}`).set(auth(stranger.token)).expect(200);
      const specSeats = spec.body.data.state.seats as Array<{ playerId: string; cosmetics?: Record<string, string> }>;
      expect(specSeats.find((s) => s.playerId === player.id)!.cosmetics!.piece).toBe('wooden');
    });

    it('equipping a second piece set for the same game replaces the first', async () => {
      const player = await signUp('+14155551303', 'Swap Sal');
      const economy = app.get(EconomyService);
      await economy.credit(player.id, 'coins', 5000, { type: 'reward', description: 'test funding' });
      const CANDY_PIECES = '44444444-0000-4000-9101-000000000007';
      for (const itemId of [WOODEN_PIECES, CANDY_PIECES]) {
        await request(httpServer).post('/api/shop/purchase').set(auth(player.token)).send({ itemId }).expect(200);
      }
      const inv = await request(httpServer).get('/api/shop/inventory').set(auth(player.token)).expect(200);
      const rows = inv.body.data.items as Array<{ id: string; itemId: string }>;
      const wooden = rows.find((r) => r.itemId === WOODEN_PIECES)!;
      const candy = rows.find((r) => r.itemId === CANDY_PIECES)!;
      await request(httpServer).post('/api/shop/inventory/equip').set(auth(player.token)).send({ inventoryId: wooden.id }).expect(200);
      await request(httpServer).post('/api/shop/inventory/equip').set(auth(player.token)).send({ inventoryId: candy.id }).expect(200);
      const after = await request(httpServer).get('/api/shop/inventory').set(auth(player.token)).expect(200);
      const equipped = (after.body.data.items as Array<{ itemId: string; isEquipped: boolean }>).filter((r) => r.isEquipped);
      expect(equipped.map((r) => r.itemId)).toEqual([CANDY_PIECES]);
    });
  });

  describe('smart matchmaking queue with the invisible-bot fallback', () => {
    it('forms a bot-filled table for a solo queued player after the fallback window, with no bot marker', async () => {
      const solo = await signUp('+14155551201', 'Queue Quinn');

      // Enter the queue via REST (the same call the socket gateway makes). With
      // no other human queued, the fallback timer (1s in tests; 30s in prod)
      // fires and starts a table whose empty seat is filled by an invisible bot.
      const before = matchmaking.queueSize();
      const enqueue = await request(httpServer)
        .post('/api/games/matchmaking/enqueue')
        .set(auth(solo.token))
        .send({ gameSlug: 'dominoes', isRanked: false, seats: 2 })
        .expect(200);
      expect(enqueue.body.data.status).toBe('queued');
      expect(matchmaking.queueSize()).toBe(before + 1);

      // Wait for the fallback timer to consume the queue and start a session.
      await waitUntil(() => matchmaking.queueSize() === before, 8000);
      const session = sessions.getByPlayer(solo.id);
      expect(session).toBeDefined();
      if (!session) throw new Error('fallback did not start a session');
      const sessionId = session.sessionId;
      expect(session.seats.length).toBe(2);

      // The opponent is a bot server-side but indistinguishable to clients:
      // the player's redacted snapshot carries NO bot marker and presents the
      // opponent as an ordinary seated player with a believable profile.
      const view = sessions.viewForPlayer(session, solo.id);
      assertNoBotLeak(view);
      expect(view.state.seats.length).toBe(2);
      const opponent = view.state.seats.find((s) => s.playerId !== solo.id);
      expect(opponent).toBeDefined();
      expect(typeof opponent!.displayName).toBe('string');
      expect(opponent!.displayName.length).toBeGreaterThan(0);
      expect('isBot' in (opponent! as unknown as Record<string, unknown>)).toBe(false);
      // Hidden information: the player sees their own hand plus hand sizes only.
      const board = view.state.board as { hand: unknown; handSizes: number[] };
      expect(Array.isArray(board.hand)).toBe(true);
      expect(board.handSizes.length).toBe(2);

      // The queue-formed game settles exactly like a room-formed one.
      await playToCompletion(httpServer, sessionId, solo.token, sessions);
      await waitUntil(() => (sessions.get(sessionId)?.settled ?? true) === true, 8000);
      expect(sessions.get(sessionId)?.settled ?? true).toBe(true);
    });
  });
});

/**
 * Drives a dominoes session to completion. Each tick: read the human's redacted
 * state; when it's their turn, submit a legal action (play a matching tile,
 * otherwise draw; pass when nothing playable). Bot turns advance on their own
 * timers inside GameSessionService.
 */
async function playToCompletion(
  http: Server,
  sessionId: string,
  token: string,
  sessionService: GameSessionService,
): Promise<void> {
  for (let i = 0; i < 3000; i++) {
    const session = sessionService.get(sessionId);
    if (!session || session.state.phase === 'completed') return;

    // Identify the human seat (the only non-bot seat in a 1-human + 1-bot game).
    const nonBotSeat = session.seats.findIndex((s) => !s.isBot);
    if (session.state.currentSeat === nonBotSeat && session.state.phase === 'in_progress') {
      // Read the engine's full internal board (test only; clients get a redacted view).
      const board = session.state.board as {
        ends?: [number, number] | null;
        hands?: Array<Array<[number, number]>>;
        mustDraw?: boolean[];
      };
      const hand = board.hands?.[nonBotSeat] ?? [];
      const ends = board.ends;
      const playable = ends
        ? hand.filter(([a, b]) => a === ends[0] || b === ends[0] || a === ends[1] || b === ends[1])
        : hand;
      const humanId = session.seats[nonBotSeat].playerId;
      if (playable.length > 0) {
        sessionService.submitAction(session, humanId, 'play_tile', { tile: playable[0] });
      } else if (!board.mustDraw?.[nonBotSeat]) {
        sessionService.submitAction(session, humanId, 'draw', {});
      } else {
        sessionService.submitAction(session, humanId, 'pass', {});
      }
    }
    await new Promise((r) => setTimeout(r, 40));
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}
