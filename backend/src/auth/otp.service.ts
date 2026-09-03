import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { AppConfig } from '../config/configuration';
import { OtpCodeEntity } from '../database/entities/otp-code.entity';
import { generateOtpCode, sha256 } from '../common/utils/crypto.util';
import { normalizePhone } from '../common/utils/phone.util';
import { ConsoleSmsService } from './sms/sms.service';
import { TwilioSmsService } from './sms/twilio-sms.service';
import type { SmsSender } from './sms/sms.service';

export interface IssuedOtp {
  /** Only populated outside production, to ease development/testing. */
  devCode?: string;
}

@Injectable()
export class OtpService {
  private readonly smsSender: SmsSender;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    @InjectRepository(OtpCodeEntity)
    private readonly otpCodes: Repository<OtpCodeEntity>,
    private readonly consoleSms: ConsoleSmsService,
    private readonly twilioSms: TwilioSmsService,
  ) {
    const provider = this.configService.get('otp.smsProvider', { infer: true });
    this.smsSender = provider === 'twilio' ? this.twilioSms : this.consoleSms;
  }

  /**
   * Generates and "sends" an OTP for a phone. Enforces a resend cooldown and
   * invalidates previous unused codes for the same phone + purpose.
   */
  async requestCode(phone: string, purpose: 'login' | 'verify_phone' | 'reset' = 'login'): Promise<IssuedOtp> {
    const otp = this.configService.get('otp', { infer: true });
    const normalized = normalizePhone(phone);
    const now = new Date();

    const latestCandidates = await this.otpCodes.find({
      where: { phone: normalized, purpose },
      order: { id: 'DESC' },
      take: 1,
    });
    const latest = latestCandidates[0] ?? null;

    if (latest && !latest.consumedAt) {
      const elapsed = (now.getTime() - latest.lastSentAt.getTime()) / 1000;
      if (elapsed < otp.rateLimitSeconds) {
        const wait = Math.ceil(otp.rateLimitSeconds - elapsed);
        throw new ConflictException(`Please wait ${wait}s before requesting another code.`);
      }
    }

    const code = generateOtpCode(otp.length);

    const entity = this.otpCodes.create({
      phone: normalized,
      purpose,
      codeHash: sha256(code),
      expiresAt: new Date(now.getTime() + otp.ttlSeconds * 1000),
      attempts: 0,
      maxAttempts: otp.maxAttempts,
      consumedAt: null,
      lastSentAt: now,
    });
    await this.otpCodes.save(entity);

    await this.smsSender.sendSms(
      normalized,
      `Your VibeTable verification code is ${code}. It expires in ${Math.round(otp.ttlSeconds / 60)} minutes.`,
    );

    // Opportunistic cleanup of expired codes.
    await this.otpCodes.delete({ expiresAt: LessThan(now) });

    const isProduction = this.configService.get('isProduction', { infer: true });
    return isProduction ? {} : { devCode: code };
  }

  /**
   * Validates a submitted code. Throws 401 on wrong/expired/over-attempt
   * codes; on success marks the code consumed so it cannot be replayed.
   */
  async verifyCode(phone: string, code: string, purpose: 'login' | 'verify_phone' | 'reset' = 'login'): Promise<boolean> {
    const normalized = normalizePhone(phone);
    const now = new Date();

    // The most recently issued code for this phone + purpose. Ordering by the
    // auto-generated id (monotonic) is stable even when timestamps coincide.
    const candidates = await this.otpCodes.find({
      where: { phone: normalized, purpose },
      order: { id: 'DESC' },
      take: 1,
    });
    const entity = candidates[0] ?? null;

    if (!entity || entity.consumedAt !== null) {
      throw new BadRequestException('No active verification code. Please request a new one.');
    }

    if (entity.expiresAt < now) {
      await this.otpCodes.delete(entity.id);
      throw new UnauthorizedException('Verification code has expired. Please request a new one.');
    }

    if (entity.attempts >= entity.maxAttempts) {
      await this.otpCodes.delete(entity.id);
      throw new UnauthorizedException('Too many incorrect attempts. Please request a new code.');
    }

    if (entity.codeHash !== sha256(code)) {
      entity.attempts += 1;
      await this.otpCodes.save(entity);
      throw new UnauthorizedException('Incorrect verification code.');
    }

    entity.consumedAt = now;
    await this.otpCodes.save(entity);
    return true;
  }
}
