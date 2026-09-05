import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ChatService } from '../chat/chat.service';
import { GroupEntity } from '../database/entities/group.entity';
import { GroupMemberEntity } from '../database/entities/group-member.entity';
import { GroupMemberRole } from '../database/enums';
import { FriendsService, SocialUserDto } from './friends.service';
import { SocialEventsService } from './social-events.service';

const MAX_GROUP_MEMBERS = 100;

export interface GroupMemberDto extends SocialUserDto {
  role: GroupMemberRole;
  joinedAt: Date;
}

export interface GroupDto {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  memberCount: number;
  chatId: string | null;
  role: GroupMemberRole | null;
  members: GroupMemberDto[];
  createdAt: Date;
}

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(GroupEntity)
    private readonly groups: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly members: Repository<GroupMemberEntity>,
    private readonly dataSource: DataSource,
    private readonly friends: FriendsService,
    private readonly chat: ChatService,
    private readonly events: SocialEventsService,
  ) {}

  async create(
    ownerId: string,
    data: { name: string; description?: string; avatarUrl?: string },
  ): Promise<GroupDto> {
    const group = await this.dataSource.transaction(async (manager) => {
      const groupRepo = manager.getRepository(GroupEntity);
      const memberRepo = manager.getRepository(GroupMemberEntity);

      const created = groupRepo.create({
        name: data.name,
        description: data.description ?? null,
        avatarUrl: data.avatarUrl ?? null,
        ownerId,
        memberCount: 1,
      });
      const saved = await groupRepo.save(created);
      await memberRepo.save(
        memberRepo.create({ groupId: saved.id, userId: ownerId, role: 'owner' as GroupMemberRole }),
      );
      return saved;
    });

    // Provision the linked group chat; the owner is the chat owner too.
    const chat = await this.chat.createGroupChat(ownerId, { title: data.name });
    group.chatId = chat.id;
    await this.groups.update(group.id, { chatId: chat.id });

    const dto = await this.getById(ownerId, group.id);
    return dto;
  }

  /** Groups the user belongs to. */
  async listMine(userId: string): Promise<GroupDto[]> {
    const memberships = await this.members.find({ where: { userId }, order: { joinedAt: 'DESC' } });
    const groups = await this.groups.find({
      where: { id: In(memberships.map((m) => m.groupId)) },
    });
    const roleByGroup = new Map(memberships.map((m) => [m.groupId, m.role]));
    const cards = await Promise.all(
      groups.map((g) => this.toDto(g, roleByGroup.get(g.id) ?? null)),
    );
    return cards.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getById(userId: string, groupId: string): Promise<GroupDto> {
    const group = await this.groups.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found.');
    const membership = await this.members.findOne({ where: { groupId, userId } });
    if (!membership) throw new ForbiddenException('You are not a member of this group.');
    return this.toDto(group, membership.role);
  }

  async update(
    userId: string,
    groupId: string,
    data: { name?: string; description?: string; avatarUrl?: string },
  ): Promise<GroupDto> {
    const { membership } = await this.requireManager(groupId, userId);
    const patch: { name?: string; description?: string | null; avatarUrl?: string | null } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.avatarUrl !== undefined) patch.avatarUrl = data.avatarUrl;
    if (Object.keys(patch).length > 0) {
      await this.groups.update(groupId, patch);
      if (data.name && membership.group?.chatId) {
        // Keep the linked chat title in sync.
        try {
          await this.chat.updateChatSettings(userId, membership.group.chatId, { title: data.name });
        } catch {
          // non-fatal if chat rename is restricted
        }
      }
    }
    const group = await this.groups.findOneOrFail({ where: { id: groupId } });
    await this.broadcast(groupId, 'group:updated', { groupId });
    return this.toDto(group, membership.role);
  }

  /** Add friends to the group (and its linked chat). */
  async addMembers(userId: string, groupId: string, userIds: string[]): Promise<GroupDto> {
    const { group, membership } = await this.requireManager(groupId, userId);
    const unique = [...new Set(userIds)];

    await this.dataSource.transaction(async (manager) => {
      const memberRepo = manager.getRepository(GroupMemberEntity);
      const existing = await memberRepo.find({ where: { groupId } });
      const existingIds = new Set(existing.map((m) => m.userId));
      const toAdd = unique.filter((id) => !existingIds.has(id));
      if (existing.length + toAdd.length > MAX_GROUP_MEMBERS) {
        throw new BadRequestException(`A group can hold at most ${MAX_GROUP_MEMBERS} members.`);
      }
      if (toAdd.length === 0) return;
      // Only friends of the acting manager can be added.
      for (const id of toAdd) {
        if (!(await this.friends.areFriends(userId, id))) {
          throw new ForbiddenException('You can only add your friends to a group.');
        }
      }
      await memberRepo.save(
        toAdd.map((id) =>
          memberRepo.create({ groupId, userId: id, role: 'member' as GroupMemberRole }),
        ),
      );
      await manager.getRepository(GroupEntity).update(groupId, {
        memberCount: existing.length + toAdd.length,
      });
      if (group.chatId) {
        await this.chat.addMembers(userId, group.chatId, toAdd);
      }
    });

    await this.events.toUsers(unique, 'group:invited', { groupId, name: group.name, by: userId });
    await this.broadcast(groupId, 'group:members-changed', { groupId });
    return this.getById(userId, groupId);
  }

  /** Self-join is not open; members leave on their own. */
  async leave(userId: string, groupId: string): Promise<{ ok: true }> {
    const membership = await this.members.findOne({ where: { groupId, userId } });
    if (!membership) throw new NotFoundException('You are not in this group.');
    if (membership.role === 'owner') {
      throw new BadRequestException('The owner cannot leave; transfer ownership or disband the group.');
    }
    await this.removeMembership(groupId, userId);
    const group = await this.groups.findOne({ where: { id: groupId } });
    if (group?.chatId) await this.chat.leaveChat(userId, group.chatId);
    await this.broadcast(groupId, 'group:members-changed', { groupId });
    await this.events.toUser(userId, 'group:removed', { groupId });
    return { ok: true };
  }

  /** Owner/admin removes a member. */
  async kick(userId: string, groupId: string, targetId: string): Promise<{ ok: true }> {
    const { membership } = await this.requireManager(groupId, userId);
    const target = await this.members.findOne({ where: { groupId, userId: targetId } });
    if (!target) throw new NotFoundException('That user is not in the group.');
    if (target.role === 'owner') throw new ForbiddenException('You cannot remove the owner.');
    // An admin cannot remove another admin; only the owner can.
    if (target.role === 'admin' && membership.role !== 'owner') {
      throw new ForbiddenException('Only the owner can remove an admin.');
    }
    await this.removeMembership(groupId, targetId);
    const group = await this.groups.findOne({ where: { id: groupId } });
    if (group?.chatId) await this.chat.removeMember(userId, group.chatId, targetId);
    await this.events.toUser(targetId, 'group:removed', { groupId, by: userId });
    await this.broadcast(groupId, 'group:members-changed', { groupId });
    return { ok: true };
  }

  /** Promote/demote (owner only). */
  async setRole(
    userId: string,
    groupId: string,
    targetId: string,
    role: 'admin' | 'member',
  ): Promise<GroupDto> {
    const group = await this.groups.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found.');
    const actor = await this.members.findOne({ where: { groupId, userId } });
    if (!actor || actor.role !== 'owner') {
      throw new ForbiddenException('Only the owner can change roles.');
    }
    const target = await this.members.findOne({ where: { groupId, userId: targetId } });
    if (!target) throw new NotFoundException('That user is not in the group.');
    target.role = role as GroupMemberRole;
    await this.members.save(target);
    if (group.chatId) {
      await this.chat.setMemberRole(userId, group.chatId, targetId, role);
    }
    await this.broadcast(groupId, 'group:members-changed', { groupId });
    return this.getById(userId, groupId);
  }

  /** Owner transfers ownership to another member. */
  async transferOwnership(
    userId: string,
    groupId: string,
    targetId: string,
  ): Promise<GroupDto> {
    const group = await this.groups.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found.');
    if (group.ownerId !== userId) throw new ForbiddenException('Only the owner can transfer ownership.');
    const target = await this.members.findOne({ where: { groupId, userId: targetId } });
    if (!target) throw new NotFoundException('That user is not in the group.');

    await this.dataSource.transaction(async (manager) => {
      const memberRepo = manager.getRepository(GroupMemberEntity);
      await memberRepo.update({ groupId, userId }, { role: 'admin' as GroupMemberRole });
      await memberRepo.update({ groupId, userId: targetId }, { role: 'owner' as GroupMemberRole });
      await manager.getRepository(GroupEntity).update(groupId, { ownerId: targetId });
    });
    if (group.chatId) {
      try {
        await this.chat.transferChatOwnership(userId, group.chatId, targetId);
      } catch {
        // chat ownership sync best-effort
      }
    }
    await this.broadcast(groupId, 'group:members-changed', { groupId });
    return this.getById(targetId, groupId);
  }

  /** Owner disbands the group. */
  async disband(userId: string, groupId: string): Promise<{ ok: true }> {
    const group = await this.groups.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found.');
    if (group.ownerId !== userId) throw new ForbiddenException('Only the owner can disband the group.');

    const memberships = await this.members.find({ where: { groupId } });
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(GroupMemberEntity).delete({ groupId });
      await manager.getRepository(GroupEntity).delete(groupId);
    });
    await this.events.toUsers(
      memberships.map((m) => m.userId),
      'group:disbanded',
      { groupId },
    );
    return { ok: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async removeMembership(groupId: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(GroupMemberEntity).delete({ groupId, userId });
      await manager
        .getRepository(GroupEntity)
        .decrement({ id: groupId }, 'memberCount', 1);
    });
  }

  private async requireManager(
    groupId: string,
    userId: string,
  ): Promise<{ group: GroupEntity; membership: GroupMemberEntity & { group: GroupEntity } }> {
    const group = await this.groups.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found.');
    const membership = await this.members.findOne({ where: { groupId, userId } });
    if (!membership) throw new ForbiddenException('You are not a member of this group.');
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      throw new ForbiddenException('Only group owners or admins can do that.');
    }
    return { group, membership: Object.assign(membership, { group }) };
  }

  private async broadcast(groupId: string, event: string, payload: unknown): Promise<void> {
    // Group events are delivered to members via their personal user rooms.
    const memberships = await this.members.find({ where: { groupId } });
    await this.events.toUsers(
      memberships.map((m) => m.userId),
      event,
      payload,
    );
  }

  private async toDto(group: GroupEntity, viewerRole: GroupMemberRole | null): Promise<GroupDto> {
    const memberships = await this.members.find({
      where: { groupId: group.id },
      order: { joinedAt: 'ASC' },
    });
    const cards = await this.friends.toUserCards(memberships.map((m) => m.userId));
    const cardById = new Map(cards.map((c) => [c.id, c]));
    const members: GroupMemberDto[] = memberships
      .map((m) => {
        const card = cardById.get(m.userId);
        if (!card) return null;
        return { ...card, role: m.role, joinedAt: m.joinedAt };
      })
      .filter((x): x is GroupMemberDto => x !== null);

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      ownerId: group.ownerId,
      memberCount: group.memberCount,
      chatId: group.chatId,
      role: viewerRole,
      members,
      createdAt: group.createdAt,
    };
  }
}
