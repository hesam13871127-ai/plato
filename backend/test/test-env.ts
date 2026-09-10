/**
 * Test environment setup — invoked by importing this module first in e2e
 * specs. Configures the application to run against in-memory SQLite (sql.js)
 * with deterministic JWT secrets, so no external MySQL is required.
 */
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
process.env.DB_SYNCHRONIZE = 'true';
process.env.PORT = '0';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-which-is-long-enough-0001';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-which-is-long-enough-0001';
process.env.JWT_ACCESS_TTL = '900s';
process.env.JWT_REFRESH_TTL = '1d';
process.env.SMS_PROVIDER = 'development';
process.env.OTP_RATE_LIMIT_SECONDS = '0';
// Games: speed up bot pacing and the matchmaking fallback for deterministic tests.
process.env.BOT_THINK_DIVISOR = '250';
process.env.MATCHMAKING_BOT_FALLBACK_SECONDS = '1';
process.env.BOT_POOL_SIZE = '12';
