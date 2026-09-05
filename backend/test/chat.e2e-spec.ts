import './test-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';

/**
 * Phase 3 end-to-end tests: real-time text chat (direct + group + lounge),
 * message features (reply/react/edit/delete/pin/typing), presence, voice
 * token minting and moderation (report/mute/ban). Mixes REST assertions with
 * live Socket.io clients.
 */
describe('VibeTable chat (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let wsUrl: string;

  async function signUp(phone: string, displayName = 'Player') {
    const otp = await request(httpServer)
      .post('/api/auth/phone/request-otp')
      .send({ phone });
    const verify = await request(httpServer)
      .post('/api/auth/phone/verify')
      .send({ phone, code: otp.body.data.devCode, displayName });
    return {
      token: verify.body.data.tokens.accessToken as string,
      userId: verify.body.data.user.id as string,
      username: verify.body.data.user.username as string,
    };
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  function connectSocket(token: string): Socket {
    return io(wsUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
  }

  function waitFor<T = unknown>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  async function ack<T = unknown>(socket: Socket, event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      socket.timeout(3000).emit(event, payload, (err: Error | undefined, response: T) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: 0 }] });
    await app.init();
    // Listen on an ephemeral port so the Socket.io server accepts WS clients.
    await app.listen(0);
    httpServer = app.getHttpServer();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const address = httpServer.address() as AddressInfo;
    wsUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated socket', async () => {
    const socket = io(wsUrl, { auth: { token: 'garbage' }, transports: ['websocket'], forceNew: true });
    const reason = await new Promise<string>((resolve) => {
      socket.on('unauthorized', (p: { message: string }) => resolve(p.message));
      socket.on('connect_error', (e: Error) => resolve(e.message));
      setTimeout(() => resolve('no-event'), 2000);
    });
    socket.close();
    expect(reason).toBeTruthy();
  });

  it('exchanges direct messages in real time with reply + typing + reaction', async () => {
    const alice = await signUp('+15550000001', 'Alice');
    const bob = await signUp('+15550000002', 'Bob');

    const sAlice = connectSocket(alice.token);
    const sBob = connectSocket(bob.token);
    await Promise.all([waitFor(sAlice, 'authenticated'), waitFor(sBob, 'authenticated')]);

    // Open a direct chat (Bob creates it toward Alice).
    const created = await request(httpServer)
      .post('/api/chat/direct')
      .set(bearer(bob.token))
      .send({ userId: alice.userId })
      .expect(201);
    const chatId = created.body.data.chatId as string;

    // Both join the chat room.
    await ack(sAlice, 'chat:join', { chatId });
    await ack(sBob, 'chat:join', { chatId });

    // Bob types; Alice sees the indicator.
    const typingPromise = waitFor<{ userId: string; isTyping: boolean }>(sAlice, 'typing');
    sBob.emit('typing', { chatId, isTyping: true });
    const typing = await typingPromise;
    expect(typing.userId).toBe(bob.userId);
    expect(typing.isTyping).toBe(true);

    // Alice sends a message; Bob receives it.
    const incoming = waitFor<{ body: string; senderId: string; author: { displayName: string } | null }>(sBob, 'chat:message');
    const sendAck = await ack<{ ok: boolean; id?: string }>(sAlice, 'chat:message:send', {
      chatId,
      body: 'Hello Bob!',
    });
    expect(sendAck.ok).toBe(true);
    const first = await incoming;
    expect(first.body).toBe('Hello Bob!');
    expect(first.senderId).toBe(alice.userId);
    expect(first.author).toBeTruthy();
    expect(first.author!.displayName).toBe('Alice');

    // Bob replies to Alice's message; Alice receives with a reply preview.
    const replyIncoming = waitFor<{ body: string; replyToId: string }>(sAlice, 'chat:message');
    await ack(sBob, 'chat:message:send', {
      chatId,
      body: 'Hey Alice!',
      replyToId: sendAck.id,
    });
    const reply = await replyIncoming;
    expect(reply.body).toBe('Hey Alice!');
    expect(reply.replyToId).toBe(sendAck.id);

    // Alice reacts to Bob's message; Bob receives the reaction update live.
    const reactionEvent = waitFor<{ messageId: string; groups: Array<{ emoji: string; count: number }> }>(
      sBob,
      'message:reaction:update',
    );
    const history = await request(httpServer)
      .get(`/api/chat/${chatId}/messages`)
      .set(bearer(alice.token))
      .expect(200);
    const bobMessage = history.body.data.items.find(
      (m: { senderId: string }) => m.senderId === bob.userId,
    );
    await ack(sAlice, 'message:reaction', { messageId: bobMessage.id, emoji: '❤️' });
    const reaction = await reactionEvent;
    expect(reaction.messageId).toBe(bobMessage.id);
    expect(reaction.groups.some((g) => g.emoji === '❤️' && g.count === 1)).toBe(true);

    // History persists and contains both messages.
    const refreshed = await request(httpServer)
      .get(`/api/chat/${chatId}/messages`)
      .set(bearer(bob.token))
      .expect(200);
    const bodies = refreshed.body.data.items.map((m: { body: string }) => m.body);
    expect(bodies).toContain('Hello Bob!');
    expect(bodies).toContain('Hey Alice!');

    sAlice.close();
    sBob.close();
  });

  it('supports group chat: pass gate, membership cap logic, pin and edit/delete', async () => {
    const owner = await signUp('+15550000003', 'Owner Olga');
    const member = await signUp('+15550000004', 'Member Max');
    const outsider = await signUp('+15550000005', 'Outsider Uma');

    const sOwner = connectSocket(owner.token);
    const sMember = connectSocket(member.token);
    await Promise.all([waitFor(sOwner, 'authenticated'), waitFor(sMember, 'authenticated')]);

    // Create a pass-gated group.
    const group = await request(httpServer)
      .post('/api/chat/group')
      .set(bearer(owner.token))
      .send({ title: 'Secret Club', memberIds: [member.userId], accessPass: 'opensesame' })
      .expect(201);
    const chatId = group.body.data.chatId as string;

    await ack(sOwner, 'chat:join', { chatId });
    await ack(sMember, 'chat:join', { chatId });

    // Outsider cannot join without the pass.
    const denied = await request(httpServer)
      .post(`/api/chat/${chatId}/join`)
      .set(bearer(outsider.token))
      .send({})
      .expect(403);
    expect(denied.body.message).toContain('Pass');

    // Outsider joins with the correct pass.
    await request(httpServer)
      .post(`/api/chat/${chatId}/join`)
      .set(bearer(outsider.token))
      .send({ accessPass: 'opensesame' })
      .expect(201);

    // Member cannot pin (only owner/admin).
    const sent = await ack<{ ok: boolean; id?: string; error?: string }>(sMember, 'chat:message:send', {
      chatId,
      body: 'Pin me please',
    });
    const pinDenied = await ack<{ ok: boolean; error?: string }>(sMember, 'message:pin', {
      messageId: sent.id,
      pinned: true,
    });
    expect(pinDenied.ok).toBe(false);

    // Owner pins the message.
    const pinned = waitFor<{ pinned: boolean }>(sMember, 'message:pinned');
    await ack(sOwner, 'message:pin', { messageId: sent.id, pinned: true });
    expect((await pinned).pinned).toBe(true);

    const pinnedRes = await request(httpServer)
      .get(`/api/chat/${chatId}/pinned`)
      .set(bearer(member.token))
      .expect(200);
    expect(pinnedRes.body.data.message.body).toBe('Pin me please');

    // Owner edits a message; member receives the edit event.
    const ownerMsg = await ack<{ ok: boolean; id?: string }>(sOwner, 'chat:message:send', {
      chatId,
      body: 'Typo',
    });
    const editEvent = waitFor<{ body: string }>(sMember, 'message:edited');
    await ack(sOwner, 'message:edit', { messageId: ownerMsg.id, body: 'Typo fixed' });
    expect((await editEvent).body).toBe('Typo fixed');

    // Member deletes their own message.
    const deleteEvent = waitFor<{ id: string }>(sOwner, 'message:deleted');
    await ack(sMember, 'message:delete', { messageId: sent.id });
    const deleted = await deleteEvent;
    expect(deleted.id).toBe(sent.id);

    // Member list includes 3 people.
    const members = await request(httpServer)
      .get(`/api/chat/${chatId}/members`)
      .set(bearer(owner.token))
      .expect(200);
    expect(members.body.data.members.length).toBe(3);

    sOwner.close();
    sMember.close();
  });

  it('joins the public Lounge and lists conversations with unread counts', async () => {
    const user = await signUp('+15550000006', 'Lounge Larry');
    const lounge = await request(httpServer)
      .get('/api/chat/lounge')
      .set(bearer(user.token))
      .expect(200);
    expect(lounge.body.data.type).toBe('lounge');
    expect(lounge.body.data.chatId).toBeTruthy();

    const convos = await request(httpServer)
      .get('/api/chat/conversations')
      .set(bearer(user.token))
      .expect(200);
    expect(Array.isArray(convos.body.data.items)).toBe(true);
    expect(convos.body.data.items.some((c: { type: string }) => c.type === 'lounge')).toBe(true);
  });

  it('moderation: muted member cannot post; chat ban blocks sending; report is filed', async () => {
    const admin = await signUp('+15550000007', 'Admin Ada');
    const target = await signUp('+15550000008', 'Noisy Ned');

    const group = await request(httpServer)
      .post('/api/chat/group')
      .set(bearer(admin.token))
      .send({ title: 'Modded', memberIds: [target.userId] })
      .expect(201);
    const chatId = group.body.data.chatId as string;

    // Mute the target within the chat.
    await request(httpServer)
      .post('/api/chat/moderation/mute')
      .set(bearer(admin.token))
      .send({ chatId, userId: target.userId })
      .expect(201);

    const sTarget = connectSocket(target.token);
    await waitFor(sTarget, 'authenticated');
    await ack(sTarget, 'chat:join', { chatId });

    const mutedSend = await ack<{ ok: boolean; error?: string }>(sTarget, 'chat:message:send', {
      chatId,
      body: 'can you hear me',
    });
    expect(mutedSend.ok).toBe(false);
    expect(mutedSend.error).toContain('muted');
    sTarget.close();

    // File a report against the target's user.
    const report = await request(httpServer)
      .post('/api/chat/report/user')
      .set(bearer(admin.token))
      .send({ userId: target.userId, reason: 'spam', details: 'Repeated links' })
      .expect(201);
    expect(report.body.data.filed).toBe(true);

    // Chat ban (global) blocks the target from sending anywhere.
    await request(httpServer)
      .post('/api/chat/moderation/ban')
      .set(bearer(admin.token))
      .send({ chatId, userId: target.userId, reason: 'spam', durationMinutes: 60 })
      .expect(201);

    const direct = await request(httpServer)
      .post('/api/chat/direct')
      .set(bearer(target.token))
      .send({ userId: admin.userId })
      .expect(201);
    const bannedRes = await request(httpServer)
      .post(`/api/chat/${direct.body.data.chatId}/messages`)
      .set(bearer(target.token))
      .send({ body: 'trying to speak' })
      .expect(403);
    expect(bannedRes.body.message).toContain('muted');
  });

  it('mints a voice token and tracks the voice roster', async () => {
    const host = await signUp('+15550000009', 'Voice Val');
    const group = await request(httpServer)
      .post('/api/chat/group')
      .set(bearer(host.token))
      .send({ title: 'Voice crew' })
      .expect(201);
    const chatId = group.body.data.chatId as string;

    const tokenRes = await request(httpServer)
      .post('/api/chat/voice/token')
      .set(bearer(host.token))
      .send({ chatId })
      .expect(201);
    expect(tokenRes.body.data.token).toBeTruthy();
    expect(tokenRes.body.data.roomName).toBe(`voice:${chatId}`);
    expect(['livekit', 'dev']).toContain(tokenRes.body.data.provider);

    const socket = connectSocket(host.token);
    await waitFor(socket, 'authenticated');
    await ack(socket, 'chat:join', { chatId });

    const rosterEvent = waitFor<{ participants: Array<{ userId: string }> }>(socket, 'voice:roster');
    await ack(socket, 'voice:join', { chatId });
    const roster = await rosterEvent;
    expect(roster.participants.some((p) => p.userId === host.userId)).toBe(true);

    const participants = await request(httpServer)
      .get(`/api/chat/${chatId}/voice/participants`)
      .set(bearer(host.token))
      .expect(200);
    expect(participants.body.data.participants.length).toBe(1);

    socket.close();
  });

  it('broadcasts presence when users connect', async () => {
    const watcher = await signUp('+15550000010', 'Watcher Wynn');
    const sWatcher = connectSocket(watcher.token);
    await waitFor(sWatcher, 'authenticated');

    const newcomer = await signUp('+15550000011', 'Newbie Nell');
    const presencePromise = waitFor<{ userId: string; presence: string }>(sWatcher, 'presence:update');
    const sNewcomer = connectSocket(newcomer.token);
    await waitFor(sNewcomer, 'authenticated');
    const event = await presencePromise;
    expect(event.userId).toBe(newcomer.userId);
    expect(event.presence).toBe('online');

    sWatcher.close();
    sNewcomer.close();
  });
});
