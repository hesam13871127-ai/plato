/**
 * Centralised, strongly-typed configuration for VibeTable.
 * Values are read from environment variables (validated by Joi in
 * `validation.schema.ts`) and exposed through a typed object so the rest
 * of the application never touches `process.env` directly.
 */

export type NodeEnv = 'development' | 'test' | 'production';

export interface DatabaseConfig {
  type: 'mysql' | 'sqlite';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  runMigrations: boolean;
  logging: boolean;
}

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
  issuer: string;
}

export interface OtpConfig {
  length: number;
  ttlSeconds: number;
  maxAttempts: number;
  rateLimitSeconds: number;
  smsProvider: 'development' | 'twilio';
  smsFrom: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioVerifyServiceSid: string;
}

export interface VoiceConfig {
  /** 'livekit' when credentials are configured, otherwise 'dev' (mock tokens). */
  provider: 'livekit' | 'dev';
  apiKey: string;
  apiSecret: string;
  /** LiveKit server ws:// host clients connect to. */
  wsUrl: string;
  /** Token lifetime in seconds. */
  tokenTtlSeconds: number;
}

export interface GameConfig {
  /** Number of invisible bot players kept warm in the pool. */
  botPoolSize: number;
  /** Seconds a human waits in matchmaking before an invisible bot fills the seat. */
  botFallbackSeconds: number;
  /** Maximum skill-rating gap acceptable for an instant human match. */
  maxRatingGap: number;
  /** Disconnect grace period (seconds) before a seat is treated as abandoned. */
  reconnectGraceSeconds: number;
  /**
   * Divisor applied to bot "thinking" delays. 1 = realistic human pacing;
   * higher values make bots act faster (used by tests and fast-mode lobbies).
   */
  botThinkDivisor: number;
}

export interface RateLimitConfig {
  /** Throttler window in milliseconds. */
  ttl: number;
  /** Maximum requests per window per key. */
  limit: number;
}

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  isProduction: boolean;
  isTest: boolean;
  database: DatabaseConfig;
  jwt: JwtConfig;
  otp: OtpConfig;
  voice: VoiceConfig;
  game: GameConfig;
  rateLimit: RateLimitConfig;
}

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export default (): AppConfig => {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as NodeEnv;
  const livekitKey = process.env.LIVEKIT_API_KEY ?? '';
  const livekitSecret = process.env.LIVEKIT_API_SECRET ?? '';

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    corsOrigins: toList(process.env.CORS_ORIGINS),

    database: {
      type: (process.env.DB_TYPE ?? 'mysql') as 'mysql' | 'sqlite',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: parseInt(process.env.DB_PORT ?? '3306', 10),
      username: process.env.DB_USERNAME ?? 'root',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_DATABASE ?? 'vibetable',
      synchronize: toBool(process.env.DB_SYNCHRONIZE, nodeEnv !== 'production'),
      runMigrations: toBool(process.env.DB_RUN_MIGRATIONS, nodeEnv === 'production'),
      logging: toBool(process.env.DB_LOGGING, false),
    },

    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me-please-32chars',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me-please-32chars',
      accessTtl: process.env.JWT_ACCESS_TTL ?? '900s',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
      issuer: process.env.JWT_ISSUER ?? 'vibetable',
    },

    otp: {
      length: parseInt(process.env.OTP_LENGTH ?? '6', 10),
      ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '300', 10),
      maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
      rateLimitSeconds: parseInt(process.env.OTP_RATE_LIMIT_SECONDS ?? '60', 10),
      smsProvider: (process.env.SMS_PROVIDER ?? 'development') as 'development' | 'twilio',
      smsFrom: process.env.SMS_FROM ?? 'VibeTable',
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
      twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID ?? '',
    },

    voice: {
      provider: livekitKey && livekitSecret ? 'livekit' : 'dev',
      apiKey: livekitKey,
      apiSecret: livekitSecret,
      wsUrl: process.env.LIVEKIT_WS_URL ?? 'wss://localhost:7880',
      tokenTtlSeconds: parseInt(process.env.VOICE_TOKEN_TTL_SECONDS ?? '14400', 10),
    },

    game: {
      botPoolSize: parseInt(process.env.BOT_POOL_SIZE ?? '40', 10),
      botFallbackSeconds: parseInt(process.env.MATCHMAKING_BOT_FALLBACK_SECONDS ?? '30', 10),
      maxRatingGap: parseInt(process.env.MATCHMAKING_MAX_RATING_GAP ?? '200', 10),
      reconnectGraceSeconds: parseInt(process.env.GAME_RECONNECT_GRACE_SECONDS ?? '45', 10),
      botThinkDivisor: parseFloat(process.env.BOT_THINK_DIVISOR ?? '1'),
    },

    rateLimit: {
      ttl: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '15000', 10),
      limit: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
    },
  };
};
