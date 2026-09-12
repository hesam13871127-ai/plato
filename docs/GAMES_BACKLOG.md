# Plato — Games Catalogue & Verification

_Last updated: 2026-09-12 · branch `arena/01a09662-plato`_

The catalogue is aligned **1:1 with the real Plato line-up**: every shipped
slug is a game Plato actually offers (Ocho, Pool, Carrom, Dice Party, Bankroll,
Sea Battle, Minesweepers, Werewolf, Dots & Boxes, Poker…). Games that Plato
does not have (2048 Duel, Tic-Tac-Toe, Blackjack, Hangman, Trivia, Gomoku,
Memory, Word Chain, Emoji Charades, Impostor, Snakes & Ladders) were removed
from the engines, catalogue, shop, boards and tutorials — the catalog seeder
retires their rows at boot, so a stale database can never list them as playable.

---

## 1. How each game is verified

A game ships only when every layer below passes:

| Layer | Check |
|---|---|
| **Rules logic** | `backend/test/game-engines.e2e-spec.ts` — per-game rule suites plus a *full bot play-through*: every engine is driven to completion by its own `hard`-difficulty bot (up to 4,000 turns), every move re-validated, a winner (or explicit draw) required. |
| **Deep rules audit** | `backend/test/game-engines-new.e2e-spec.ts` — white-box rule probes for the rebuilt games: poker hand ranking + kicker order + wheel straight, blind schedules, min-raise legality, side-pot math, chopped pots; go-fish ask/draw/book flows; minesweeper adjacency + flood reveal + elimination; bankroll salary, doubled rent, forced liquidation, bankruptcy and the net-worth goal. |
| **Server integration** | `backend/test/game.e2e-spec.ts` — matchmaking → bot-filled table → the *human* seat driven by protocol mirrors → settlement, for every game. |
| **State contract** | Scripted cross-audit of every key the Flutter board reads (`b['…']`) vs. every key the engine's board state / redacted view writes. **24/24 games match.** |
| **Action contract** | Cross-audit of every `onAction('type', {…})` the board sends vs. every `action.type` / `action.payload.x` the engine validates. **24/24 games match.** |
| **Appearance** | Every board renders a real table surface (CustomPaint / card grid / canvas / game ring) with turn indicator, score strip, game-over state — plus a bundled 3D logo in `mobile/assets/game_logos/` and a bilingual (fa/en) tutorial. |

Latest evidence: backend `tsc` clean, production `nest build` clean,
**255/255 e2e tests green** (12 suites), Dart balance gate clean over all
167 files, contract audit 24/24.

---

## 2. Catalogue — 24 games, all playable, all Plato titles

