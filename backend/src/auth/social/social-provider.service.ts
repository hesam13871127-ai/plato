import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { AppConfig } from '../../config/configuration';

export interface SocialIdentity {
  provider: 'google' | 'apple';
  subject: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Verifies identity tokens from Google Sign-In and Sign in with Apple.
 */
@Injectable()
export class SocialProviderService {
  private readonly googleAudiences: string[];
  private readonly appleAudience: string;
  private readonly googleClient = new OAuth2Client();
  private readonly appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

  constructor(configService: ConfigService<AppConfig, true>) {
    const social = configService.get('social', { infer: true });
    this.googleAudiences = social.googleClientIds;
    this.appleAudience = social.appleClientId;
  }

  async verifyGoogleIdToken(idToken: string): Promise<SocialIdentity> {
    if (this.googleAudiences.length === 0) {
      throw new UnauthorizedException('Google sign-in is not configured.');
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleAudiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new Error('Missing subject in Google token.');
      }
      return {
        provider: 'google',
        subject: payload.sub,
        email: payload.email ?? null,
        displayName: payload.name ?? null,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid Google ID token.');
    }
  }

  async verifyAppleIdToken(idToken: string): Promise<SocialIdentity> {
    try {
      const { payload } = await jwtVerify(idToken, this.appleJwks, {
        issuer: 'https://appleid.apple.com',
        ...(this.appleAudience ? { audience: this.appleAudience } : {}),
      });

      const subject = payload.sub as string | undefined;
      if (!subject) {
        throw new Error('Missing subject in Apple token.');
      }

      return {
        provider: 'apple',
        subject,
        email: (payload.email as string | undefined) ?? null,
        displayName: null,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid Apple ID token.');
    }
  }
}
