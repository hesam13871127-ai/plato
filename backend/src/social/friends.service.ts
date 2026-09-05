import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { FriendshipEntity } from '../database/entities/friendship.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import { FriendshipStatus } from '../database/enums';
import { PresenceService } from '../chat/presence.service';
import { SocialEventsService } from './social-events.service';

/** Compact user card shared across social DTOs. */
export interface SocialUserDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  presence: string;
  online: boolean;
}

export interface FriendRequestDto {
  id: string;
  status: FriendshipStatus;
  createdAt: Date;
  user: SocialUserDto;
}

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(FriendshipEntity)
    private readonly friendships: Repository<FriendshipEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly dataSource: DataSource,
    private readonly presence: PresenceService,
    private readonly events: SocialEventsService,
  ) {}

  // ── Queries ──────────────────────────────────────────────────────────────

  /** Accepted friends, enriched with live presence. */
  async listFriends(userId: string): Promise<SocialUserDto[]> {
    const rows = await this.friendships.find({
      where: [
        { requesterId: userId, status: 'accepted' },
        { addresseeId: userId, status: 'accepted' },
      ],
    });
    const ids = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
    return this.toUserCards(ids);
  }

  /** Incoming pending requests (other people asking to be this user's friend). */
  async listIncomingRequests(userId: string): Promise<FriendRequestDto[]> {
    const rows = await this.friendships.find({
      where: { addresseeId: userId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    const cards = await this.toUserCards(rows.map((r) => r.requesterId));
    const cardById = new Map(cards.map((c) => [c.id, c]));
    return rows
      .map((r) => {
        const card = cardById.get(r.requesterId);
        if (!card) return null;
        return { id: r.id, status: r.status, createdAt: r.createdAt, user: card };
      })
      .filter((x): x is FriendRequestDto => x !== null);
  }

  /** Outgoing pending requests (this user waiting on others). */
  async listOutgoingRequests(userId: string): Promise<FriendRequestDto[]> {
    const rows = await this.friendships.find({
      where: { requesterId: userId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    const cards = await this.toUserCards(rows.map((r) => r.addresseeId));
    const cardById = new Map(cards.map((c) => [c.id, c]));
    return rows
      .map((r) => {
        const card = cardById.get(r.addresseeId);
        if (!card) return null;
        return { id: r.id, status: r.status, createdAt: r.createdAt, user: card };
      })
      .filter((x): x is FriendRequestDto => x !== null);
  }

  /** Users this user has blocked. */
  async listBlocked(userId: string): Promise<SocialUserDto[]> {
    const rows = await this.friendships.find({
      where: { requesterId: userId, status: 'blocked' },
    });
    return this.toUserCards(rows.map((r) => r.addresseeId));
  }

  /** Online subset of the user's accepted friends (for the friends tray). */
  async listOnlineFriends(userId: string): Promise<SocialUserDto[]> {
    const friends = await this.listFriends(userId);
    return friends.filter((f) => f.online);
  }

  /**
   * Relationship of the acting user to a set of target users, used by the
   * client to render the right action button (add / accept / friends / blocked).
   */
  async relationships(
    userId: string,
    targetIds: string[],
  ): Promise<Record<string, 'none' | 'friends' | 'incoming' | 'outgoing' | 'blocked'>> {
    if (targetIds.length === 0) return {};
    const rows = await this.friendships.find({
      where: [
        { requesterId: userId, addresseeId: In(targetIds) },
        { requesterId: In(targetIds), addresseeId: userId },
      ],
    });
    const result: Record<string, 'none' | 'friends' | 'incoming' | 'outgoing' | 'blocked'> = {};
    for (const id of targetIds) result[id] = 'none';
    for (const r of rows) {
      const other = r.requesterId === userId ? r.addresseeId : r.requesterId;
      // A block set by either side is surfaced as 'blocked' for safety.
      if (r.status === 'blocked') {
        result[other] = 'blocked';
      } else if (result[other] !== 'blocked') {
        if (r.status === 'accepted') {
          result[other] = 'friends';
        } else {
          // pending: incoming if the other user sent it, outgoing if we did.
          result[other] = r.addresseeId === userId ? 'incoming' : 'outgoing';
        }
      }
    }
    return result;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async sendRequest(userId: string, target: { username?: string; userId?: string }) {
    const targetId = await this.resolveTarget(target);
    if (!targetId) throw new BadRequestException('Provide a username or userId.');
    if (targetId === userId) throw new BadRequestException('You cannot add yourself.');

    const existing = await this.findEdgeEitherWay(userId, targetId);
    if (existing) {
      if (existing.status === 'accepted') {
        throw new ConflictException('You are already friends.');
      }
      if (existing.status === 'blocked') {
        throw new ForbiddenException('This action is not allowed.');
      }
      // If the other user already sent a pending request, accepting it is the
      // natural flow — but here we surface a clear conflict.
      throw new ConflictException('A friend request already exists.');
    }

    const edge = this.friendships.create({
      requesterId: userId,
      addresseeId: targetId,
      status: 'pending' as FriendshipStatus,
    });
    const saved = await this.friendships.save(edge);
    const [card] = await this.toUserCards([userId]);
    await this.events.toUser(targetId, 'friend:request', {
      requestId: saved.id,
      from: card,
    });
    return { requestId: saved.id };
  }

  async acceptRequest(userId: string, requestId: string): Promise<{ ok: true }> {
    const edge = await this.friendships.findOne({ where: { id: requestId } });
    if (!edge) throw new NotFoundException('Friend request not found.');
    if (edge.addresseeId !== userId) {
      throw new ForbiddenException('You cannot respond to this request.');
    }
    if (edge.status !== 'pending') {
      throw new ConflictException('This request is no longer pending.');
    }

    edge.status = 'accepted' as FriendshipStatus;
    edge.acceptedAt = new Date();
    await this.friendships.save(edge);

    const [me, them] = await this.toUserCards([userId, edge.requesterId]);
    await this.events.toUser(edge.requesterId, 'friend:accepted', { friend: me });
    await this.events.toUser(userId, 'friend:accepted', { friend: them });
    return { ok: true };
  }

  async rejectRequest(userId: string, requestId: string): Promise<{ ok: true }> {
    const edge = await this.friendships.findOne({ where: { id: requestId } });
    if (!edge) throw new NotFoundException('Friend request not found.');
    if (edge.addresseeId !== userId) {
      throw new ForbiddenException('You cannot respond to this request.');
    }
    await this.friendships.remove(edge);
    await this.events.toUser(edge.requesterId, 'friend:rejected', { by: userId });
    return { ok: true };
  }

  /** Cancel a request the acting user sent. */
  async cancelRequest(userId: string, requestId: string): Promise<{ ok: true }> {
    const edge = await this.friendships.findOne({ where: { id: requestId } });
    if (!edge) throw new NotFoundException('Friend request not found.');
    if (edge.requesterId !== userId) {
      throw new ForbiddenException('You cannot cancel this request.');
    }
    await this.friendships.remove(edge);
    await this.events.toUser(edge.addresseeId, 'friend:canceled', { by: userId });
    return { ok: true };
  }

  async removeFriend(userId: string, friendId: string): Promise<{ ok: true }> {
    const edge = await this.findEdgeEitherWay(userId, friendId);
    if (!edge || edge.status !== 'accepted') {
      throw new NotFoundException('You are not friends with that user.');
    }
    await this.friendships.remove(edge);
    await this.events.toUser(friendId, 'friend:removed', { by: userId });
    return { ok: true };
  }

  /**
   * Blocks a user. We normalise to a single row where `requesterId` is the
   * blocker and `addresseeId` is the blocked user, deleting any reverse edge so
   * the friendship is fully severed.
   */
  async block(userId: string, target: { username?: string; userId?: string }): Promise<{ ok: true }> {
    const targetId = await this.resolveTarget(target);
    if (!targetId) throw new BadRequestException('Provide a username or userId.');
    if (targetId === userId) throw new BadRequestException('You cannot block yourself.');

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(FriendshipEntity);
      // Remove every edge between the two users.
      const edges = await repo.find({
        where: [
          { requesterId: userId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: userId },
        ],
      });
      if (edges.length > 0) await repo.remove(edges);
      await repo.save(
        repo.create({
          requesterId: userId,
          addresseeId: targetId,
          status: 'blocked' as FriendshipStatus,
        }),
      );
    });

    await this.events.toUser(targetId, 'friend:removed', { by: userId });
    return { ok: true };
  }

  async unblock(userId: string, targetId: string): Promise<{ ok: true }> {
    const edge = await this.friendships.findOne({
      where: { requesterId: userId, addresseeId: targetId, status: 'blocked' },
    });
    if (!edge) throw new NotFoundException('No block found for that user.');
    await this.friendships.remove(edge);
    return { ok: true };
  }

  // ── Guards used by other modules ──────────────────────────────────────────

  /** True when the two users are mutual (accepted) friends. */
  async areFriends(a: string, b: string): Promise<boolean> {
    const edge = await this.findEdgeEitherWay(a, b);
    return !!edge && edge.status === 'accepted';
  }

  /** True if either user has blocked the other (no interaction allowed). */
  async hasBlock(a: string, b: string): Promise<boolean> {
    const rows = await this.friendships.find({
      where: [
        { requesterId: a, addresseeId: b, status: 'blocked' },
        { requesterId: b, addresseeId: a, status: 'blocked' },
      ],
    });
    return rows.length > 0;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async resolveTarget(target: { username?: string; userId?: string }): Promise<string | null> {
    if (target.userId) {
      const user = await this.users.findOne({ where: { id: target.userId }, select: ['id'] });
      return user?.id ?? null;
    }
    if (target.username) {
      const profile = await this.profiles.findOne({ where: { username: target.username } });
      return profile?.userId ?? null;
    }
    return null;
  }

  private async findEdgeEitherWay(
    a: string,
    b: string,
  ): Promise<FriendshipEntity | null> {
    const rows = await this.friendships.find({
      where: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    });
    return rows[0] ?? null;
  }

  /** Builds presence-enriched user cards for a list of user ids. */
  async toUserCards(ids: string[]): Promise<SocialUserDto[]> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return [];
    const users = await this.users.find({ where: { id: In(unique) } });
    const profiles = await this.profiles.find({ where: { userId: In(unique) } });
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const snapshot = this.presence.snapshotFor(unique);

    return users.map((u) => {
      const p = profileByUser.get(u.id);
      const live = snapshot[u.id];
      const online = live?.online ?? false;
      return {
        id: u.id,
        username: p?.username ?? '',
        displayName: p?.displayName ?? 'Player',
        avatarUrl: p?.avatarUrl ?? null,
        level: Number(p?.level ?? 1),
        presence: live?.presence ?? u.presence ?? 'offline',
        online,
      };
    });
  }
}
