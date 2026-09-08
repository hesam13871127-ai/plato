import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Werewolf vs bots. Roles are dealt secretly; night steps run in a fixed
 * order (wolves → doctor → seer), then the village votes. Hidden info lives
 * in the state (roles, seer knowledge) — the UI only shows the viewer's
 * perspective. Team victory: dead teammates win too.
 */

export type WolfRole = 'werewolf' | 'seer' | 'doctor' | 'villager';

export type WolfEvent =
  | { kind: 'night'; night: number }
  | { kind: 'kill'; target: number; role: WolfRole }
  | { kind: 'saved'; target: number }
  | { kind: 'quiet-night' }
  | { kind: 'lynch'; target: number; role: WolfRole; votes: Record<number, number> }
  | { kind: 'tie' }
  | { kind: 'peek'; target: number; isWolf: boolean }
  | { kind: 'claim'; seer: number; target: number }
  | { kind: 'gameover'; winner: 'village' | 'wolves' };

export interface WerewolfState {
  playerCount: number;
  roles: WolfRole[];
  alive: boolean[];
  night: number; // 1-based
  phase: 'night' | 'vote' | 'over';
  wolfTarget: number | null;
  docTarget: number | null;
  seerTarget: number | null;
  /** knowledge[player] = peek results (only the seer's list is meaningful) */
  knowledge: { target: number; isWolf: boolean }[][];
  votes: number[]; // -1 = not cast
  voteIdx: number; // whose vote is expected (index into alive order)
  suspicion: number[][]; // [voter][target] bot gut feeling
  claim: { seer: number; target: number } | null; // public seer accusation
  deaths: { seat: number; role: WolfRole; cause: 'night' | 'vote' }[];
  lastEvent: WolfEvent | null;
  winner: 'village' | 'wolves' | null;
}

export type WerewolfAction =
  | { type: 'wolfPick'; target: number }
  | { type: 'save'; target: number }
  | { type: 'peek'; target: number }
  | { type: 'vote'; target: number };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function wolfCountFor(n: number): number {
  return n >= 7 ? 2 : 1;
}

function aliveSeats(state: { alive: boolean[] }): number[] {
  return state.alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
}

function firstAliveWolf(state: WerewolfState): number {
  return aliveSeats(state).find((i) => state.roles[i] === 'werewolf') ?? -1;
}

function pendingNightActor(state: WerewolfState): { seat: number; action: WerewolfAction['type'] } | null {
  if (state.phase !== 'night') return null;
  if (state.wolfTarget === null) {
    const w = firstAliveWolf(state);
    return w >= 0 ? { seat: w, action: 'wolfPick' } : null;
  }
  const doc = state.roles.findIndex((r, i) => r === 'doctor' && state.alive[i]);
  if (doc >= 0 && state.docTarget === null) return { seat: doc, action: 'save' };
  const seer = state.roles.findIndex((r, i) => r === 'seer' && state.alive[i]);
  if (seer >= 0 && state.seerTarget === null) return { seat: seer, action: 'peek' };
  return null; // night complete → must have been resolved inside applyAction
}

