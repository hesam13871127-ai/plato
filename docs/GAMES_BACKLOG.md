# Plato — Games Backlog

_Last updated: 2026-09-12 · branch `arena/01a08bf1-plato`_

Every entry below was audited in the "full rebuild" pass: engine rules,
bot brains, server↔client state contract, and the Flutter board widget.

---

## 1. How each game is verified

A game is considered **done** only when all four layers pass:

| Layer | Check |
|---|---|
| **Rules logic** | `backend/test/game-engines.e2e-spec.ts` — per-game rule suites plus a *full bot play-through*: every engine is driven to completion by its own `hard`-difficulty bot (up to 4,000 turns), every move re-validated, a winner (or explicit draw) required. |
| **State contract** | Scripted cross-audit of every key the Flutter board reads (`b['…']`) vs. every key the engine's board state / redacted view writes. **32/32 games match.** |
| **Action contract** | Cross-audit of every `onAction('type', {…})` the board sends vs. every `action.type` / `action.payload.x` the engine validates. **32/32 games match.** |
| **Appearance** | Manual review of every board widget's `build()` + painters: each game renders a real table surface (CustomPaint / card grid / canvas), never a placeholder. |

Latest evidence: backend `tsc` clean, **298/298 e2e tests green** (10 suites),
engine suite alone 231/231.

---

## 2. Catalogue — current state (32 games, all playable)

| # | Slug | Name | Players | Visual surface | Status |
|---|---|---|---|---|---|
| 1 | `dominoes` | Dominoes | 2–4 | Chain + hands + boneyard | ✅ done |
| 2 | `ludo` | Ludo | 2–4 | Full cross board, tokens, dice | ✅ done |
| 3 | `ocho` | Ocho (Crazy Eights) | 2–4 | 3D cards, deck, top card, hands | ✅ done |
| 4 | `connect4` | 4 in a Row | 2 | 6×7 grid, win-line glow | ✅ done |
| 5 | `checkers` | Checkers | 2 | 8×8, jump chains, trays | ✅ done |
| 6 | `chess` | Chess | 2 | Full 8×8, pieces, captured trays | ✅ done |
| 7 | `pool` | Pool | 2 | 2:1 table, balls, aim/pan | ✅ done |
| 8 | `carrom` | Carrom | 2 | Full carrom board, striker physics | ✅ done |
| 9 | `dots_and_boxes` | Dots & Boxes | 2 | Grid painter, claim glows | ✅ done |
| 10 | `snakes_ladders` | Snakes & Ladders | 2–4 | 10×10 board, snakes, dice | ✅ done |
| 11 | `bingo` | Bingo | 2–4 | BINGO card, cage strip, win line | ✅ done |
| 12 | `dice_party` | Dice Party (Yahtzee) | 2–4 | Dice row + scorecard | ✅ done |
| 13 | `backgammon` | Backgammon | 2 | Full 24-point board, dice tray | ✅ done |
| 14 | `mancala` | Mancala | 2 | 6 pits × 2 + stores | ✅ done |
| 15 | `bowling` | Bowling | 2–4 | Lane painter, pins, score sheet | ✅ done |
| 16 | `trivia` | Trivia | 2–4 | Question cards, recap, scores | ✅ done |
| 17 | `word_chain` | Word Chain | 2–4 | Letter tile, chain ribbon, input | ✅ done |
| 18 | `emoji_charades` | Emoji Charades | 2–4 | Riddle card, guess input | ✅ done |
| 19 | `memory` | Memory | 2–4 | 4×4 flip grid, pair tray | ✅ done |
| 20 | `sketch` | Sketch (Pictionary) | 2–4 | Drawing canvas, tools, guesses | ✅ done |
| 21 | `werewolf` | Werewolf | 5–8 | Night/day phases, player cards | ✅ done |
| 22 | `impostor` | Impostor | 4–8 | Location card, cast, story log | ✅ done |
| 23 | `darts` | Darts | 2–4 | Regulation dartboard, aim + power | ✅ done |
| 24 | `minigolf` | Mini Golf | 2 | 9 painted holes, physics trail | ✅ done |
| 25 | `bankroll` | Bankroll (Dice poker) | 2–4 | Pot card, cast ledger | ✅ done |
| 26 | `battleship` | Battleship | 2 | Deploy + target grids, fleet | ✅ done |
| 27 | `reversi` | Reversi | 2 | 8×8, legal-move hints, discs | ✅ done |
| 28 | `gomoku` | Gomoku | 2 | 15×15 go board, win ribbon | ✅ done |
| 29 | `blackjack` | Blackjack | 2–4 | Dealer/player rows, cards | ✅ done |
| 30 | `hangman` | Hangman | 2–4 | Gallows painter, A–Z keypad | ✅ done |
| 31 | `tic_tac_toe` | Tic-Tac-Toe | 2 | 3×3, X/O painters, win flash | ✅ **new** |
| 32 | `tile_duel` | 2048 Duel | 2 | Dual 4×4 boards, tile palette | ✅ **new** |

