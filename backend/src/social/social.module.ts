import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatModule } from '../chat/chat.module';
import { FriendshipEntity } from '../database/entities/friendship.entity';
import { GameEntity } from '../database/entities/game.entity';
import { GroupMemberEntity } from '../database/entities/group-member.entity';
import { GroupEntity } from '../database/entities/group.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { RoomEntity } from '../database/entities/room.entity';
import { UserEntity } from '../database/entities/user.entity';
import { GameModule } from '../game/game.module';
import { FriendsService } from './friends.service';
import { GroupsService } from './groups.service';
import { InvitesService } from './invites.service';
import { SocialController } from './social.controller';
import { SocialEventsService } from './social-events.service';

/**
 * Social graph: friendships (request/accept/reject/remove/block), player groups
 * & clubs with owner/admin/member roles (linked to a group chat), and game/room
 * invitations delivered over the shared Socket.IO gateway.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FriendshipEntity,
      GroupEntity,
      GroupMemberEntity,
      UserEntity,
      ProfileEntity,
      RoomEntity,
      GameEntity,
    ]),
    ChatModule,
    GameModule,
  ],
  controllers: [SocialController],
  providers: [FriendsService, GroupsService, InvitesService, SocialEventsService],
  exports: [FriendsService, GroupsService, InvitesService],
})
export class SocialModule {}