| # | Slug | Name | Players | Engine highlights | Status |
|---|---|---|---|---|---|
| 1 | `dominoes` | Dominoes | 2–4 | Draw dominoes, blocking, bot chains | ✅ |
| 2 | `ludo` | Ludo | 2–4 | Capture rules, safe stars, exact-finish | ✅ |
| 3 | `ocho` | Ocho (UNO-style) | 2–4 | Wilds, +2/+4 stacking, color calls | ✅ |
| 4 | `connect4` | 4 in a Row | 2 | Win-line detection, minimax-style bot | ✅ |
| 5 | `checkers` | Checkers | 2 | Forced captures, multi-jumps, kings | ✅ |
| 6 | `chess` | Chess | 2 | Full orthodox rules: en passant, castling through check, promotion, 50-move, threefold, insufficient material | ✅ |
| 7 | `pool` | Pool | 2 | 8-ball groups, fouls, aim/pan physics | ✅ |
| 8 | `carrom` | Carrom | 2 | Striker placement, queen + cover | ✅ |
| 9 | `dots_and_boxes` | Dots & Boxes | 2 | Extra-turn chains, box stealing | ✅ |
| 10 | `bingo` | Bingo | 2–4 | Cage draws, dab, line calls | ✅ |
| 11 | `dice_party` | Dice Party (Yatzy) | 2–4 | 15 categories, holds, bonus | ✅ |
| 12 | `backgammon` | Backgammon | 2 | Blots, bearing off, doubles, legal-play enforcement | ✅ |
| 13 | `mancala` | Mancala (Kalah) | 2 | Extra turns, capture, sweep finish | ✅ |
| 14 | `bowling` | Bowling | 2–4 | 10 frames, strikes/spares scoring | ✅ |
| 15 | `sketch` | Sketch (Pictionary) | 2–4 | Rounds, live strokes, guess scoring | ✅ |
| 16 | `werewolf` | Werewolf | 5–8 | Night roles, day vote, faction win | ✅ |
| 17 | `darts` | Darts | 2–4 | Real board segments, aim + power | ✅ |
| 18 | `minigolf` | Mini Golf | 2–4 | 9 holes, walls, stroke counting | ✅ |
| 19 | `bankroll` | Bankroll | 2–4 | **Rebuilt to Plato rules**: 24-tile property ring, salaries, doubled group rent, chance deck, tax, forced liquidation at half price, bankruptcy, net-worth goal (3000) race | ✅ **new rules** |
| 20 | `battleship` | Sea Battle | 2 | Fleet deploy, salvo, sink detection | ✅ renamed to Plato's title |
| 21 | `reversi` | Reversi | 2 | Legal flips, corner heuristics | ✅ |
| 22 | `minesweepers` | Minesweepers | 2–4 | **NEW**: shared 12×12 field, 22 mines, competitive digs, flood-open pockets, elimination, score race | ✅ **new** |
| 23 | `gofish` | Go Fish | 2–4 | **NEW**: asks, go-fish draws, lucky draws, auto books, 13-book finish | ✅ **new** |
| 24 | `poker` | Poker (No-limit Hold'em) | 2–4 | **NEW**: blinds with heads-up button rules, min-raise tracking, all-in run-outs, full side pots, split pots, bust-outs, chip-leader match win | ✅ **new** |

---

## 3. What changed in this pass

| Change | Where |
|---|---|
| Removed 11 non-Plato games (engines, tests, catalogue, shop items, boards, tutorials, hub entries, logos, fixtures) | backend + mobile |
| **Bankroll rebuilt** from dice-poker to Plato's property-trading race (engine + board + tutorial + logo + rules suite) | `bankroll.engine.ts`, `bankroll_board.dart` |
| **Minesweepers added** (engine + board + tutorial + logo + rules suite) — competitive shared-field variant matching Plato's party format | `minesweeper.engine.ts`, `minesweeper_board.dart` |
| **Go Fish added** (engine + board + tutorial + logo + rules suite) | `gofish.engine.ts`, `gofish_board.dart` |
| **Poker added** — full no-limit hold'em with side pots (engine + board + tutorial + logo + rules suite) | `poker.engine.ts`, `poker_board.dart` |
| `battleship` renamed **Sea Battle** to match Plato's title (slug unchanged, no data migration) | catalogue + table titles |
| Catalog seeder now **retires** rows for games without engines | `game-catalog.seeder.ts` |
| Shop gained piece/skin cosmetics for the new games; removed games' cosmetics dropped | `shop-catalogue.ts` |

### Bugs the audit caught and fixed

- Poker `encodeScore` truncated hand categories (a pair could out-rank a straight) → fixed with 5-digit base-15 encoding.
- Poker `check` did not mark the actor as having acted → streets never closed → fixed.
- Poker street scan started *after* the designated first actor → first player skipped on every street → fixed with an inclusive scan.
- Poker bots could attempt raises with `to ≤ currentBet` (illegal) → gated on real stack headroom.
- Minesweeper flags locked cells forever (bots could deadlock) → flags are markers, revealing lifts them.
- Minesweeper explosion left the flag attached → fixed.

---

## 4. Backlog (candidate Plato titles for future waves)

| Candidate | Why | Effort |
|---|---|---|
| **Spades / Hearts** | Plato card staples (trick-taking) | L |
| **Gin Rummy** | Plato card staple, 2-player | M |
| **Cribbage** | Plato board-card hybrid | M |
| **Table Soccer / Archery / Bounce** | Plato sports arcade pack | M each |
| **Literati / Wordbox** | Plato word games (needs dictionary service) | L |
| **Disc-O (shuffleboard)** | Simple physics, high polish | M |

### Standing rules for any future game

1. Engine first: pure state machine + `chooseBotMove` for all four difficulties.
2. Ship the e2e rules suite **and** a full-bot play-through in the same commit.
3. Board reads only keys the engine writes; sends only actions the engine validates (both audited automatically).
4. Board must render on first frame with the initial state (no "waiting for data" look).
5. Tutorial (fa/en) + catalogue entry + dispatcher case + bundled logo in the same wave.
6. New games must exist in Plato's real catalogue — no invented titles.
