import { Injectable } from '@nestjs/common';
import { ChatGateway } from '../chat/chat.gateway';

/**
 * Thin wrapper over the shared Socket.IO gateway that pushes social events
 * (friend requests/responses, group changes, game invites) to a user's
 * personal room (`user:<id>`), the same room the chat gateway already joins on
 * connection. Keeping emission here avoids coupling Friends/Groups services to
 * the gateway's socket internals.
 */
@Injectable()
export class SocialEventsService {
  constructor(private readonly gateway: ChatGateway) {}

  /** Emit an event to a single user (all of their connected devices). */
  async toUser(userId: string, event: string, payload: unknown): Promise<void> {
    this.gateway.server?.to(`user:${userId}`).emit(event, payload);
  }

  /** Emit an event to several users. */
  async toUsers(userIds: string[], event: string, payload: unknown): Promise<void> {
    for (const id of userIds) {
      this.gateway.server?.to(`user:${id}`).emit(event, payload);
    }
  }
}
