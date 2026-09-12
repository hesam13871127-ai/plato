import * as Joi from 'joi';

/**
 * Joi schema that validates environment variables at application bootstrap.
 * The application refuses to start when required configuration is missing or
 * malformed (fail fast).
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGINS: Joi.string().allow('').default(''),

  DB_TYPE: Joi.string().valid('mysql', 'sqlite').default('mysql'),
  DB_HOST: Joi.string().default('127.0.0.1'),
  DB_PORT: Joi.number().port().default(3306),
  DB_USERNAME: Joi.string().allow('').default('root'),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_DATABASE: Joi.string().default('vibetable'),
  DB_SYNCHRONIZE: Joi.boolean().default(true),
  DB_LOGGING: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('900s'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  JWT_ISSUER: Joi.string().default('vibetable'),

  OTP_LENGTH: Joi.number().integer().min(4).max(10).default(6),
  OTP_TTL_SECONDS: Joi.number().integer().min(30).default(300),
  OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  OTP_RATE_LIMIT_SECONDS: Joi.number().integer().min(0).default(60),
  SMS_PROVIDER: Joi.string().valid('development', 'twilio').default('development'),
  SMS_FROM: Joi.string().default('VibeTable'),
  TWILIO_ACCOUNT_SID: Joi.string().allow('').default(''),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').default(''),
  TWILIO_VERIFY_SERVICE_SID: Joi.string().allow('').default(''),

  // Voice (LiveKit) — optional; the server falls back to a dev token mode.
  LIVEKIT_API_KEY: Joi.string().allow('').default(''),
  LIVEKIT_API_SECRET: Joi.string().allow('').default(''),
  LIVEKIT_WS_URL: Joi.string().allow('').default('wss://localhost:7880'),
  VOICE_TOKEN_TTL_SECONDS: Joi.number().integer().min(60).default(14400),

  // Games & matchmaking
  BOT_POOL_SIZE: Joi.number().integer().min(0).default(40),
  MATCHMAKING_BOT_FALLBACK_SECONDS: Joi.number().integer().min(1).default(30),
  MATCHMAKING_MAX_RATING_GAP: Joi.number().integer().min(0).default(200),
  GAME_RECONNECT_GRACE_SECONDS: Joi.number().integer().min(5).default(45),
  BOT_THINK_DIVISOR: Joi.number().min(0.01).default(1),
});
