import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { SmsSender } from './sms.service';

/**
 * Twilio sender. The SDK is imported lazily so development deployments do not
 * need the dependency installed. Uses Twilio's Verify API when a Verify
 * Service SID is configured, otherwise falls back to a plain SMS message.
 */
@Injectable()
export class TwilioSmsService implements SmsSender {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly verifyServiceSid: string;
  private readonly from: string;

  constructor(configService: ConfigService<AppConfig, true>) {
    const otp = configService.get('otp', { infer: true });
    this.accountSid = otp.twilioAccountSid;
    this.authToken = otp.twilioAuthToken;
    this.verifyServiceSid = otp.twilioVerifyServiceSid;
    this.from = otp.smsFrom;
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (!this.accountSid || !this.authToken) {
      throw new InternalServerErrorException('Twilio credentials are not configured.');
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    const client = twilio(this.accountSid, this.authToken);

    if (this.verifyServiceSid) {
      await client.verify.v2.services(this.verifyServiceSid).verifications.create({
        to,
        channel: 'sms',
      });
      return;
    }

    await client.messages.create({ to, from: this.from, body });
  }
}