function teamCounts(state: WerewolfState): { wolves: number; others: number } {
  let wolves = 0;
  let others = 0;
  for (let i = 0; i < state.playerCount; i++) {
    if (!state.alive[i]) continue;
    if (state.roles[i] === 'werewolf') wolves++;
    else others++;
  }
  return { wolves, others };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const werewolfEngine: GameEngine<WerewolfState, WerewolfAction> = {
  createInitialState(config, rng) {
    const n = config.slots.length;
    const roles: WolfRole[] = Array.from({ length: n }, () => 'villager');
    const specials: WolfRole[] = [
      ...Array.from({ length: wolfCountFor(n) }, () => 'werewolf' as WolfRole),
      'seer',
      'doctor',
    ];
    const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    specials.forEach((role, k) => {
      roles[order[k]!] = role;
    });

    const state: WerewolfState = {
      playerCount: n,
      roles,
      alive: Array.from({ length: n }, () => true),
      night: 1,
      phase: 'night',
      wolfTarget: null,
      docTarget: null,
      seerTarget: null,
      knowledge: Array.from({ length: n }, () => []),
      votes: Array.from({ length: n }, () => -1),
      voteIdx: 0,
      suspicion: Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? -Infinity : rng.next() * 2 - 0.5)),
      ),
      claim: null,
      deaths: [],
      lastEvent: { kind: 'night', night: 1 },
      winner: null,
    };
    return state;
  },

  legalActions(state, playerId) {
    if (state.phase === 'vote') {
      const order = aliveSeats(state);
      if (order[state.voteIdx] !== playerId) return [];
      return aliveSeats(state)
        .filter((t) => t !== playerId)
        .map((target) => ({ type: 'vote' as const, target }));
    }
    const pending = pendingNightActor(state);
    if (!pending || pending.seat !== playerId) return [];
    const targets = aliveSeats(state);
    if (pending.action === 'wolfPick') {
      return targets.filter((t) => t !== playerId).map((target) => ({ type: 'wolfPick' as const, target }));
    }
    if (pending.action === 'save') {
      return targets.map((target) => ({ type: 'save' as const, target }));
    }
    return targets.filter((t) => t !== playerId).map((target) => ({ type: 'peek' as const, target }));
  },

  validate(state, action, playerId) {
    const legal = werewolfEngine.legalActions(state, playerId);
    return legal.some((a) => a.type === action.type && a.target === action.target);
  },

  applyAction(state, action, playerId, rng) {
    void rng; // resolution is deterministic; kept for the engine interface
    if (!werewolfEngine.validate(state, action, playerId)) return state;
    const target = action.target;

    if (action.type === 'wolfPick') {
      return resolveNightIfDone({ ...state, wolfTarget: target }, rng);
    }
    if (action.type === 'save') {
      return resolveNightIfDone({ ...state, docTarget: target }, rng);
    }
    if (action.type === 'peek') {
      const knowledge = state.knowledge.map((k) => [...k]);
      const isWolf = state.roles[target] === 'werewolf';
      if (!knowledge[playerId]!.some((k) => k.target === target)) {
        knowledge[playerId] = [...knowledge[playerId]!, { target, isWolf }];
      }
      return resolveNightIfDone(
        { ...state, seerTarget: target, knowledge, lastEvent: { kind: 'peek', target, isWolf } },
        rng,
      );
    }

    // ---- vote ----
    const votes = [...state.votes];
    votes[playerId] = target;
    const order = aliveSeats(state);
    const isLastVote = state.voteIdx >= order.length - 1;

    if (!isLastVote) {
      return { ...state, votes, voteIdx: state.voteIdx + 1 };
    }

    // tally
    const tally = new Map<number, number>();
    for (const v of votes) {
      if (v >= 0) tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    const sorted = [...tally.entries()].sort((a, b) => b[1]! - a[1]!);
    const top = sorted[0];
    const second = sorted[1];
    let lynched: number | null = null;
    if (top && (!second || top[1]! > second[1]!)) lynched = top[0]!;

    let next: WerewolfState = {
      ...state,
      votes,
      suspicion: state.suspicion.map((row) => [...row]),
    };

    if (lynched === null) {
      next = { ...next, lastEvent: { kind: 'tie' } };
    } else {
      const role = state.roles[lynched]!;
      const deaths = [...state.deaths, { seat: lynched, role, cause: 'vote' as const }];
      const alive = [...state.alive];
      alive[lynched] = false;
      // re-read the wolf's role from the ORIGINAL roles (reveal) for suspicion updates
      const wasWolf = role === 'werewolf';
      for (let u = 0; u < state.playerCount; u++) {
        if (u === lynched) continue;
        for (let v = 0; v < state.playerCount; v++) {
          if (v === u || v === lynched) continue;
          if (votes[v] === undefined || votes[v]! < 0) continue;
          const votedForLynched = votes[v] === lynched;
          const delta = wasWolf ? (votedForLynched ? -1.6 : 1.2) : votedForLynched ? 0.8 : -0.4;
          next.suspicion[u] = next.suspicion[u]!.map((s, t) => (t === v ? s + delta : s));
        }
      }
      next = {
        ...next,
        alive,
        deaths,
        lastEvent: { kind: 'lynch', target: lynched, role, votes: Object.fromEntries(votes.map((v, i) => [i, v])) },
      };
    }

    // win check after the lynch
    const afterLynch = teamCounts(next);
    if (afterLynch.wolves === 0) {
      return { ...next, phase: 'over', winner: 'village', lastEvent: { kind: 'gameover', winner: 'village' } };
    }
    if (afterLynch.wolves >= afterLynch.others) {
      return { ...next, phase: 'over', winner: 'wolves', lastEvent: { kind: 'gameover', winner: 'wolves' } };
    }

    // next night
    return {
      ...next,
      phase: 'night',
      night: state.night + 1,
      wolfTarget: null,
      docTarget: null,
      seerTarget: null,
      votes: state.votes.map(() => -1),
      voteIdx: 0,
      lastEvent: { kind: 'night', night: state.night + 1 },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const pending = pendingNightActor(state);
    const alive = aliveSeats(state);

    if (state.phase === 'night' && pending?.seat === playerId) {
      if (pending.action === 'wolfPick') {
        const prey = alive.filter((t) => state.roles[t] !== 'werewolf' && t !== playerId);
        if (prey.length === 0) return null;
        // eat the public seer claimant if alive, else a random villager-side seat
        if (state.claim && alive.includes(state.claim.seer) && prey.includes(state.claim.seer)) {
          return { type: 'wolfPick', target: state.claim.seer };
        }
        return { type: 'wolfPick', target: rng.pick(prey) };
      }
      if (pending.action === 'save') {
        if (state.claim && alive.includes(state.claim.seer) && rng.next() < 0.65) {
          return { type: 'save', target: state.claim.seer };
        }
        if (rng.next() < 0.4) return { type: 'save', target: playerId };
        return { type: 'save', target: rng.pick(alive) };
      }
      // seer: peek the most suspicious unknown seat
      const known = new Set(state.knowledge[playerId]!.map((k) => k.target));
      const unknown = alive.filter((t) => t !== playerId && !known.has(t));
      if (unknown.length === 0) return { type: 'peek', target: rng.pick(alive.filter((t) => t !== playerId)) };
      unknown.sort((a, b) => (state.suspicion[playerId]![b] ?? 0) - (state.suspicion[playerId]![a] ?? 0));
      return { type: 'peek', target: unknown[0]! };
    }

    if (state.phase === 'vote') {
      const order = aliveSeats(state);
      if (order[state.voteIdx] !== playerId) return null;
      const others = alive.filter((t) => t !== playerId);

      // wolves frame the most suspicious non-wolf
      if (state.roles[playerId] === 'werewolf') {
        const prey = others.filter((t) => state.roles[t] !== 'werewolf');
        if (prey.length > 0) {
          prey.sort((a, b) => (state.suspicion[playerId]![b] ?? 0) - (state.suspicion[playerId]![a] ?? 0));
          return { type: 'vote', target: prey[0]! };
        }
      }
      // a bot seer that KNOWS a living wolf accuses it publicly
      const knownWolf = state.knowledge[playerId]!.find((k) => k.isWolf && state.alive[k.target]);
      if (knownWolf) return { type: 'vote', target: knownWolf.target };
      // follow the public accusation most of the time
      if (state.claim && state.alive[state.claim.target] && state.claim.target !== playerId && rng.next() < 0.7) {
        return { type: 'vote', target: state.claim.target };
      }
      const sorted = [...others].sort(
        (a, b) => (state.suspicion[playerId]![b] ?? 0) - (state.suspicion[playerId]![a] ?? 0),
      );
      return { type: 'vote', target: sorted[0]! };
    }
    return null;
  },

  currentPlayers(state) {
    if (state.phase === 'vote') {
      const order = aliveSeats(state);
      return order[state.voteIdx] !== undefined ? [order[state.voteIdx]!] : [];
    }
    const pending = pendingNightActor(state);
    return pending ? [pending.seat] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over' || !state.winner) return [];
    const team: number[] = [];
    for (let i = 0; i < state.playerCount; i++) {
      const isWolf = state.roles[i] === 'werewolf';
      if ((state.winner === 'wolves') === isWolf) team.push(i);
    }
    return team;
  },
};

/* ------------------------------------------------------------------ */
/* Night resolution — every applyAction runs the pending night steps   */
/* through this, so a completed night never leaves the engine without  */
/* an actor (which would deadlock the runtime).                        */
/* ------------------------------------------------------------------ */

/**
 * Resolve a completed night (all pending steps answered): apply the kill,
 * let a bot seer's public accusation surface, and open the vote.
 */
export function resolveNightIfDone(state: WerewolfState, rng: RNG): WerewolfState {
  if (state.phase !== 'night') return state;
  if (pendingNightActor(state) !== null) return state;

  let next: WerewolfState = { ...state, suspicion: state.suspicion.map((r) => [...r]) };

  // a BOT seer that knows a living wolf makes a public claim
  const seerSeat = state.roles.findIndex((r, i) => r === 'seer');
  if (seerSeat >= 0 && !state.claim) {
    const knownWolf = state.knowledge[seerSeat]!.find((k) => k.isWolf && state.alive[k.target]);
    if (knownWolf && state.alive[seerSeat]) {
      next = { ...next, claim: { seer: seerSeat, target: knownWolf.target } };
    }
  }

  const victim = state.wolfTarget !== null && state.wolfTarget !== state.docTarget ? state.wolfTarget : null;
  let deaths = state.deaths;
  let alive = state.alive;
  let lastEvent: WolfEvent;
  if (victim === null) {
    lastEvent =
      state.wolfTarget !== null && state.wolfTarget === state.docTarget
        ? { kind: 'saved', target: state.wolfTarget }
        : { kind: 'quiet-night' };
  } else {
    const role = state.roles[victim]!;
    deaths = [...deaths, { seat: victim, role, cause: 'night' as const }];
    alive = [...state.alive];
    alive[victim] = false;
    lastEvent = { kind: 'kill', target: victim, role };
  }
  next = { ...next, deaths, alive, lastEvent };

  const counts = teamCounts(next);
  if (counts.wolves === 0) {
    return { ...next, phase: 'over', winner: 'village' };
  }
  if (counts.wolves >= counts.others) {
    return { ...next, phase: 'over', winner: 'wolves' };
  }

  return {
    ...next,
    phase: 'vote',
    votes: state.votes.map(() => -1),
    voteIdx: 0,
  };
}

/** wrapper the tests/UI use to keep every engine action auto-resolving */
export function playWerewolfAction(
  state: WerewolfState,
  action: WerewolfAction,
  playerId: number,
  rng: RNG,
): WerewolfState {
  const after = werewolfEngine.applyAction(state, action, playerId, rng);
  return resolveNightIfDone(after, rng);
}

export { aliveSeats as werewolfAliveSeats, firstAliveWolf, pendingNightActor };