---

## 3. Fixed in this pass

| Issue | Where | Fix |
|---|---|---|
| Seat picker was hard-coded to `2/3/4` for **every** game — werewolf (needs 5–8) could only ever show invalid choices; 2-player games offered seats the engine rejects. | `mobile/…/create_room_screen.dart` | Picker now reads the catalogue entry and renders `minPlayers..maxPlayers`; default = `minPlayers`; final clamp before `createRoom` so the UI can never submit a seat count the engine rejects. (The server already clamped — now the UI agrees with it.) |
| Catalogue had no quick classics for a 2-minute match. | backend + mobile | Added **Tic-Tac-Toe** (minimax bot — hard/expert play perfectly) and **2048 Duel** (each player owns a 2048 board; first to forge 2048 wins, stuck players pass, double-stuck → higher total wins). Full engine + board + tutorials (fa/en) + rules tests + bot play-throughs. |

### Verified NOT broken (audit evidence)

- **Logic:** 298/298 e2e green, incl. the full-bot play-through that forces every game to a completed state with a winner.
- **Data flow:** every board's parsed keys exist in its engine's state/view (scripted key audit, 32/32). Every action type and payload field a board sends is one the engine validates (32/32).
- **Appearance:** all 30 pre-existing boards reviewed widget-by-widget — every one draws a real board (painter or card grid), with turn indicator, skin picker, score chips and game-over handling. No placeholder/TODO/empty-state remnants found.
- **Room flow:** server clamps seat count to the game's legal range and pre-fills bots; start failures surface as SnackBar messages; success navigates to the table.

> If an installed APK ever showed a game "with no board", it was built before the
> wave rebuilds (or failed to compile on the known Dart errors fixed in
> `3516949`). Rebuild the APK from this branch — the boards ship in it.

---

## 4. Backlog (next waves)

### Games to add (candidates, ordered by value/effort)

| Candidate | Why | Effort |
|---|---|---|
| **Poker (5-card draw, pot)** | Rounds, betting, hand ranking — strong party fit | M |
| **Snakes & Ladders party mode** (4-up with events) | Extend existing engine | S |
| **Aircraft (airplane) dice** | Persian-party classic, pure dice engine | M |
| **Backgammon 4-player** | Variant of existing engine | M |
| **Word scramble (timed anagrams)** | Fast rounds, trivia-style UI reuse | S |
| **Ludo "sudden death" variant** | Race-to-first-home toggle | S |

### Quality backlog (polish, not blocking)

- [ ] Record a short "how the table starts" onboarding video/loop for first-time users.
- [ ] Per-game win-streak stats on the profile screen.
- [ ] Bot personalities (flavor chat lines per difficulty).
- [ ] Haptics on merge/winning-line moments (2048 Duel, Tic-Tac-Toe, connect4).
- [ ] Landscape layout pass for the two-grid games (battleship, 2048 Duel).
- [ ] Audio: subtle table ambience + per-game win jingles.

### Standing rules for any future game

1. Engine first: pure state machine + `chooseBotMove` for all four difficulties.
2. Ship the e2e rules suite **and** a full-bot play-through in the same commit.
3. Board reads only keys the engine writes; sends only actions the engine validates (both audited automatically).
4. Board must render on first frame with the initial state (no "waiting for data" look).
5. Tutorial (fa/en) + catalogue entry + dispatcher case in the same wave.
