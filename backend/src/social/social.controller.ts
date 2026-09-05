import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FriendsService } from './friends.service';
import { GroupsService } from './groups.service';
import { InvitesService } from './invites.service';
import {
  BlockUserDto,
  CreateGroupDto,
  CreateInviteRoomDto,
  GroupMemberRoleDto,
  GroupMembersDto,
  InviteToRoomDto,
  RemoveFriendDto,
  RespondFriendRequestDto,
  SendFriendRequestDto,
  UpdateGroupDto,
} from './dto/social.dto';

@ApiTags('social')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('social')
export class SocialController {
  constructor(
    private readonly friends: FriendsService,
    private readonly groups: GroupsService,
    private readonly invites: InvitesService,
  ) {}

  // ── Friends ────────────────────────────────────────────────────────────

  @Get('friends')
  @ApiOperation({ summary: 'List accepted friends with live presence.' })
  listFriends(@CurrentUser('id') userId: string) {
    return this.friends.listFriends(userId);
  }

  @Get('friends/online')
  @ApiOperation({ summary: 'Online friends only (friends tray / invite lists).' })
  onlineFriends(@CurrentUser('id') userId: string) {
    return this.friends.listOnlineFriends(userId);
  }

  @Get('friends/requests')
  @ApiOperation({ summary: 'Incoming and outgoing pending friend requests.' })
  async requests(@CurrentUser('id') userId: string) {
    const [incoming, outgoing] = await Promise.all([
      this.friends.listIncomingRequests(userId),
      this.friends.listOutgoingRequests(userId),
    ]);
    return { incoming, outgoing };
  }

  @Get('friends/blocked')
  @ApiOperation({ summary: 'Users the player has blocked.' })
  blocked(@CurrentUser('id') userId: string) {
    return this.friends.listBlocked(userId);
  }

  @Get('friends/relationships')
  @ApiOperation({ summary: 'Friendship status for a set of user ids.' })
  relationships(
    @CurrentUser('id') userId: string,
    @Query('ids') ids: string,
  ) {
    const targetIds = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    return this.friends.relationships(userId, targetIds);
  }

  @Post('friends/requests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a friend request by username or user id.' })
  sendRequest(@CurrentUser('id') userId: string, @Body() dto: SendFriendRequestDto) {
    return this.friends.sendRequest(userId, dto);
  }

  @Post('friends/requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a friend request.' })
  accept(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.friends.acceptRequest(userId, id);
  }

  @Post('friends/requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a friend request.' })
  reject(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.friends.rejectRequest(userId, id);
  }

  @Delete('friends/requests/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a friend request you sent.' })
  cancel(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.friends.cancelRequest(userId, id);
  }

  @Post('friends/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove an accepted friend.' })
  remove(@CurrentUser('id') userId: string, @Body() dto: RemoveFriendDto) {
    return this.friends.removeFriend(userId, dto.friendId);
  }

  @Post('friends/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a user (severs friendship).' })
  block(@CurrentUser('id') userId: string, @Body() dto: BlockUserDto) {
    return this.friends.block(userId, dto);
  }

  @Post('friends/unblock/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user.' })
  unblock(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.friends.unblock(userId, id);
  }

  // ── Groups / clubs ───────────────────────────────────────────────────────

  @Get('groups')
  @ApiOperation({ summary: 'Groups the player belongs to.' })
  listGroups(@CurrentUser('id') userId: string) {
    return this.groups.listMine(userId);
  }

  @Get('groups/:id')
  @ApiOperation({ summary: 'Full group detail (members, roles).' })
  getGroup(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.getById(userId, id);
  }

  @Post('groups')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a group/club with a linked group chat.' })
  createGroup(@CurrentUser('id') userId: string, @Body() dto: CreateGroupDto) {
    return this.groups.create(userId, dto);
  }

  @Patch('groups/:id')
  @ApiOperation({ summary: 'Rename / edit a group (owner or admin).' })
  updateGroup(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(userId, id, dto);
  }

  @Post('groups/:id/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add friends to a group (owner or admin).' })
  addMembers(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GroupMembersDto,
  ) {
    return this.groups.addMembers(userId, id, dto.userIds);
  }

  @Delete('groups/:id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member (owner or admin).' })
  kickMember(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetId: string,
  ) {
    return this.groups.kick(userId, id, targetId);
  }

  @Post('groups/:id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a group.' })
  leave(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.leave(userId, id);
  }

  @Post('groups/:id/roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote/demote a member (owner only).' })
  setRole(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GroupMemberRoleDto,
  ) {
    return this.groups.setRole(userId, id, dto.userId, dto.role);
  }

  @Post('groups/:id/transfer/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer ownership to another member.' })
  transfer(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetId: string,
  ) {
    return this.groups.transferOwnership(userId, id, targetId);
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disband a group (owner only).' })
  disband(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.disband(userId, id);
  }

  // ── Game invites ─────────────────────────────────────────────────────────

  @Post('invites/room')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invite friends to an existing room.' })
  inviteToRoom(@CurrentUser('id') userId: string, @Body() dto: InviteToRoomDto) {
    return this.invites.inviteToRoom(userId, dto.roomId, dto.userIds);
  }

  @Post('invites/room/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a private room and invite friends in one step.' })
  createAndInvite(@CurrentUser('id') userId: string, @Body() dto: CreateInviteRoomDto) {
    return this.invites.createPrivateAndInvite(userId, dto);
  }
}
