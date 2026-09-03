import { BadRequestException, NotFoundException } from '@nestjs/common';

/** Thrown when a wallet does not hold enough currency for a debit. */
export class InsufficientFundsException extends BadRequestException {
  constructor(currency: 'coins' | 'pips', required: number, available: number) {
    super(
      `Not enough ${currency}. Required: ${required}, available: ${available}.`,
    );
    this.currency = currency;
    this.required = required;
    this.available = available;
  }

  readonly currency: 'coins' | 'pips';
  readonly required: number;
  readonly available: number;
}

export class WalletNotFoundException extends NotFoundException {
  constructor(userId: string) {
    super(`Wallet not found for user ${userId}.`);
  }
}
