-- ============================================================================
-- VibeTable — Seed data (optional, for development / demos)
-- Run AFTER schema.sql. Uses fixed UUIDs so it is idempotent on a fresh DB.
-- ============================================================================

SET NAMES utf8mb4;

-- ── Games catalogue ────────────────────────────────────────────────────────
-- The catalogue is rebuilt wave by wave (engine + 3D board + shop items per
-- game). Rows are appended below as each game lands; the API's runtime
-- GameCatalogSeeder is the source of truth and seeds the same list on boot.
-- INSERT INTO games (id, slug, name, description, icon_url, min_players, max_players, avg_duration_minutes, supports_bots, ranked_enabled, status)
INSERT INTO games (id, slug, name, description, icon_url, min_players, max_players, avg_duration_minutes, supports_bots, ranked_enabled, status)
VALUES
  ('11111111-0000-4000-8000-000000000002', 'dominoes', 'Dominoes', 'Classic Draw Dominoes for 2-4 players. Empty your hand or block the table!', NULL, 2, 4, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000005', 'ludo', 'Ludo', 'Roll the dice and race all four tokens home. Capture rivals and chase that six!', NULL, 2, 4, 20, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000006', 'ocho', 'Ocho', 'Match colours and numbers, slam skips and wilds. The classic crazy-eights party game.', NULL, 2, 4, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000007', 'connect4', '4 in a Row', 'Drop discs and connect four before your rival. Fast, sharp and tactical.', NULL, 2, 2, 5, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000008', 'checkers', 'Checkers', 'Classic draughts — jump, king and capture! Tactical, fast and perfect for duels.', NULL, 2, 2, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000009', 'chess', 'Chess', 'The immortal duel — castle, fork and checkmate your rival on the 64 squares.', NULL, 2, 2, 12, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000010', 'pool', 'Pool', 'Arcade 8-ball — smash the break, sink your colours and crown the black.', NULL, 2, 2, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000011', 'carrom', 'Carrom', 'Flick, clack, pocket — classic carrom duels with the red queen.', NULL, 2, 2, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000012', 'dots_and_boxes', 'Dots & Boxes', 'Draw lines, steal squares, chain the board — tiny grid, huge mind games.', NULL, 2, 2, 6, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000013', 'snakes_ladders', 'Snakes & Ladders', 'Climb the ladders, dodge the fangs — pure dice drama for the whole table.', NULL, 2, 4, 7, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000014', 'bingo', 'Bingo', 'Balls roll, cards dab, five in a row shouts BINGO! Luck at its loudest.', NULL, 2, 4, 5, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000015', 'dice_party', 'Dice Party', 'Roll, hold and bank the perfect Yatzy — fifteen ways to score big.', NULL, 2, 4, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000016', 'backgammon', 'Backgammon', 'The ancient race — break contact, anchor up and bear off before your rival.', NULL, 2, 2, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000017', 'mancala', 'Mancala', 'Sow, capture and hoard — the classic seed-counting duel of Kalah.', NULL, 2, 2, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000018', 'bowling', 'Bowling', 'Line up the pocket, hurl it down the boards and chase that perfect 300.', NULL, 2, 2, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000019', 'trivia', 'Trivia', 'Quiz night at the Plato lounge — seven rounds a player, ten points a truth.', NULL, 2, 4, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000020', 'word_chain', 'Word Chain', 'Each word starts where the last one ended — ten turns to spell your way to the top.', NULL, 2, 4, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000021', 'emoji_charades', 'Emoji Charades', 'Read the emoji riddle, out-guess the table — wrong picks vanish for everyone.', NULL, 2, 4, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000022', 'memory', 'Memory', 'Sixteen cards, eight pairs — flip two, remember everything, sweep the deck.', NULL, 2, 4, 8, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000023', 'sketch', 'Sketch', 'Grab the brush, paint the secret word and let the table race to read your mind.', NULL, 2, 4, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000024', 'werewolf', 'Werewolf', 'Night falls, the village sleeps — find the wolves before the wolves find you.', NULL, 5, 8, 10, 1, 1, 'active'),
  ('11111111-0000-4000-8000-000000000025', 'impostor', 'Impostor', 'One player does not know the place — blend in, sniff them out, eject them.', NULL, 4, 8, 8, 1, 1, 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name);

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
  ('44444444-0000-4000-9101-000000000011', 'Obsidian Dominoes', 'Volcanic-black tiles with molten gold pips.', 'game_piece', 'epic', NULL, 1800, 'coins', 0, 1, 1, 1, 0, 81, JSON_OBJECT('game', 'dominoes', 'piece', 'obsidian')),
  ('44444444-0000-4000-9202-000000000011', 'Domino Duel Felt',  'Sun-bleached terracotta domino felt.', 'game_skin', 'rare', NULL, 1300, 'coins', 10, 1, 1, 1, 0, 97, JSON_OBJECT('game', 'dominoes', 'felt', '#8A4B2E')),
  ('44444444-0000-4000-9101-000000000012', 'Aurora Ludo Tokens', 'Iridescent violet-to-cyan ludo tokens.', 'game_piece', 'epic', NULL, 2400, 'coins', 0, 1, 1, 1, 0, 82, JSON_OBJECT('game', 'ludo', 'piece', 'aurora')),
  ('44444444-0000-4000-9203-000000000012', 'Neon Circuit Track', 'Glowing cyber-circuit ludo ring.', 'game_skin', 'epic', NULL, 1900, 'coins', 0, 1, 1, 1, 0, 98, JSON_OBJECT('game', 'ludo', 'felt', '#0E21A8')),
  ('44444444-0000-4000-9101-000000000013', 'Gilded Ocho Deck', 'Black-and-gold ocho cards with foil edges.', 'game_piece', 'legendary', NULL, 2900, 'coins', 0, 1, 1, 1, 0, 83, JSON_OBJECT('game', 'ocho', 'piece', 'gilded')),
  ('44444444-0000-4000-9204-000000000013', 'Velvet Card Lounge', 'Deep velvet lounge felt for card nights.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 99, JSON_OBJECT('game', 'ocho', 'felt', '#4A1D5C')),
  ('44444444-0000-4000-9101-000000000014', 'Hologram Discs', 'Translucent neon-rimmed connect-4 discs.', 'game_piece', 'rare', NULL, 1200, 'coins', 10, 1, 1, 1, 0, 84, JSON_OBJECT('game', 'connect4', 'piece', 'hologram')),
  ('44444444-0000-4000-9205-000000000014', 'Arcade Neon Frame', 'Retro arcade frame with glowing columns.', 'game_skin', 'epic', NULL, 1700, 'coins', 0, 1, 1, 1, 0, 100, JSON_OBJECT('game', 'connect4', 'felt', '#14103C')),
  ('44444444-0000-4000-9101-000000000015', 'Onyx Crown Checkers', 'Obsidian checkers with molten-gold crown rings.', 'game_piece', 'epic', NULL, 2100, 'coins', 0, 1, 1, 1, 0, 85, JSON_OBJECT('game', 'checkers', 'piece', 'onyx')),
  ('44444444-0000-4000-9206-000000000015', 'Marble Royal Board', 'Polished marble draughts board with brass inlay.', 'game_skin', 'rare', NULL, 1500, 'coins', 0, 1, 1, 1, 0, 86, JSON_OBJECT('game', 'checkers', 'felt', '#3B2F2F', 'accent', '#F59E0B')),
  ('44444444-0000-4000-9101-000000000016', 'Regal Gold Chessmen', 'Gilded ivory-and-obsidian chess set with a brass king.', 'game_piece', 'epic', NULL, 2200, 'coins', 0, 1, 1, 1, 0, 87, JSON_OBJECT('game', 'chess', 'piece', 'gilded')),
  ('44444444-0000-4000-9207-000000000016', 'Grandmaster Marble', 'Cararra-marble battlefield with walnut inlay for grandmasters.', 'game_skin', 'rare', NULL, 1600, 'coins', 0, 1, 1, 1, 0, 88, JSON_OBJECT('game', 'chess', 'felt', '#2E2A25', 'accent', '#F5C542')),
  ('44444444-0000-4000-9101-000000000017', 'Celestial Glow Cue', 'Aurora-lit cue with a starlit ebony butt.', 'game_piece', 'epic', NULL, 2400, 'coins', 0, 1, 1, 1, 0, 89, JSON_OBJECT('game', 'pool', 'piece', 'celestial')),
  ('44444444-0000-4000-9208-000000000017', 'Midnight Baize', 'Deep midnight-green match baize with brass pockets.', 'game_skin', 'rare', NULL, 1500, 'coins', 0, 1, 1, 1, 0, 103, JSON_OBJECT('game', 'pool', 'felt', '#0B3D2E', 'accent', '#22D3EE')),
  ('44444444-0000-4000-9101-000000000018', 'Ivory Royale Men', 'Hand-carved ivory-tone carrom men with a gilded striker.', 'game_piece', 'epic', NULL, 2200, 'coins', 0, 1, 1, 1, 0, 104, JSON_OBJECT('game', 'carrom', 'piece', 'ivory')),
  ('44444444-0000-4000-9209-000000000018', 'Rosewood Arena', 'Tournament rosewood carrom board with silver inlay.', 'game_skin', 'rare', NULL, 1500, 'coins', 0, 1, 1, 1, 0, 105, JSON_OBJECT('game', 'carrom', 'felt', '#5C3A21', 'accent', '#F59E0B')),
  ('44444444-0000-4000-9101-000000000019', 'Chrome Neon Nodes', 'Liquid-chrome dots with laser neon lines.', 'game_piece', 'epic', NULL, 1900, 'coins', 0, 1, 1, 1, 0, 106, JSON_OBJECT('game', 'dots_and_boxes', 'piece', 'chrome')),
  ('44444444-0000-4000-9210-000000000019', 'Hologram Grid', 'Glass hologram board with refracting square washes.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 107, JSON_OBJECT('game', 'dots_and_boxes', 'felt', '#101A33', 'accent', '#22D3EE')),
  ('44444444-0000-4000-9101-000000000020', 'Jade Serpent Tokens', 'Carved jade racing tokens with gold inlay.', 'game_piece', 'epic', NULL, 1800, 'coins', 0, 1, 1, 1, 0, 108, JSON_OBJECT('game', 'snakes_ladders', 'piece', 'jade')),
  ('44444444-0000-4000-9211-000000000020', 'Jungle Temple Board', 'Vine-woven temple board with gilded snakes.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 109, JSON_OBJECT('game', 'snakes_ladders', 'felt', '#1E4029', 'accent', '#2E9E5B')),
  ('44444444-0000-4000-9101-000000000021', 'Gilded Dabber Set', 'Gold-cap daubers that stamp glowing royal marks.', 'game_piece', 'epic', NULL, 1700, 'coins', 0, 1, 1, 1, 0, 112, JSON_OBJECT('game', 'bingo', 'piece', 'gilded')),
  ('44444444-0000-4000-9212-000000000021', 'Vegas Neon Hall', 'Casino-floor bingo hall with neon cage lights.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 113, JSON_OBJECT('game', 'bingo', 'felt', '#3B1060', 'accent', '#EC4899')),
  ('44444444-0000-4000-9101-000000000022', 'Nebula Party Dice', 'Galaxy-flecked dice that glow on every six.', 'game_piece', 'epic', NULL, 1900, 'coins', 0, 1, 1, 1, 0, 114, JSON_OBJECT('game', 'dice_party', 'piece', 'nebula')),
  ('44444444-0000-4000-9213-000000000022', 'Confetti Ballroom', 'Party ballroom felt with falling confetti lights.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 115, JSON_OBJECT('game', 'dice_party', 'felt', '#3E1A5C', 'accent', '#F5C542')),
  ('44444444-0000-4000-9101-000000000023', 'Ivory & Onyx Checkers', 'Hand-carved ivory and onyx checkers with brass pips.', 'game_piece', 'epic', NULL, 1800, 'coins', 0, 1, 1, 1, 0, 116, JSON_OBJECT('game', 'backgammon', 'piece', 'ivory_onyx')),
  ('44444444-0000-4000-9213-000000000023', 'Sultan Palace Felt', 'Ottoman palace felt with gilded triangles.', 'game_skin', 'rare', NULL, 1500, 'coins', 0, 1, 1, 1, 0, 117, JSON_OBJECT('game', 'backgammon', 'felt', '#2A1A4A', 'accent', '#D4AF37')),
  ('44444444-0000-4000-9101-000000000024', 'Golden Bean Set', 'Polished golden beans that clink like coins.', 'game_piece', 'epic', NULL, 1800, 'coins', 0, 1, 1, 1, 0, 118, JSON_OBJECT('game', 'mancala', 'piece', 'golden_beans')),
  ('44444444-0000-4000-9213-000000000024', 'Baobab Wood Board', 'Carved baobab board with deep dark hollows.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 119, JSON_OBJECT('game', 'mancala', 'felt', '#3A2413', 'accent', '#D9A94A')),
  ('44444444-0000-4000-9101-000000000025', 'Comet Strike Ball', 'A deep-space resin ball with a comet-ice core.', 'game_piece', 'epic', NULL, 1800, 'coins', 0, 1, 1, 1, 0, 120, JSON_OBJECT('game', 'bowling', 'piece', 'comet_ball')),
  ('44444444-0000-4000-9213-000000000025', 'Neon Arcade Lanes', 'Midnight lanes under buzzing neon signage.', 'game_skin', 'rare', NULL, 1500, 'coins', 0, 1, 1, 1, 0, 121, JSON_OBJECT('game', 'bowling', 'felt', '#101A3C', 'accent', '#22D3EE')),
  ('44444444-0000-4000-9101-000000000026', 'Golden Envelope Pack', 'Wax-sealed golden envelopes for high-stakes questions.', 'game_piece', 'epic', NULL, 1700, 'coins', 0, 1, 1, 1, 0, 122, JSON_OBJECT('game', 'trivia', 'piece', 'golden_envelope')),
  ('44444444-0000-4000-9213-000000000026', 'Game Show Stage', 'Spotlights, podiums and that tense quiz-show hum.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 123, JSON_OBJECT('game', 'trivia', 'felt', '#1E1B4B', 'accent', '#FACC15')),
  ('44444444-0000-4000-9101-000000000027', 'Quill & Ink Set', 'A raven quill that dances over the chain ribbon.', 'game_piece', 'epic', NULL, 1700, 'coins', 0, 1, 1, 1, 0, 124, JSON_OBJECT('game', 'word_chain', 'piece', 'quill_ink')),
  ('44444444-0000-4000-9213-000000000027', 'Grand Library Desk', 'A wood-panelled library desk under brass lamps.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 125, JSON_OBJECT('game', 'word_chain', 'felt', '#2B1E10', 'accent', '#B98A3C')),
  ('44444444-0000-4000-9101-000000000028', 'Neon Mask Pair', 'Glowing comedy-tragedy masks that smirk on every guess.', 'game_piece', 'epic', NULL, 1700, 'coins', 0, 1, 1, 1, 0, 126, JSON_OBJECT('game', 'emoji_charades', 'piece', 'neon_masks')),
  ('44444444-0000-4000-9213-000000000028', 'Mask Parade Stage', 'A carnival stage with streamers and spotlight beams.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 127, JSON_OBJECT('game', 'emoji_charades', 'felt', '#3D1250', 'accent', '#F472B6')),
  ('44444444-0000-4000-9101-000000000029', 'Gilded Tarot Deck', 'Gold-leaf tarot cards that shimmer on every flip.', 'game_piece', 'epic', NULL, 1700, 'coins', 0, 1, 1, 1, 0, 128, JSON_OBJECT('game', 'memory', 'piece', 'gilded_tarot')),
  ('44444444-0000-4000-9213-000000000029', 'Mystic Velvet Table', 'A fortune-teller table with candle-lit velvet.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 129, JSON_OBJECT('game', 'memory', 'felt', '#260D2E', 'accent', '#A78BFA')),
  ('44444444-0000-4000-9101-000000000030', 'Peacock Brush Set', 'Iridescent peacock-feather brushes for masterpieces.', 'game_piece', 'epic', NULL, 1700, 'coins', 0, 1, 1, 1, 0, 130, JSON_OBJECT('game', 'sketch', 'piece', 'peacock_brush')),
  ('44444444-0000-4000-9213-000000000030', 'Atelier Loft Studio', 'A sunlit artist loft with paint-splattered easels.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 131, JSON_OBJECT('game', 'sketch', 'felt', '#1F2430', 'accent', '#22D3EE')),
  ('44444444-0000-4000-9101-000000000031', 'Silver Fang Charm', 'A silver fang pendant that glints under the full moon.', 'game_piece', 'epic', NULL, 1800, 'coins', 0, 1, 1, 1, 0, 132, JSON_OBJECT('game', 'werewolf', 'piece', 'silver_fang')),
  ('44444444-0000-4000-9213-000000000031', 'Blood Moon Village', 'A haunted village square beneath a blood-red moon.', 'game_skin', 'rare', NULL, 1500, 'coins', 0, 1, 1, 1, 0, 133, JSON_OBJECT('game', 'werewolf', 'felt', '#2B0A0A', 'accent', '#EF4444')),
  ('44444444-0000-4000-9101-000000000032', 'Smoke Bomb Charm', 'A pewter smoke bomb that fizzes when caught.', 'game_piece', 'epic', NULL, 1700, 'coins', 0, 1, 1, 1, 0, 134, JSON_OBJECT('game', 'impostor', 'piece', 'smoke_bomb')),
  ('44444444-0000-4000-9213-000000000032', 'Noir Rooftop Bar', 'A rainy rooftop bar lit by flickering neon.', 'game_skin', 'rare', NULL, 1400, 'coins', 0, 1, 1, 1, 0, 135, JSON_OBJECT('game', 'impostor', 'felt', '#101827', 'accent', '#F59E0B')),
  ('33333333-0000-4000-8500-000000000002', 'Cyan Dice Set',     'Translucent cyan dice.',          'dice_set', 'rare',     NULL, 800,  'coins', 10, 1, 1, 1, 0, 51, JSON_OBJECT('dice', '#00E5FF')),
  -- ID color
  ('33333333-0000-4000-8600-000000000001', 'Purple ID Color',   'Electric-purple username color.', 'id_color', 'epic',    NULL, 200, 'pips', 0, 1, 1, 1, 0, 60, JSON_OBJECT('color', '#7B5CFF')),
  ('33333333-0000-4000-8600-000000000002', 'Cyan ID Color',     'Soft-cyan username color.',       'id_color', 'rare',    NULL, 1200, 'coins', 0, 1, 1, 1, 0, 61, JSON_OBJECT('color', '#00E5FF')),
  ('33333333-0000-4000-8600-000000000003', 'Gold ID Color',     'Legendary gold username color.',  'id_color', 'legendary',NULL, 500, 'pips', 0, 1, 1, 1, 0, 62, JSON_OBJECT('color', '#FFC857')),
  -- Username change (consumable — not a unique cosmetic, not giftable)
  ('33333333-0000-4000-8700-000000000001', 'Username Change',   'Change your username once.',      'username_change', 'common', NULL, 500, 'coins', 0, 0, 0, 1, 0, 70, JSON_OBJECT('service', 'rename')),
  -- Emote pack (consumable quantity / collection)
  ('33333333-0000-4000-8800-000000000001', 'Victory Emote Pack','Five flashy victory emotes.',     'emote', 'common',      NULL, 300, 'coins', 0, 1, 1, 1, 0, 80, JSON_OBJECT('emotes', 5))
ON DUPLICATE KEY UPDATE name = VALUES(name);

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
