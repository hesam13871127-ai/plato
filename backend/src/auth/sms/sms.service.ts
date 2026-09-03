import { Injectable, Logger } from '@nestjs/common';

/** Abstraction over SMS delivery so providers can be swapped via config. */
export interface SmsSender {
  sendSms(to: string, body: string): Promise<void>;
}

/**
 * Development sender: writes the code to the server log (and surfaces it
 * through the auth response when `NODE_ENV !== 'production'`). Never enabled
 * in production.
 */
@Injectable()
export class ConsoleSmsService implements SmsSender {
  private readonly logger = new Logger('SmsService');

  async sendSms(to: string, body: string): Promise<void> {
    this.logger.log(`[SMS:development] -> ${to} : ${body}`);
  }
}
