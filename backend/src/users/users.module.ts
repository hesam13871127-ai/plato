import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileEntity } from '../database/entities/profile.entity';
import { UserInventoryEntity } from '../database/entities/user-inventory.entity';
import { UserEntity } from '../database/entities/user.entity';
import { ProfileViewService } from './profile-view.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, ProfileEntity, UserInventoryEntity]),
  ],
  controllers: [UsersController],
  providers: [UsersService, ProfileViewService],
  exports: [UsersService, ProfileViewService, TypeOrmModule],
})
export class UsersModule {}
