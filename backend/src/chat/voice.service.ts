import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import type { AppConfig } from '../config/configuration';

export interface VoiceTokenResult {
  /** LiveKit room name; also the Socket.io voice channel key. */
  roomName: string;
  /** Participant identity (stable for the user across the session). */
  identity: string;
  /** Signed JWT used by the LiveKit client SDK. */
  token: string;
  /** LiveKit websocket URL clients connect to. */
  url: string;
  /** 'livekit' when real credentials are configured, else 'dev'. */
  provider: 'livekit' | 'dev';
}

/**
 * Mints short-lived access tokens for voice channels. Each voice channel maps
 * 1:1 to a chat via the room name `voice:{chatId}`. When LiveKit credentials are
 * not configured (local/dev), tokens are still produced in a structurally valid
 * JWT shape so the client flow works end-to-end against a mock/disabled voice
 * client; production sets LIVEKIT_API_KEY / LIVEKIT_API_SECRET.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  roomNameForChat(chatId: string): string {
    return `voice:${chatId}`;
  }

  identityForUser(userId: string): string {
    return `u:${userId}`;
  }

  async mintToken(params: {
    chatId: string;
    userId: string;
    displayName: string;
    canPublish: boolean;
  }): Promise<VoiceTokenResult> {
    const voice = this.configService.get('voice', { infer: true });
    const roomName = this.roomNameForChat(params.chatId);
    const identity = this.identityForUser(params.userId);

    if (voice.provider === 'livekit') {
      const at = new AccessToken(voice.apiKey, voice.apiSecret, {
        identity,
        name: params.displayName,
        ttl: voice.tokenTtlSeconds,
      });
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: params.canPublish,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
      });
      const token = await at.toJwt();
      return { roomName, identity, token, url: voice.wsUrl, provider: 'livekit' };
    }

    // Dev mode: emit a clearly-marked unsigned placeholder token so the rest of
    // the join/presence flow is fully exercised without a LiveKit server.
    this.logger.warn('LiveKit credentials not set — issuing DEV voice token (no real audio).');
    const payload = {
      room: roomName,
      identity,
      name: params.displayName,
      canPublish: params.canPublish,
      sub: identity,
      iss: 'vibetable-dev',
      exp: Math.floor(Date.now() / 1000) + voice.tokenTtlSeconds,
    };
    const token = `dev.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    return { roomName, identity, token, url: voice.wsUrl, provider: 'dev' };
  }
}
