import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { UserPresence } from '../database/enums';

/**
 * Tracks live socket connections per user and derives presence. Persists
 * `presence` + `lastSeenAt` to the users table so clients can render online
 * status and "last seen" even for offline users.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  /** userId → set of connected socket ids (a user may have multiple devices). */
  private readonly connections = new Map<string, Set<string>>();

  /** Transient overrides (e.g. in_game) keyed by user id. */
  private readonly overrides = new Map<string, UserPresence>();

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  /** Registers a new socket connection and flips the user to online. */
  async connect(userId: string, socketId: string): Promise<void> {
    let set = this.connections.get(userId);
    const wasOffline = !set || set.size === 0;
    if (!set) {
      set = new Set<string>();
      this.connections.set(userId, set);
    }
    set.add(socketId);

    if (wasOffline) {
      await this.persistPresence(userId, 'online');
    }
  }

  /** Removes a socket; when the last socket leaves, marks the user offline. */
  async disconnect(userId: string, socketId: string): Promise<void> {
    const set = this.connections.get(userId);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) {
        this.connections.delete(userId);
        this.overrides.delete(userId);
        await this.persistPresence(userId, 'offline');
      }
    }
  }

  isOnline(userId: string): boolean {
    const set = this.connections.get(userId);
    return !!set && set.size > 0;
  }

  /** Returns the online user ids from a set of candidates. */
  filterOnline(userIds: string[]): string[] {
    return userIds.filter((id) => this.isOnline(id));
  }

  /** Sets a presence override (e.g. in_game) while the user remains connected. */
  async setOverride(userId: string, presence: UserPresence): Promise<void> {
    this.overrides.set(userId, presence);
    if (this.isOnline(userId)) {
      await this.persistPresence(userId, presence);
    }
  }

  async clearOverride(userId: string): Promise<void> {
    this.overrides.delete(userId);
    if (this.isOnline(userId)) {
      await this.persistPresence(userId, 'online');
    }
  }

  /** Builds a presence snapshot for a list of users. */
  snapshotFor(userIds: string[]): Record<string, { presence: UserPresence; lastSeenAt: Date | null; online: boolean }> {
    const result: Record<string, { presence: UserPresence; lastSeenAt: Date | null; online: boolean }> = {};
    for (const id of userIds) {
      result[id] = {
        presence: this.overrides.get(id) ?? (this.isOnline(id) ? 'online' : 'offline'),
        lastSeenAt: null,
        online: this.isOnline(id),
      };
    }
    return result;
  }

  private async persistPresence(userId: string, presence: UserPresence): Promise<void> {
    try {
      await this.users.update(
        { id: userId },
        {
          presence,
          lastSeenAt: presence === 'offline' ? new Date() : null,
        },
      );
    } catch (error) {
      this.logger.warn(`Failed to persist presence for ${userId}: ${String(error)}`);
    }
  }
}
