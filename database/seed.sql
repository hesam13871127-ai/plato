-- ============================================================================
-- VibeTable — Seed data (optional, for development / demos)
-- Run AFTER schema.sql. Uses fixed UUIDs so it is idempotent on a fresh DB.
-- ============================================================================

SET NAMES utf8mb4;

-- ── Games catalogue ────────────────────────────────────────────────────────
INSERT INTO games (id, slug, name, description, icon_url, min_players, max_players, avg_duration_minutes, supports_bots, ranked_enabled, status)
VALUES
  ('11111111-0000-4000-8800-000000000001', 'backgammon', 'Backgammon', 'Race your checkers home with dice and nerve. Hit blots, build primes, bear off first.', NULL, 2, 2, 15, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000002', 'dominoes',    'Dominoes',    'Match tiles and score the board.',        NULL, 2, 4, 15, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000003', 'ludo',        'Ludo',        'Race your tokens home in this party hit.', NULL, 2, 4, 20, 1, 0, 'active'),
  ('11111111-0000-4000-8000-000000000004', 'chess',       'Chess',       'The timeless strategy duel.',              NULL, 2, 2, 25, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000005', 'checkers',    'Checkers',    'Jump, capture and crown your kings. The timeless duel of draughts.', NULL, 2, 2, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000006', 'reversi',     'Reversi',     'Flip your rival''s discs by trapping them. Own the corners, own the board.', NULL, 2, 2, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000007', 'dots_boxes',  'Dots & Boxes','Connect the dots, close the boxes, steal the chains. Play with 2, 3 or 4 friends.', NULL, 2, 4, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000008', 'sea_battle',  'Sea Battle',  'Hide your fleet, hunt theirs. Hits fire again — sink all five ships to win.', NULL, 2, 2, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000009', 'mancala',     'Mancala',     'Sow stones around the board, capture across it, land in your store to go again.', NULL, 2, 2, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000010', 'mines',       'Mines',       'Competitive minesweeper: find more mines than your rivals on one shared field. 2–4 players.', NULL, 2, 4, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000011', 'go_fish',     'Go Fish',     'Ask, collect, book! The classic card game of memory and luck for 2–4 players.', NULL, 2, 4, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000012', 'darts',       'Darts',       '301, double-out. Steady the drifting reticle, hit trebles, and check out on a double. 2–4 players.', NULL, 2, 4, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000013', 'bowling',     'Bowling',     'Five frames, strikes, spares and splits. Line up, swipe with spin and hit the pocket. 2–4 players.', NULL, 2, 4, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000014', 'big_two',     'Big Two',     'The climbing card game: singles, pairs and poker hands — 2s are high, first to shed every card wins. 2–4 players.', NULL, 2, 4, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000015', 'cup_pong',    'Cup Pong',    'The party classic: arc your throws into the ten-cup triangle, sink both balls for balls back, re-rack at three. 2 players or 2v2.', NULL, 2, 4, 7, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000016', 'mini_golf',   'Mini Golf',   'Nine themed holes with walls, bumpers and sand — drag back to putt, lowest total wins. 2–4 players.', NULL, 2, 4, 12, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000017', 'hearts',      'Hearts',      'The evasion trick-taker: dodge hearts and the Queen of Spades, pass three cards, or shoot the moon. 2–4 players.', NULL, 2, 4, 15, 1, 1, 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), min_players = VALUES(min_players), max_players = VALUES(max_players), supports_bots = VALUES(supports_bots), status = VALUES(status);

-- ── First season ───────────────────────────────────────────────────────────
INSERT INTO seasons (id, name, season_number, starts_at, ends_at, status, rewards)
VALUES
  ('22222222-0000-4000-8800-000000000001', 'Season 1 — Neon Launch', 1,
   UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 90 DAY), 'active',
   JSON_OBJECT('rewards', JSON_ARRAY('avatar_frame_neon', '200 pips')))
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ── Shop catalogue ─────────────────────────────────────────────────────────
-- Category prefix in the id encodes the type for readability.
INSERT INTO shop_items (id, name, description, type, rarity, image_url, price, currency, discount_percent, is_unique_owned, giftable, is_available, stock, sort_order, metadata) VALUES
  -- Frames (avatar frames)
  ('33333333-0000-4000-8100-000000000001', 'Neon Halo Frame',   'A glowing electric-purple halo.', 'avatar_frame', 'epic',      NULL, 1500, 'coins', 0,  1, 1, 1, 0, 10, JSON_OBJECT('colors', JSON_ARRAY('#7B5CFF','#00E5FF'), 'style', 'halo')),
  ('33333333-0000-4000-8100-000000000002', 'Cyan Ring Frame',   'A crisp cyan rim.',               'avatar_frame', 'rare',      NULL, 800,  'coins', 10, 1, 1, 1, 0, 11, JSON_OBJECT('colors', JSON_ARRAY('#00E5FF'), 'style', 'ring')),
  ('33333333-0000-4000-1000-000000000003', 'Golden Crown Frame','Legendary crown frame.',           'avatar_frame', 'legendary', NULL, 250,  'pips',  0,  1, 1, 1, 0, 12, JSON_OBJECT('colors', JSON_ARRAY('#FFC857'), 'style', 'crown')),
  -- Banners
  ('33333333-0000-4000-8200-000000000001', 'Aurora Banner',     'Shifting purple-cyan aurora.',    'banner', 'epic',      NULL, 1200, 'coins', 0,  1, 1, 1, 0, 20, JSON_OBJECT('gradient', JSON_ARRAY('#7B5CFF','#00E5FF'))),
  ('33333333-0000-4000-8200-000000000002', 'Midnight Banner',   'Deep navy static banner.',        'banner', 'common',    NULL, 400,  'coins', 0,  1, 1, 1, 0, 21, JSON_OBJECT('gradient', JSON_ARRAY('#0B1426','#152241'))),
  -- Chat bubbles
  ('33333333-0000-4000-8300-000000000003', 'Starter Bubble',    'A friendly little chat bubble.',  'chat_bubble', 'common', NULL, 300, 'coins', 0, 1, 1, 1, 0, 29, JSON_OBJECT('color', '#3300E5FF')),
  ('33333333-0000-4000-8300-000000000001', 'Glass Bubble',      'Frosted glass chat bubble.',      'chat_bubble', 'rare', NULL, 900, 'coins', 0, 1, 1, 1, 0, 30, JSON_OBJECT('color', '#1AFFFFFF')),
  ('33333333-0000-4000-8300-000000000002', 'Neon Bubble',       'Electric purple bubble.',         'chat_bubble', 'epic', NULL, 150,  'pips',  0, 1, 1, 1, 0, 31, JSON_OBJECT('color', '#7B5CFF')),
  -- Themes
  ('33333333-0000-4000-8400-000000000001', 'Neon Night Theme',  'Purple & cyan interface theme.',  'theme', 'legendary',  NULL, 300, 'pips', 0, 1, 1, 1, 0, 40, JSON_OBJECT('accent', '#7B5CFF')),
  ('33333333-0000-4000-8400-000000000002', 'Ocean Theme',       'Soft cyan interface theme.',      'theme', 'rare',       NULL, 1000, 'coins', 20, 1, 1, 1, 0, 41, JSON_OBJECT('accent', '#00E5FF')),
  -- Game skins
  ('33333333-0000-4000-8500-000000000001', 'Neon Felt Table',   'Glowing purple table skin.',      'game_skin', 'epic',   NULL, 1500, 'coins', 0, 1, 1, 1, 0, 50, JSON_OBJECT('felt', '#7B5CFF')),
  ('33333333-0000-4000-8500-000000000002', 'Cyan Dice Set',     'Translucent cyan dice.',          'dice_set', 'rare',     NULL, 800,  'coins', 10, 1, 1, 1, 0, 51, JSON_OBJECT('dice', '#00E5FF')),
  -- ID color
  ('33333333-0000-4000-8600-000000000001', 'Purple ID Color',   'Electric-purple username color.', 'id_color', 'epic',    NULL, 200, 'pips', 0, 1, 1, 1, 0, 60, JSON_OBJECT('color', '#7B5CFF')),
  ('33333333-0000-4000-8600-000000000002', 'Cyan ID Color',     'Soft-cyan username color.',       'id_color', 'rare',    NULL, 1200, 'coins', 0, 1, 1, 1, 0, 61, JSON_OBJECT('color', '#00E5FF')),
  ('33333333-0000-4000-8600-000000000003', 'Gold ID Color',     'Legendary gold username color.',  'id_color', 'legendary',NULL, 500, 'pips', 0, 1, 1, 1, 0, 62, JSON_OBJECT('color', '#FFC857')),
  -- Username change (consumable — not a unique cosmetic, not giftable)
  ('33333333-0000-4000-8700-000000000001', 'Username Change',   'Change your username once.',      'username_change', 'common', NULL, 500, 'coins', 0, 0, 0, 1, 0, 70, JSON_OBJECT('service', 'rename')),
  -- Emote pack (consumable quantity / collection)
  ('33333333-0000-4000-8800-000000000001', 'Victory Emote Pack','Five flashy victory emotes.',     'emote', 'common',      NULL, 300, 'coins', 0, 1, 1, 1, 0, 80, JSON_OBJECT('emotes', 5)),
  -- Dice sets (Ludo, Backgammon, Dice Party)
  ('44444444-0000-4000-9100-000000000001', 'Golden Dice Set',   'Shiny 3D gold dice for every dice game.',        'dice_set', 'epic',   NULL, 2200, 'coins', 0,  1, 1, 1, 0, 80, JSON_OBJECT('dice', 'gold')),
  ('44444444-0000-4000-9100-000000000002', 'Ivory Dice Set',    'Classic ivory dice with deep-navy pips.',        'dice_set', 'common', NULL, 400,  'coins', 0,  1, 1, 1, 0, 81, JSON_OBJECT('dice', 'ivory')),
  ('44444444-0000-4000-9100-000000000003', 'Neon Dice Set',     'Translucent cyan dice that glow on every roll.', 'dice_set', 'rare',   NULL, 900,  'coins', 10, 1, 1, 1, 0, 82, JSON_OBJECT('dice', 'neon')),
  -- Piece sets (universal — every board game)
  ('44444444-0000-4000-9101-000000000001', 'Neon Pieces',       'Glowing pieces with a light-trail rim. Works in every board game.', 'game_piece', 'epic',      NULL, 2600, 'coins', 0,  1, 1, 1, 0, 90, JSON_OBJECT('piece', 'neon')),
  ('44444444-0000-4000-9101-000000000007', 'Candy Pieces',      'Glossy pastel candy pieces — sweet on every table.',                'game_piece', 'rare',      NULL, 1200, 'coins', 0,  1, 1, 1, 0, 91, JSON_OBJECT('piece', 'candy')),
  ('44444444-0000-4000-9101-000000000003', 'Wooden Pieces',     'Hand-turned walnut & maple pieces with a warm lacquer finish.',     'game_piece', 'common',    NULL, 600,  'coins', 0,  1, 1, 1, 0, 92, JSON_OBJECT('piece', 'wooden')),
  ('44444444-0000-4000-9101-000000000004', 'Royal Gold Pieces', 'Legendary gold-plated pieces with a ruby crown inlay.',             'game_piece', 'legendary', NULL, 380,  'pips',  0,  1, 1, 1, 0, 93, JSON_OBJECT('piece', 'gold')),
  ('44444444-0000-4000-9101-000000000005', 'Crystal Pieces',    'Cut-glass pieces that refract the table lights.',                   'game_piece', 'epic',      NULL, 2400, 'coins', 15, 1, 1, 1, 0, 94, JSON_OBJECT('piece', 'crystal')),
  ('44444444-0000-4000-9101-000000000006', 'Galaxy Pieces',     'Deep-space pieces with a swirling nebula core.',                    'game_piece', 'legendary', NULL, 320,  'pips',  0,  1, 1, 1, 0, 95, JSON_OBJECT('piece', 'galaxy')),
  -- Piece sets (game-specific)
  ('44444444-0000-4000-9104-000000000005', 'Marble Chess Pieces','Polished marble Staunton pieces for chess.',            'game_piece', 'epic',      NULL, 3000, 'coins', 0, 1, 1, 1, 0, 100, JSON_OBJECT('game', 'chess', 'piece', 'marble')),
  ('44444444-0000-4000-9104-000000000006', 'Neon Chess Pieces', 'Wireframe neon chess pieces straight out of the arcade.', 'game_piece', 'rare',      NULL, 1500, 'coins', 0, 1, 1, 1, 0, 101, JSON_OBJECT('game', 'chess', 'piece', 'neon')),
  ('44444444-0000-4000-9103-000000000004', 'Galaxy 8-Ball Set', 'Cosmic pool balls with a stardust 8-ball.',              'game_piece', 'legendary', NULL, 320,  'pips',  0, 1, 1, 1, 0, 102, JSON_OBJECT('game', 'pool_8ball', 'piece', 'galaxy')),
  ('44444444-0000-4000-9101-000000000002', 'Crystal Dominoes',  'Glassy cyan domino tiles that sparkle on the table.',    'game_piece', 'rare',      NULL, 1400, 'coins', 0, 1, 1, 1, 0, 103, JSON_OBJECT('game', 'dominoes', 'piece', 'crystal')),
  -- Playgrounds (3D board themes — one theme, every game)
  ('44444444-0000-4000-9200-000000000001', 'Midnight Velvet Playground', 'Deep navy 3D table with purple velvet cushions.',        'board_theme', 'epic',      NULL, 2400, 'coins', 0,  1, 1, 1, 0, 110, JSON_OBJECT('theme', 'midnight')),
  ('44444444-0000-4000-9201-000000000002', 'Gold Casino Playground',     'Luxury gold-trimmed casino table for every game.',       'board_theme', 'legendary', NULL, 420,  'pips',  0,  1, 1, 1, 0, 111, JSON_OBJECT('theme', 'gold_casino')),
  ('44444444-0000-4000-9202-000000000003', 'Emerald Forest Playground',  'Mossy green felt with warm oak rails.',                  'board_theme', 'rare',      NULL, 1100, 'coins', 0,  1, 1, 1, 0, 112, JSON_OBJECT('theme', 'forest')),
  ('44444444-0000-4000-9203-000000000004', 'Sakura Playground',          'Blush-pink lacquer with drifting cherry petals.',        'board_theme', 'epic',      NULL, 2200, 'coins', 10, 1, 1, 1, 0, 113, JSON_OBJECT('theme', 'sakura')),
  ('44444444-0000-4000-9204-000000000005', 'Cyber Grid Playground',      'Black glass and cyan laser lines — a table from the future.', 'board_theme', 'legendary', NULL, 360, 'pips', 0, 1, 1, 1, 0, 114, JSON_OBJECT('theme', 'cyber')),
  ('44444444-0000-4000-9205-000000000006', 'Sunset Dunes Playground',    'Warm amber sands under a violet evening sky.',           'board_theme', 'rare',      NULL, 1300, 'coins', 0,  1, 1, 1, 0, 115, JSON_OBJECT('theme', 'sunset')),
  ('44444444-0000-4000-9206-000000000007', 'Aurora Ice Playground',      'Frosted glass over a glacier-blue aurora — crisp and calm.', 'board_theme', 'epic',      NULL, 2300, 'coins', 0,  1, 1, 1, 0, 116, JSON_OBJECT('theme', 'ice')),
  ('44444444-0000-4000-9207-000000000008', 'Lava Playground',            'Obsidian slate with glowing magma seams. Bring the heat.', 'board_theme', 'legendary', NULL, 380,  'pips',  0,  1, 1, 1, 0, 117, JSON_OBJECT('theme', 'lava')),
  ('44444444-0000-4000-9208-000000000009', 'Royal Walnut Playground',    'Hand-polished walnut and brass — a classic club table.', 'board_theme', 'rare',      NULL, 1250, 'coins', 0,  1, 1, 1, 0, 118, JSON_OBJECT('theme', 'walnut')),
  ('44444444-0000-4000-9106-000000000008', 'Hologram Pieces',            'Translucent holo-glass pieces that shimmer as they move.', 'game_piece', 'legendary', NULL, 340,  'pips',  0,  1, 1, 1, 0, 98,  JSON_OBJECT('piece', 'hologram')),
  ('44444444-0000-4000-9107-000000000009', 'Marble Pieces',              'Cool polished marble — white, black, jade and rose.',    'game_piece', 'rare',      NULL, 1400, 'coins', 0,  1, 1, 1, 0, 99,  JSON_OBJECT('piece', 'marble')),
  ('44444444-0000-4000-9108-000000000010', 'Lava Pieces',                'Cracked obsidian with a molten core — pulses with heat.', 'game_piece', 'epic',      NULL, 2500, 'coins', 0,  1, 1, 1, 0, 100, JSON_OBJECT('piece', 'lava')),
  ('44444444-0000-4000-9209-000000000010', 'Neon Arcade Playground',     'Blacklight felt, magenta rails and cyan lines — bowling-alley glow for every table.', 'board_theme', 'epic', NULL, 2100, 'coins', 0,  1, 1, 1, 0, 119, JSON_OBJECT('theme', 'arcade')),
  ('44444444-0000-4000-9210-000000000011', 'Deep Ocean Playground',      'Sunlit water over a sandy reef — calm blues with a sea-glass accent.', 'board_theme', 'rare', NULL, 1100, 'coins', 0,  1, 1, 1, 0, 120, JSON_OBJECT('theme', 'ocean'))
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), metadata = VALUES(metadata);

