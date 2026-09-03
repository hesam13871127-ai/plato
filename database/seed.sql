-- ============================================================================
-- VibeTable — Seed data (optional, for development / demos)
-- Run AFTER schema.sql. Uses fixed UUIDs so it is idempotent on a fresh DB.
-- ============================================================================

SET NAMES utf8mb4;

-- ── Games catalogue ────────────────────────────────────────────────────────
INSERT INTO games (id, slug, name, description, icon_url, min_players, max_players, avg_duration_minutes, supports_bots, ranked_enabled, status)
VALUES
  ('11111111-0000-4000-8000-000000000001', 'backgammon', 'Backgammon', 'The classic race-and-bear-off board game.', NULL, 2, 2, 12, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000002', 'dominoes',    'Dominoes',    'Match tiles and score the board.',        NULL, 2, 4, 15, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000003', 'ludo',        'Ludo',        'Race your tokens home in this party hit.', NULL, 2, 4, 20, 1, 0, 'active'),
  ('11111111-0000-4000-8000-000000000004', 'chess',       'Chess',       'The timeless strategy duel (coming soon).', NULL, 2, 2, 25, 0, 1, 'coming_soon')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ── First season ───────────────────────────────────────────────────────────
INSERT INTO seasons (id, name, season_number, starts_at, ends_at, status, rewards)
VALUES
  ('22222222-0000-4000-8000-000000000001', 'Season 1 — Neon Launch', 1,
   UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 90 DAY), 'active',
   JSON_OBJECT('rewards', JSON_ARRAY('avatar_frame_neon', '500 gems')))
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ── Example shop items ─────────────────────────────────────────────────────
INSERT INTO shop_items (id, name, description, type, rarity, price, currency, discount_percent, is_unique_owned, is_available, stock)
VALUES
  ('33333333-0000-4000-8000-000000000001', 'Neon Felt Table',     'Glowing electric-purple table skin.', 'table_skin',   'epic',      1500, 'coins', 0,  1, 1, 0),
  ('33333333-0000-4000-8000-000000000002', 'Cyan Dice Set',       'Translucent cyan dice.',              'dice_set',     'rare',      800,  'coins', 10, 1, 1, 0),
  ('33333333-0000-4000-8000-000000000003', 'Halo Avatar Frame',   'Legendary golden frame.',             'avatar_frame', 'legendary', 250,  'gems',  0,  1, 1, 0),
  ('33333333-0000-4000-8000-000000000004', 'Victory Emote Pack',  'Five flashy victory emotes.',         'emote',        'common',    300,  'coins', 0,  0, 1, 999)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ── A demo bot account ─────────────────────────────────────────────────────
-- The bot user is flagged is_bot=1 (internal) and has a bots config row.
INSERT INTO users (id, primary_provider, status, is_verified, is_bot, gender, presence, created_at, updated_at)
VALUES ('44444444-0000-4000-8000-000000000001', 'phone', 'active', 1, 1, 'unspecified', 'online', UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE status = 'active';

INSERT INTO profiles (user_id, username, display_name, avatar_url, level, xp, coins, gems, settings, created_at, updated_at)
VALUES ('44444444-0000-4000-8000-000000000001', 'vibebot', 'Vibe Bot', NULL, 5, 1200, 0, 0,
        JSON_OBJECT('notifications', false), UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

INSERT INTO bots (user_id, difficulty, personality, config, is_active, created_at, updated_at)
VALUES ('44444444-0000-4000-8000-000000000001', 'medium', 'friendly',
        JSON_OBJECT('aggression', 0.5, 'bluffRate', 0.2), 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE difficulty = VALUES(difficulty);
