import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { AppConfig } from '../config/configuration';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

interface JoinRoomPayload {
  room: string;
}

interface ChatMessagePayload {
  room: string;
  body: string;
}

/**
 * Socket.io gateway. Clients authenticate on the handshake with a valid
 * access token (`?token=` or `Authorization: Bearer`). Authenticated sockets
 * join a per-user room for targeted push events and may join feature rooms
 * (game tables, group chats) in later phases.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/',
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  afterInit(): void {
    this.logger.log('Realtime gateway initialised.');
  }

  handleConnection(client: AuthenticatedSocket): void {
    const token = this.extractToken(client);
    if (!token) {
      client.emit('unauthorized', { message: 'Missing access token.' });
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
        issuer: this.configService.get('jwt.issuer', { infer: true }),
      });
      client.userId = payload.sub as string;
      void client.join(`user:${client.userId}`);
      client.emit('authenticated', { userId: client.userId });
      this.logger.log(`Socket connected: user=${client.userId}`);
    } catch {
      client.emit('unauthorized', { message: 'Invalid or expired access token.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    if (client.userId) {
      this.logger.log(`Socket disconnected: user=${client.userId}`);
    }
  }

  @SubscribeMessage('room:join')
  handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinRoomPayload,
  ): { joined: string } {
    void client.join(`room:${payload.room}`);
    return { joined: payload.room };
  }

  @SubscribeMessage('room:leave')
  handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinRoomPayload,
  ): { left: string } {
    void client.leave(`room:${payload.room}`);
    return { left: payload.room };
  }

  @SubscribeMessage('chat:message')
  handleChatMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatMessagePayload,
  ): { delivered: boolean } {
    if (!client.userId) {
      return { delivered: false };
    }
    // Broadcast to everyone else in the feature room; persistence lands in
    // the messaging phase.
    client.to(`room:${payload.room}`).emit('chat:message', {
      senderId: client.userId,
      body: payload.body,
      at: new Date().toISOString(),
    });
    return { delivered: true };
  }

  /** Push an event to a specific user's connected devices. */
  emitToUser(userId: string, event: string, data: unknown): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  private extractToken(client: Socket): string | null {
    const handshakeToken = client.handshake.auth?.token ?? client.handshake.query?.token;
    if (typeof handshakeToken === 'string' && handshakeToken.length > 0) {
      return handshakeToken;
    }
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    return null;
  }
}
