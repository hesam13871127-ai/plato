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
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';
import {
  AdminBanUserDto,
  AdminGameStatusDto,
  AdminGrantCurrencyDto,
  AdminLiftBanDto,
  AdminSeasonActionDto,
  AdminShopItemIdDto,
  AdminUpdateUserDto,
  AdminUpsertGameDto,
  AdminUpsertShopItemDto,
  AdminUserListQueryDto,
} from './dto/admin.dto';

/**
 * Full platform administration API. Every route requires the `admin`
 * platform role (moderators use the dedicated moderation endpoints). The
 * authoritative check is the RolesGuard -> ModerationService role lookup.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ── Overview / analytics ────────────────────────────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'Global analytics: users, matches, economy, moderation.' })
  overview() {
    return this.admin.overview();
  }

  // ── Users ───────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Search/list users with balances and status.' })
  users(@Query() query: AdminUserListQueryDto) {
    return this.admin.listUsers(query);
  }

  @Patch('users/:userId')
  @ApiOperation({ summary: 'Edit a user: display name, status or platform role.' })
  updateUser(
    @CurrentUser('id') adminId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.admin.updateUser(adminId, userId, dto);
  }

  @Post('users/ban')
  @ApiOperation({ summary: 'Ban/mute/suspend a user.' })
  ban(@CurrentUser('id') adminId: string, @Body() dto: AdminBanUserDto) {
    return this.admin.banUser(adminId, dto);
  }

  @Post('users/lift-ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lift all active bans for a user.' })
  liftBan(@CurrentUser('id') adminId: string, @Body() dto: AdminLiftBanDto) {
    return this.admin.liftBan(adminId, dto.userId);
  }

  @Post('users/grant-currency')
  @ApiOperation({ summary: 'Grant (positive) or deduct (negative) coins/pips.' })
  grantCurrency(@CurrentUser('id') adminId: string, @Body() dto: AdminGrantCurrencyDto) {
    return this.admin.grantCurrency(adminId, dto);
  }

  // ── Shop ────────────────────────────────────────────────────────────────

  @Get('shop/items')
  @ApiOperation({ summary: 'List all shop items including unavailable ones.' })
  shopItems() {
    return this.admin.listAllShopItems();
  }

  @Post('shop/items')
  @ApiOperation({ summary: 'Create or update a shop item (include id to edit).' })
  upsertShopItem(@CurrentUser('id') adminId: string, @Body() dto: AdminUpsertShopItemDto) {
    return this.admin.upsertShopItem(adminId, dto);
  }

  @Delete('shop/items/:itemId')
  @ApiOperation({ summary: 'Delete a shop item.' })
  deleteShopItem(
    @CurrentUser('id') adminId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.admin.deleteShopItem(adminId, itemId);
  }

  // ── Games ───────────────────────────────────────────────────────────────

  @Get('games')
  @ApiOperation({ summary: 'List the full game catalogue.' })
  games() {
    return this.admin.listGames();
  }

  @Post('games')
  @ApiOperation({ summary: 'Add a new game to the catalogue.' })
  createGame(@CurrentUser('id') adminId: string, @Body() dto: AdminUpsertGameDto) {
    return this.admin.createGame(adminId, dto);
  }

  @Patch('games/:slug')
  @ApiOperation({ summary: 'Edit a game (name, players, duration, flags).' })
  updateGame(
    @CurrentUser('id') adminId: string,
    @Param('slug') slug: string,
    @Body() dto: AdminUpsertGameDto,
  ) {
    return this.admin.updateGame(adminId, slug, dto);
  }

  @Post('games/status')
  @ApiOperation({ summary: 'Enable/disable/maintenance a game.' })
  setGameStatus(@CurrentUser('id') adminId: string, @Body() dto: AdminGameStatusDto) {
    return this.admin.setGameStatus(adminId, dto.slug, dto.status);
  }

  // ── Seasons ─────────────────────────────────────────────────────────────

  @Get('seasons')
  @ApiOperation({ summary: 'List recent seasons.' })
  seasons() {
    return this.admin.listSeasons();
  }

  @Post('seasons/rollover')
  @ApiOperation({ summary: 'Force the active season to roll over.' })
  rolloverSeason(
    @CurrentUser('id') adminId: string,
    @Body() _dto: AdminSeasonActionDto,
  ) {
    return this.admin.rolloverSeason(adminId);
  }
}
