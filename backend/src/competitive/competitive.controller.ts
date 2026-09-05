import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LeaderboardQueryDto } from './dto/leaderboard.dto';
import { LeaderboardsService } from './leaderboards/leaderboards.service';
import { SeasonsService } from './seasons/seasons.service';
import { RANK_BANDS } from './rank/rank.constants';

@ApiTags('competitive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('competitive')
export class CompetitiveController {
  constructor(
    private readonly leaderboards: LeaderboardsService,
    private readonly seasons: SeasonsService,
  ) {}

  @Get('season')
  @ApiOperation({ summary: 'Current season info with a countdown and rank reward sets.' })
  async season() {
    const season = await this.seasons.activeSeasonView();
    return {
      season,
      ranks: RANK_BANDS.map((b) => ({
        tier: b.tier,
        label: b.label,
        minRating: b.minRating,
        color: b.color,
        reward: b.seasonReward,
      })),
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'The caller\u2019s global and per-game rankings for the active season.' })
  async myRankings(@CurrentUser('id') userId: string) {
    return this.leaderboards.myRankings(userId);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Global, per-game and friends leaderboards.' })
  async leaderboard(@CurrentUser('id') userId: string, @Query() query: LeaderboardQueryDto) {
    const scope = query.scope ?? 'global';
    const limit = query.limit ?? 50;
    if (query.game) {
      const result = await this.leaderboards.gameBoard({ userId, gameSlug: query.game, scope, limit });
      return { scope, game: query.game, ...result };
    }
    const result = await this.leaderboards.global({ userId, scope, limit });
    return { scope, game: null, ...result };
  }
}
