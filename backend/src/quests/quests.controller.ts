import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClaimResultDto, DailyRewardsDto } from './dto/quests.dto';
import { QuestsService } from './quests.service';

@ApiTags('quests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quests')
export class QuestsController {
  constructor(private readonly questsService: QuestsService) {}

  @Get('daily')
  @ApiOperation({ summary: "Today's free daily reward state and daily quests." })
  getDaily(@CurrentUser('id') userId: string): Promise<DailyRewardsDto> {
    return this.questsService.getDailyRewards(userId);
  }

  @Post('daily/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim the free daily login coin reward (once per day).' })
  claimDaily(@CurrentUser('id') userId: string): Promise<ClaimResultDto> {
    return this.questsService.claimDaily(userId);
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim rewards for a completed daily quest.' })
  claimQuest(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) userQuestId: string,
  ): Promise<ClaimResultDto> {
    return this.questsService.claimQuest(userId, userQuestId);
  }
}
