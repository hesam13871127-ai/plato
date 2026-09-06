import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { AutoModerationService } from './auto-moderation.service';
import { ModerationService } from './moderation.service';
import { ErrorTrackingService } from '../common/observability/error-tracking.service';
import {
  AdminBanDto,
  DeleteMessageDto,
  LiftBanDto,
  ReportContentDto,
  ReportQueueQueryDto,
  ResolveReportDto,
  SetRoleDto,
} from './dto/moderation.dto';

/**
 * Reporting (available to every player) and the moderator/admin dashboard.
 * Player-facing report endpoints require only authentication; the queue,
 * ban/role/message-deletion and error-event endpoints require the moderator
 * or admin platform role.
 */
@ApiTags('moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('moderation')
export class ModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly autoModeration: AutoModerationService,
    private readonly errorTracking: ErrorTrackingService,
  ) {}

  // ── Player-facing reporting ─────────────────────────────────────────────

  @Post('reports')
  @ApiOperation({ summary: 'File a report against a user, message, room or group.' })
  async report(@CurrentUser('id') userId: string, @Body() dto: ReportContentDto) {
    const report = await this.moderation.fileReport({
      reporterId: userId,
      targetType: dto.targetType as never,
      targetId: dto.targetId,
      reason: dto.reason as never,
      details: dto.details,
    });
    // Auto-escalate content that many distinct users have reported.
    const distinct = await this.moderation.distinctReporters(dto.targetType, dto.targetId);
    const flagged = await this.autoModeration.noteReport(dto.targetType, dto.targetId, distinct);
    return { filed: true, reportId: report.id, autoFlagged: flagged };
  }

  // ── Moderator dashboard ─────────────────────────────────────────────────

  @Get('reports')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Moderator report queue.' })
  async listReports(@Query() query: ReportQueueQueryDto) {
    const { items, total } = await this.moderation.listReports({
      status: query.status as never,
      limit: query.limit,
      offset: query.offset,
    });
    return { items, total };
  }

  @Post('reports/:reportId/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Resolve or dismiss a report (warn/mute/ban/delete).' })
  async resolve(
    @CurrentUser('id') moderatorId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: ResolveReportDto,
  ) {
    const report = await this.moderation.resolveReport({
      reportId,
      moderatorId,
      action: dto.action,
      note: dto.note,
      durationMinutes: dto.durationMinutes,
    });
    return { resolved: true, status: report.status };
  }

  @Get('flags')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Auto-moderation flags raised by the content filter.' })
  async flags() {
    const items = await this.autoModeration.recentFlags(100);
    return { items };
  }

  @Post('bans')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Ban/mute/suspend a user.' })
  async ban(@CurrentUser('id') moderatorId: string, @Body() dto: AdminBanDto) {
    const ban = await this.moderation.banUser({
      userId: dto.userId,
      bannedBy: moderatorId,
      reason: dto.reason,
      durationMinutes: dto.durationMinutes,
      type: dto.type as never,
    });
    return { banned: true, banId: ban.id, type: ban.type, expiresAt: ban.expiresAt };
  }

  @Post('bans/lift')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Lift all active bans for a user.' })
  async lift(@CurrentUser('id') moderatorId: string, @Body() dto: LiftBanDto) {
    const lifted = await this.moderation.liftBan(dto.userId, moderatorId);
    return { lifted };
  }

  @Get('bans')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'List currently active bans.' })
  async activeBans() {
    const items = await this.moderation.listActiveBans(100);
    return { items };
  }

  @Post('messages/delete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Delete an offending message.' })
  async deleteMessage(@CurrentUser('id') moderatorId: string, @Body() dto: DeleteMessageDto) {
    await this.moderation.deleteMessage(dto.messageId, moderatorId, dto.reason);
    return { deleted: true };
  }

  @Get('audit')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Moderation audit trail.' })
  async audit() {
    const items = await this.moderation.recentAudit(100);
    return { items };
  }

  @Get('errors')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Recent tracked error/security events (admin only).' })
  async errors(@Query('level') level?: string) {
    const items = await this.errorTracking.recent(100, level as never);
    return { items };
  }

  @Post('roles')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Grant or revoke a platform role (admin only).' })
  async setRole(@CurrentUser('id') adminId: string, @Body() dto: SetRoleDto) {
    await this.moderation.setRole(dto.userId, dto.role, adminId);
    return { updated: true, role: dto.role };
  }
}
