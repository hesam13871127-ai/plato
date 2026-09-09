import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/**
 * The house dictionary — common English words of three to ten letters,
 * spread across the alphabet so chains keep flowing. Word validity and the
 * bots both draw on this list.
 */
export const WORD_CHAIN_DICT: string[] = [
  'apple', 'angel', 'amber', 'anchor', 'animal', 'answer', 'antler', 'arrow', 'autumn', 'awake', 'azure',
  'banana', 'basket', 'beacon', 'bee', 'bell', 'berry', 'bishop', 'blade', 'blanket', 'blossom', 'bottle', 'box',
  'brave', 'bread', 'bridge', 'bright', 'bronze', 'brook',
  'cabin', 'candle', 'canyon', 'captain', 'caramel', 'castle', 'cedar', 'cherry', 'cider', 'cloud', 'clover',
  'comet', 'copper', 'coral', 'cosmic', 'cotton', 'crane', 'crystal',
  'daisy', 'dawn', 'delta', 'denim', 'diamond', 'dice', 'dinner', 'dolphin', 'dragon', 'dream', 'drift', 'drum', 'dusk',
  'eagle', 'earth', 'echo', 'eclipse', 'elder', 'elk', 'ember', 'emerald', 'empire', 'engine', 'evening',
  'falcon', 'fable', 'feather', 'fern', 'fiddle', 'fire', 'fish', 'flame', 'forest', 'fossil', 'fountain', 'fox', 'frost',
  'garden', 'garlic', 'gazelle', 'gecko', 'gem', 'ginger', 'glacier', 'glass', 'gold', 'goose', 'grape', 'green',
  'harbor', 'harp', 'hawk', 'hazel', 'heart', 'heather', 'hedge', 'hero', 'hill', 'honey', 'horizon', 'horn',
  'iceberg', 'icicle', 'igloo', 'indigo', 'ink', 'insect', 'iris', 'island', 'ivory',
  'jacket', 'jaguar', 'jasmine', 'jelly', 'jewel', 'jockey', 'jolly', 'journey', 'joy', 'jungle', 'junior',
  'keeper', 'kernel', 'kettle', 'key', 'kindness', 'king', 'kiosk', 'kite', 'kitten', 'knight', 'koala',
  'label', 'lagoon', 'lamp', 'lantern', 'lark', 'lattice', 'laurel', 'lava', 'leaf', 'lemon', 'lens', 'liberty',
  'lily', 'lion', 'lotus', 'lunar', 'lyre',
  'magnet', 'mahogany', 'maple', 'marble', 'marigold', 'meadow', 'melon', 'meteor', 'mighty', 'mirror', 'mist',
  'molar', 'moon', 'morning', 'mosaic', 'mountain', 'mouse', 'music',
  'narwhal', 'nation', 'nectar', 'needle', 'nest', 'net', 'night', 'noble', 'north', 'note', 'nougat', 'nova',
  'oak', 'oasis', 'ocean', 'october', 'olive', 'onyx', 'opal', 'orange', 'orchid', 'otter', 'owl',
  'palace', 'palm', 'panther', 'papaya', 'pearl', 'pebble', 'penguin', 'pepper', 'petal', 'phoenix', 'piano',
  'pine', 'planet', 'plum', 'polar', 'poppy', 'portrait', 'prairie',
  'quail', 'quarry', 'quartz', 'queen', 'quest', 'quick', 'quiet', 'quilt',
  'rabbit', 'raccoon', 'radar', 'rainbow', 'raspberry', 'raven', 'river', 'robin', 'rocket', 'rose', 'ruby', 'rudder',
  'saffron', 'sage', 'salmon', 'sand', 'sapphire', 'satin', 'scarlet', 'sea', 'shadow', 'silk', 'silver', 'sky',
  'slate', 'snow', 'solstice', 'song', 'sparrow', 'spring', 'star', 'storm', 'summer', 'swan',
  'teapot', 'temple', 'thistle', 'thunder', 'tiger', 'timber', 'toast', 'tomb', 'topaz', 'torch', 'treasure',
  'tree', 'trout', 'trumpet', 'tulip', 'tundra', 'turquoise',
  'umbrella', 'uncle', 'unicorn', 'upland', 'urchin', 'urn', 'usher',
  'valley', 'vanilla', 'vault', 'velvet', 'verse', 'vessel', 'violet', 'violin', 'vista', 'volcano',
  'wagon', 'walnut', 'walrus', 'wasp', 'water', 'wave', 'wicker', 'willow', 'wind', 'winter', 'wolf', 'wonder', 'wood', 'wren',
  'xenon', 'xylophone',
  'yacht', 'yak', 'yarrow', 'yeast', 'yellow', 'yew', 'yolk', 'young', 'yucca', 'yule',
  'zebra', 'zenith', 'zephyr', 'zigzag', 'zinc', 'zodiac', 'zone', 'zoo',
];

const DICT = new Set(WORD_CHAIN_DICT);
const ROUNDS_PER_PLAYER = 10;

interface WordChainBoard extends Record<string, unknown> {
  /** The letter the next word must start with — null on the very first turn. */
  letter: string | null;
  /** Words already played this match. */
  used: string[];
  /** Turns taken so far. */
  taken: number;
  /** Total turns in the match (players × rounds). */
  totalTurns: number;
  /** Verdicts, newest last. */
  history: Array<{ seat: number; word: string; valid: boolean; points: number }>;
  /** The previous submission, for the flash of judgement. */
  lastWord: { seat: number; word: string; valid: boolean; points: number } | null;
}