-- ── Daily quests ───────────────────────────────────────────────────────────
INSERT INTO quests (id, code, name, description, goal_type, goal_target, reward_coins, reward_pips, reward_xp, reward_currency, sort_order, is_active) VALUES
  ('55555555-0000-4000-0000-000000000001', 'daily_login',        'Daily Check-in',  'Log in today.',                 'login',             1, 100, 0,  10, 'coins', 1, 1),
  ('55555555-0000-4000-0000-000000000002', 'play_match',         'Get Rolling',     'Play 3 matches.',               'play_match',        3, 200, 0,  20, 'coins', 2, 1),
  ('55555555-0000-4000-0000-000000000003', 'win_match',          'Winner Winner',   'Win 1 match.',                  'win_match',         1, 300, 0,  30, 'coins', 3, 1),
  ('55555555-0000-4000-0000-000000000004', 'play_with_friends',  'Social Roller',   'Play 2 matches with friends.',  'play_with_friends', 2, 250, 0,  25, 'coins', 4, 1),
  ('55555555-0000-4000-0000-000000000005', 'send_gift',          'Generous Spirit', 'Send 1 gift to a friend.',      'send_gift',         1, 150, 5,  20, 'pips',  5, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ── A demo bot account ─────────────────────────────────────────────────────
INSERT INTO users (id, primary_provider, status, is_verified, is_bot, gender, presence, created_at, updated_at)
VALUES ('44444444-0000-4000-8800-000000000001', 'phone', 'active', 1, 1, 'unspecified', 'online', UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE status = 'active';

INSERT INTO profiles (user_id, username, display_name, avatar_url, level, xp, coins, pips, gifts_sent, gifts_received, active_title, unlocked_titles, badges, settings, created_at, updated_at)
VALUES ('44444444-0000-4000-8800-000000000001', 'vibebot', 'Vibe Bot', NULL, 5, 1200, 0, 0, 0, 0,
        'Veteran',
        JSON_ARRAY('New Player','Veteran'),
        JSON_ARRAY(JSON_OBJECT('code','first_win','label','First Victory')),
        JSON_OBJECT('notifications', false), UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

INSERT INTO bots (user_id, difficulty, personality, config, is_active, created_at, updated_at)
VALUES ('44444444-0000-4000-8800-000000000001', 'medium', 'friendly',
        JSON_OBJECT('aggression', 0.5, 'bluffRate', 0.2), 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE difficulty = VALUES(difficulty);

-- ── Public Lounge chat (global social room) ────────────────────────────────
INSERT INTO chats (id, type, title, is_public, created_at, updated_at)
VALUES ('66666666-0000-4000-9000-000000000001', 'lounge', 'Lounge', 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE title = VALUES(title);
