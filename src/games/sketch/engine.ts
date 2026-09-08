import type { GameConfig, GameEngine, RNG } from '../../core/types';
import { TARGETS, type Pt } from './targets';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const ROUNDS = 3;

export interface SketchAttempt {
  player: number;
  round: number;
  targetIdx: number;
  strokes: Pt[][];
  score: number;
}

export interface SketchState {
  playerCount: number;
  round: number; // 0-based
  turn: number;
  targets: number[]; // targetIdx per round
  scores: number[];
  attempts: SketchAttempt[];
  phase: 'draw' | 'over';
  lastEvent: { player: number; round: number; score: number } | null;
}

export type SketchAction = { type: 'submit'; strokes: Pt[][] };

/* ------------------------------------------------------------------ */
/* Similarity scoring                                                  */
/* ------------------------------------------------------------------ */

export const EPS = 0.05;
const SAMPLE_STEP = 0.03;

function sampleStrokes(strokes: Pt[][]): Pt[] {
  const out: Pt[] = [];
  for (const st of strokes) {
    if (st.length === 1) {
      out.push(st[0]!);
      continue;
    }
    for (let i = 1; i < st.length; i++) {
      const [x0, y0] = st[i - 1]!;
      const [x1, y1] = st[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / SAMPLE_STEP));
      for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
  }
  return out;
}

function near(a: Pt, b: Pt): boolean {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy <= EPS * EPS;
}

/** 0..100: how faithfully `user` copies `target` (coverage 65% + precision 35%). */
export function sketchScore(target: Pt[][], user: Pt[][]): number {
  const tp = sampleStrokes(target);
  const up = sampleStrokes(user);
  if (tp.length === 0 || up.length === 0) return 0;
  let covered = 0;
  for (const p of tp) if (up.some((q) => near(p, q))) covered++;
  let precise = 0;
  for (const q of up) if (tp.some((p) => near(p, q))) precise++;
  return Math.round((covered / tp.length) * 65 + (precise / up.length) * 35);
}

/* ------------------------------------------------------------------ */
/* Bot "drawing"                                                       */
/* ------------------------------------------------------------------ */

const BOT_AMP: Record<string, number> = { easy: 0.09, medium: 0.04, hard: 0.012 };
const BOT_DROP: Record<string, number> = { easy: 0.35, medium: 0.12, hard: 0 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function botStrokes(target: Pt[][], rng: RNG, difficulty: string): Pt[][] {
  const amp = BOT_AMP[difficulty] ?? 0.04;
  const drop = BOT_DROP[difficulty] ?? 0.12;
  return target
    .filter(() => rng.next() >= drop)
    .map((st) => st.map(([x, y]) => [clamp01(x + (rng.next() * 2 - 1) * amp), clamp01(y + (rng.next() * 2 - 1) * amp)] as Pt));
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const sketchEngine: GameEngine<SketchState, SketchAction> = {
  createInitialState(config, rng) {
    const playerCount = config.slots.length;
    const pool = TARGETS.map((_, i) => i);
    return {
      playerCount,
      round: 0,
      turn: 0,
      targets: rng.shuffle(pool).slice(0, ROUNDS),
      scores: Array.from({ length: playerCount }, () => 0),
      attempts: [],
      phase: 'draw',
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'draw' || state.turn !== playerId) return [];
    return [{ type: 'submit' as const, strokes: [] }]; // shape only; any strokes pass validate
  },

  validate(state, action, playerId) {
    if (state.phase !== 'draw' || state.turn !== playerId) return false;
    if (action.type !== 'submit') return false;
    return (
      Array.isArray(action.strokes) &&
      action.strokes.every(
        (st) =>
          Array.isArray(st) &&
          st.length > 0 &&
          st.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])),
      )
    );
  },

  applyAction(state, action, playerId) {
    if (!sketchEngine.validate(state, action, playerId)) return state;

    const targetIdx = state.targets[state.round]!;
    const score = sketchScore(TARGETS[targetIdx]!.strokes, action.strokes);
    const scores = [...state.scores];
    scores[playerId]! += score;
    const attempts = [
      ...state.attempts,
      { player: playerId, round: state.round, targetIdx, strokes: action.strokes, score },
    ];

    let round = state.round;
    let turn = state.turn;
    let phase: SketchState['phase'] = 'draw';
    if (playerId === state.playerCount - 1) {
      round += 1;
      turn = 0;
      if (round >= ROUNDS) phase = 'over';
    } else {
      turn = playerId + 1;
    }

    return {
      ...state,
      round: Math.min(round, ROUNDS - 1),
      turn,
      scores,
      attempts,
      phase,
      lastEvent: { player: playerId, round: state.round, score },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'draw' || state.turn !== playerId) return null;
    const targetIdx = state.targets[state.round]!;
    return { type: 'submit', strokes: botStrokes(TARGETS[targetIdx]!.strokes, rng, difficulty) };
  },

  currentPlayers(state) {
    return state.phase === 'draw' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const best = Math.max(...state.scores);
    return state.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  },
};
