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
import {
  ChangeUsernameDto,
  EquipItemDto,
  GiftItemDto,
  InventoryItemDto,
  PurchaseItemDto,
  ShopItemDto,
  ShopQueryDto,
  TransactionDto,
} from './dto/shop.dto';
import { ShopService } from './shop.service';

@ApiTags('shop')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('items')
  @ApiOperation({ summary: 'List available shop items (optionally by category).' })
  listItems(@CurrentUser('id') userId: string, @Query() query: ShopQueryDto): Promise<{ items: ShopItemDto[] }> {
    return this.shopService.listItems(userId, query);
  }

  @Post('purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buy an item with coins or pips.' })
  purchase(
    @CurrentUser('id') userId: string,
    @Body() dto: PurchaseItemDto,
  ): Promise<{ inventory: InventoryItemDto }> {
    return this.shopService.purchase(userId, dto.itemId);
  }

  @Post('gift')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buy and gift an item to another player by username.' })
  gift(@CurrentUser('id') userId: string, @Body() dto: GiftItemDto): Promise<{ gifted: true; recipient: string }> {
    return this.shopService.gift(userId, dto.itemId, dto.recipientUsername, dto.message);
  }

  @Get('inventory')
  @ApiOperation({ summary: "The current user's owned items." })
  getInventory(@CurrentUser('id') userId: string): Promise<{ items: InventoryItemDto[] }> {
    return this.shopService.getInventory(userId);
  }

  @Post('inventory/equip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Equip a cosmetic item.' })
  equip(@CurrentUser('id') userId: string, @Body() dto: EquipItemDto): Promise<{ equipped: true }> {
    return this.shopService.equip(userId, dto.inventoryId);
  }

  @Post('inventory/:id/unequip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unequip a cosmetic item.' })
  unequip(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) inventoryId: string,
  ): Promise<{ unequipped: true }> {
    return this.shopService.unequip(userId, inventoryId);
  }

  @Post('username/change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume a Username Change item to change the username.' })
  changeUsername(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangeUsernameDto,
  ): Promise<{ username: string }> {
    return this.shopService.changeUsername(userId, dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Paginated wallet transaction history.' })
  getTransactions(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{ items: TransactionDto[]; total: number; page: number; totalPages: number }> {
    return this.shopService.getTransactionHistory(
      userId,
      page ? Number(page) : 1,
      limit ? Math.min(Number(limit), 100) : 20,
    );
  }
}
