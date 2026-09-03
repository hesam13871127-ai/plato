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
import { toUserDto } from './user.serializer';

const USERNAME_TAKEN_ERROR = 1062;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly dataSource: DataSource,
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

  async getProfile(id: string): Promise<UserDto> {
    const user = await this.findById(id);
    return toUserDto(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserDto> {
    const user = await this.findById(id);
    if (!user.profile) {
      throw new NotFoundException('Profile not found.');
    }

    if (dto.username && dto.username !== user.profile.username) {
      const existing = await this.profiles.findOne({
        where: { username: dto.username },
      });
      if (existing && existing.userId !== id) {
        throw new ConflictException('Username is already taken.');
      }
      user.profile.username = dto.username;
    }

    if (dto.displayName !== undefined) user.profile.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) user.profile.avatarUrl = dto.avatarUrl;
    if (dto.country !== undefined) user.profile.country = dto.country;
    if (dto.bio !== undefined) user.profile.bio = dto.bio;
    if (dto.gender !== undefined) user.gender = dto.gender;

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(user);
        await manager.save(user.profile as ProfileEntity);
      });
    } catch (error) {
      const driverError = error as { driverError?: { errno?: number } };
      if (driverError.driverError?.errno === USERNAME_TAKEN_ERROR) {
        throw new ConflictException('Username is already taken.');
      }
      throw error;
    }

    return toUserDto(user);
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
    // Extremely unlikely: fall back to a fully random name.
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

  /** Pagination is intentionally kept off the public surface for phase 1. */
  assertNotBot(user: UserEntity): void {
    if (user.isBot) {
      throw new BadRequestException('Bot accounts cannot perform this action.');
    }
  }
}
