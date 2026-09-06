import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProfileEntity } from '../database/entities/profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import { UpdateProfileDto, UserDto } from './dto/user.dto';
import { ProfileViewService } from './profile-view.service';

const USERNAME_TAKEN_ERROR = 1062;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly dataSource: DataSource,
    private readonly profileView: ProfileViewService,
  ) {}

  async findById(id: string): Promise<UserEntity> {
    const user = await this.users.findOne({
      where: { id },
      relations: { profile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  /** Full profile with wallet, stats, badges, titles and equipped cosmetics. */
  async getProfile(id: string): Promise<UserDto> {
    const user = await this.findById(id);
    return this.profileView.toUserDto(user);
  }

  /** Public profile of another user (by username). */
  async getPublicProfile(username: string): Promise<UserDto> {
    const profile = await this.profiles.findOne({
      where: { username },
      relations: { user: true },
    });
    if (!profile || !profile.user) {
      throw new NotFoundException('User not found.');
    }
    const dto = await this.profileView.toUserDto(profile.user);
    // Never reveal another user's platform role on their public profile.
    dto.role = null;
    return dto;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserDto> {
    const user = await this.findById(id);
    if (!user.profile) {
      throw new NotFoundException('Profile not found.');
    }
    const profile = user.profile;

    if (dto.username && dto.username !== profile.username) {
      const existing = await this.profiles.findOne({ where: { username: dto.username } });
      if (existing && existing.userId !== id) {
        throw new ConflictException('Username is already taken.');
      }
      profile.username = dto.username;
    }

    if (dto.displayName !== undefined) profile.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) profile.avatarUrl = dto.avatarUrl;
    if (dto.country !== undefined) profile.country = dto.country;
    if (dto.bio !== undefined) profile.bio = dto.bio;
    if (dto.gender !== undefined) user.gender = dto.gender;
    if (dto.title !== undefined) {
      const titles = Array.isArray(profile.unlockedTitles) ? (profile.unlockedTitles as string[]) : [];
      if (dto.title !== null && !titles.includes(dto.title)) {
        throw new BadRequestException('You have not unlocked that title.');
      }
      profile.activeTitle = dto.title;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(user);
        await manager.save(profile);
      });
    } catch (error) {
      const driverError = error as { driverError?: { errno?: number } };
      if (driverError.driverError?.errno === USERNAME_TAKEN_ERROR) {
        throw new ConflictException('Username is already taken.');
      }
      throw error;
    }

    const refreshed = await this.findById(id);
    return this.profileView.toUserDto(refreshed);
  }

  /**
   * Generates a unique username from a display name / provider name with a
   * random suffix. Retries on the rare collision.
   */
  async generateUniqueUsername(base: string): Promise<string> {
    const slug = this.slugify(base);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const candidate = `${slug}${suffix}`.slice(0, 32);
      const exists = await this.profiles.findOne({ where: { username: candidate } });
      if (!exists) {
        return candidate;
      }
    }
    return `player${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.slice(0, 32);
  }

  private slugify(value: string): string {
    const cleaned = value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20);
    return cleaned.length >= 3 ? cleaned : 'player';
  }

  assertNotBot(user: UserEntity): void {
    if (user.isBot) {
      throw new BadRequestException('Bot accounts cannot perform this action.');
    }
  }
}