/**
 * Word Chain for two to four players, wave-4 rebuild.
 *
 * Take turns naming words: each word must begin with the last letter of the
 * one before it, come from the house dictionary, and never repeat. A valid
 * word banks one point per letter; a misspelt, unknown or repeated word
 * scores nothing but burns your turn. Everyone plays ten turns, then the
 * longest vocabulary wins. If a letter has no words left, the chain re-rolls
 * to a fresh letter so the game always flows. No hidden information.
 *
 * Bots reach into the same dictionary: easy picks anything legal, medium the
 * meatier half, hard/expert the longest word available.
 */
@Injectable()
export class WordChainEngine extends BaseGameEngine {
  readonly slug = 'word_chain';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: WordChainBoard = {
      letter: null,
      used: [],
      taken: 0,
      totalTurns: config.seats.length * ROUNDS_PER_PLAYER,
      history: [],
      lastWord: null,
    };
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: 0,
      turnStartedAt: new Date().toISOString(),
      seats: config.seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => 0),
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'word') return { ok: false, error: 'Unknown action.' };
    const raw = action.payload.word;
    if (typeof raw !== 'string') return { ok: false, error: 'Say a word.' };
    const word = raw.trim().toLowerCase();
    if (!/^[a-z]{3,10}$/.test(word)) {
      return { ok: false, error: 'Words are 3 to 10 letters of the plain alphabet.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid word.');
    const next = this.clone(state);
    const board = next.board as unknown as WordChainBoard;
    const seat = action.seat;
    const word = String(action.payload.word).trim().toLowerCase();

    const valid =
      DICT.has(word) && !board.used.includes(word) && (board.letter == null || word[0] === board.letter);
    const points = valid ? word.length : 0;
    if (valid) {
      board.used.push(word);
      board.letter = word[word.length - 1];
      next.scores[seat] += points;
    }
    board.history.push({ seat, word, valid, points });
    board.lastWord = { seat, word, valid, points };
    board.taken += 1;
    next.version += 1;

    if (board.taken >= board.totalTurns) {
      this.finish(next);
      return next;
    }

    next.currentSeat = (seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    // Dead-end letter? Re-roll to a letter that still has words left.
    if (board.letter != null && this.wordsStartingWith(board, board.letter).length === 0) {
      board.letter = this.rollLetter(board);
    }
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as WordChainBoard;
    const legal = this.wordsStartingWith(board, board.letter);
    if (legal.length === 0) {
      return { action: { seat, type: 'word', payload: { word: 'zzz' } }, delayMs: 800 };
    }
    const sorted = [...legal].sort((a, b) => b.length - a.length);
    let word: string;
    const blunder =
      difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.12 : difficulty === 'hard' ? 0.04 : 0.0;
    if (Math.random() < blunder) {
      word = 'zzz'; // a doomed heave
    } else if (difficulty === 'easy') {
      word = legal[Math.floor(Math.random() * legal.length)];
    } else if (difficulty === 'medium') {
      const pool = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
      word = pool[Math.floor(Math.random() * pool.length)];
    } else {
      word = sorted[0];
    }
    return {
      action: { seat, type: 'word', payload: { word } },
      delayMs: this.think(difficulty, 600),
    };
  }

  /** Up to eight legal words for the seat to act — the client/test mirror. */
  chainMoves(state: GameState, limit = 8): string[] {
    const board = state.board as unknown as WordChainBoard;
    return this.wordsStartingWith(board, board.letter).slice(0, limit);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private wordsStartingWith(board: WordChainBoard, letter: string | null): string[] {
    return WORD_CHAIN_DICT.filter((w) => !board.used.includes(w) && (letter == null || w[0] === letter));
  }

  private rollLetter(board: WordChainBoard): string {
    const letters = [...new Set(WORD_CHAIN_DICT.filter((w) => !board.used.includes(w)).map((w) => w[0]))];
    return letters[Math.floor(Math.random() * letters.length)];
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as WordChainBoard;
    const scores = state.scores;
    const max = Math.max(...scores);
    const leaders = scores.map((s, i) => ({ s, i })).filter((x) => x.s === max).map((x) => x.i);
    let winner: number | null = null;
    if (leaders.length === 1) {
      winner = leaders[0];
    } else {
      // Tiebreak: more valid words.
      const counts = state.seats.map((_, i) => board.history.filter((h) => h.seat === i && h.valid).length);
      const maxC = Math.max(...counts);
      const best = counts.map((c, i) => ({ c, i })).filter((x) => x.c === maxC).map((x) => x.i);
      if (best.length === 1) winner = best[0];
    }
    state.phase = 'completed';
    state.winnerSeat = winner;
    state.currentSeat = -1;
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 2000 : difficulty === 'medium' ? 1600 : difficulty === 'hard' ? 1200 : 900;
    return base + extra + Math.floor(Math.random() * 1000);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as WordChainBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        used: [...board.used],
        history: board.history.map((h) => ({ ...h })),
        lastWord: board.lastWord ? { ...board.lastWord } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
