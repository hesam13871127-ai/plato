import { Module } from '@nestjs/common';
import { EconomyService } from './economy.service';

/**
 * Safe virtual-economy module. Any feature that mutates coins/pips must go
 * through {@link EconomyService} so balances and the ledger stay consistent.
 */
@Module({
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}
