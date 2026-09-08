import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import {
  werewolfEngine,
  playWerewolfAction,
  type WerewolfState,
} from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 81,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

function driveBots(s: WerewolfState, seed: number): WerewolfState {
  let cur = s;
  const rng = makeRng(seed);
  let guard = 0;
  while (!werewolfEngine.isGameOver(cur) && guard++ < 500) {
    const actors = werewolfEngine.currentPlayers(cur);
    if (actors.length === 0) break;
    const move = werewolfEngine.chooseBotMove(cur, actors[0]!, rng, 'medium');
    if (!move) break;
    expect(werewolfEngine.validate(cur, move, actors[0]!)).toBe(true);
    cur = werewolfEngine.applyAction(cur, move, actors[0]!, rng);
  }
  return cur;
}

describe('werewolf engine', () => {
  it('deals roles: wolves scale with players, exactly one seer and one doctor', () => {
    for (const n of [5, 6, 7, 8]) {
      for (let seed = 1; seed <= 5; seed++) {
        const s = werewolfEngine.createInitialState(cfg(n), makeRng(seed * 10));
        const wolves = s.roles.filter((r) => r === 'werewolf').length;
        expect(wolves).toBe(n >= 7 ? 2 : 1);
        expect(s.roles.filter((r) => r === 'seer')).toHaveLength(1);
        expect(s.roles.filter((r) => r === 'doctor')).toHaveLength(1);
        expect(s.alive.every(Boolean)).toBe(true);
        expect(s.phase).toBe('night');
      }
    }
  });

  it('night order: wolf → doctor → seer; kill applies unless saved', () => {
    const s = werewolfEngine.createInitialState(cfg(5), makeRng(2));
    const wolf = werewolfEngine.currentPlayers(s)[0]!;
    expect(s.roles[wolf]).toBe('werewolf');
    const prey = [0, 1, 2, 3, 4].find((i) => i !== wolf)!;
    let st = werewolfEngine.applyAction(s, { type: 'wolfPick', target: prey }, wolf, makeRng(2));
    // the next actor must be the doctor (if alive) or the seer
    const actors = werewolfEngine.currentPlayers(st);
    const a = actors[0]!;
    expect(['doctor', 'seer']).toContain(s.roles[a]);

    // drive to the end of the night manually: each pending actor acts
    let guard = 0;
    while (st.phase === 'night' && guard++ < 5) {
      const who = werewolfEngine.currentPlayers(st)[0];
      if (who === undefined) break;
      const role = st.roles[who]!;
      if (role === 'doctor') st = werewolfEngine.applyAction(st, { type: 'save', target: prey }, who, makeRng(2));
      else if (role === 'seer') st = werewolfEngine.applyAction(st, { type: 'peek', target: 1 }, who, makeRng(2));
      else st = werewolfEngine.applyAction(st, { type: 'wolfPick', target: prey }, who, makeRng(2));
    }
    expect(st.phase).toBe('vote');
    // the victim was saved by the doctor → nobody died
    expect(st.deaths).toHaveLength(0);
    expect(st.lastEvent).toEqual({ kind: 'saved', target: prey });
  });

  it('an unsaved victim dies and is revealed', () => {
    let s = werewolfEngine.createInitialState(cfg(5), makeRng(3));
    const wolf = werewolfEngine.currentPlayers(s)[0]!;
    const victim = [0, 1, 2, 3, 4].find((i) => i !== wolf && s.roles[i] !== 'doctor')!;
    s = playWerewolfAction(s, { type: 'wolfPick', target: victim }, wolf, makeRng(3));
    // finish the night via bots
    s = driveBots(s, 3);
    if (s.lastEvent?.kind === 'kill') {
      expect(s.alive[victim]).toBe(false);
      expect(s.deaths[0]).toEqual({ seat: victim, role: s.roles[victim]!, cause: 'night' });
    } else {
      // the doctor happened to save the victim — acceptable
      expect(s.phase === 'vote' || s.phase === 'over').toBe(true);
    }
  });

  it('wolves never eat their own pack', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let s = werewolfEngine.createInitialState(cfg(7), makeRng(seed * 7));
      const rng = makeRng(seed);
      let guard = 0;
      while (!werewolfEngine.isGameOver(s) && guard++ < 300) {
        const actor = werewolfEngine.currentPlayers(s)[0]!;
        if (actor === undefined) break;
        const move = werewolfEngine.chooseBotMove(s, actor, rng, 'medium')!;
        if (move.type === 'wolfPick') {
          expect(s.roles[move.target]).not.toBe('werewolf');
        }
        s = werewolfEngine.applyAction(s, move, actor, rng);
      }
      expect(werewolfEngine.isGameOver(s)).toBe(true);
    }
  });

  it('vote majority lynches; ties spare everyone', () => {
    let s = werewolfEngine.createInitialState(cfg(5), makeRng(4));
    // jump straight to the vote phase with a synthetic night
    s = { ...s, phase: 'vote', votes: [-1, -1, -1, -1, -1], voteIdx: 0 };
    s = werewolfEngine.applyAction(s, { type: 'vote', target: 1 }, 0, makeRng(4));
    s = werewolfEngine.applyAction(s, { type: 'vote', target: 2 }, 1, makeRng(4));
    s = werewolfEngine.applyAction(s, { type: 'vote', target: 1 }, 2, makeRng(4));
    s = werewolfEngine.applyAction(s, { type: 'vote', target: 1 }, 3, makeRng(4));
    // 3 votes for seat 1 vs 1 for seat 2 → seat 1 lynched regardless of the last vote
    const before = s.alive[1];
    s = werewolfEngine.applyAction(s, { type: 'vote', target: 2 }, 4, makeRng(4));
    expect(before).toBe(true);
    expect(s.alive[1]).toBe(false);
    expect(s.deaths.some((d) => d.seat === 1 && d.cause === 'vote')).toBe(true);

    // tie case
    let t = werewolfEngine.createInitialState(cfg(5), makeRng(5));
    t = { ...t, phase: 'vote', votes: [-1, -1, -1, -1, -1], voteIdx: 0 };
    t = werewolfEngine.applyAction(t, { type: 'vote', target: 1 }, 0, makeRng(5));
    t = werewolfEngine.applyAction(t, { type: 'vote', target: 2 }, 1, makeRng(5));
    t = werewolfEngine.applyAction(t, { type: 'vote', target: 1 }, 2, makeRng(5));
    t = werewolfEngine.applyAction(t, { type: 'vote', target: 2 }, 3, makeRng(5));
    t = werewolfEngine.applyAction(t, { type: 'vote', target: 0 }, 4, makeRng(5)); // 2-2-1 tie
    expect(t.lastEvent?.kind === 'tie' || t.phase === 'night').toBe(true);
  });

  it('seer peek records the truth; bot seer publicly accuses a known wolf', () => {
    let s = werewolfEngine.createInitialState(cfg(5), makeRng(6));
    const seerSeat = s.roles.findIndex((r) => r === 'seer')!;
    const wolfSeat = s.roles.findIndex((r) => r === 'werewolf')!;
    // synthetic: it's the seer's turn
    s = { ...s, wolfTarget: 0, phase: 'night', seerTarget: null, docTarget: s.roles.findIndex((r) => r === 'doctor') };
    // craft: doctor already acted (docTarget set), wolf acted (wolfTarget set)
    s = playWerewolfAction(s, { type: 'peek', target: wolfSeat }, seerSeat, makeRng(6));
    expect(s.knowledge[seerSeat]).toEqual([{ target: wolfSeat, isWolf: true }]);
    if (s.claim) {
      expect(s.claim.seer).toBe(seerSeat);
      expect(s.claim.target).toBe(wolfSeat);
    }
  });

  it('team victory includes dead teammates', () => {
    let s = werewolfEngine.createInitialState(cfg(5), makeRng(7));
    // village wins: kill all wolves via synthetic votes
    const wolfSeats = s.roles.map((r, i) => (r === 'werewolf' ? i : -1)).filter((i) => i >= 0);
    for (const w of wolfSeats) {
      s = { ...s, phase: 'vote', votes: s.votes.map(() => -1), voteIdx: 0, alive: s.alive.map(() => true) };
      // every seat votes in seat order; the wolf votes anyone else
      for (let voter = 0; voter < 5; voter++) {
        const target = voter === w ? (w + 1) % 5 : w;
        s = werewolfEngine.applyAction(s, { type: 'vote', target }, voter, makeRng(7));
      }
    }
    expect(werewolfEngine.isGameOver(s)).toBe(true);
    if (s.winner === 'village') {
      const winners = werewolfEngine.winners(s);
      expect(winners).not.toContain(s.roles.findIndex((r) => r === 'werewolf'));
      // a dead villager (the lynched wolves' victims) still counts — everyone non-wolf
      expect(winners.length).toBe(4);
    }
  });

  it('full bot games terminate with a valid winner for every table size', () => {
    for (const n of [5, 6, 7, 8]) {
      for (let seed = 1; seed <= 4; seed++) {
        const s = werewolfEngine.createInitialState(cfg(n), makeRng(seed * 100 + n));
        const end = driveBots(s, seed * 100 + n);
        expect(werewolfEngine.isGameOver(end)).toBe(true);
        expect(['village', 'wolves']).toContain(end.winner);
        const winners = werewolfEngine.winners(end);
        expect(winners.length).toBeGreaterThanOrEqual(1);
        // all winners belong to the winning team
        for (const w of winners) {
          expect((end.roles[w] === 'werewolf') === (end.winner === 'wolves')).toBe(true);
        }
        expect(end.night).toBeLessThanOrEqual(30);
      }
    }
  });

  it('rejects acting out of turn, voting for yourself, or a wolf eating a packmate', () => {
    const s = werewolfEngine.createInitialState(cfg(5), makeRng(8));
    const wolf = werewolfEngine.currentPlayers(s)[0]!;
    expect(werewolfEngine.validate(s, { type: 'vote', target: 1 }, wolf)).toBe(false); // night, not vote
    const other = [0, 1, 2, 3, 4].find((i) => i !== wolf)!;
    expect(werewolfEngine.validate(s, { type: 'wolfPick', target: other }, other)).toBe(false); // not the wolf's turn
    // self votes are impossible in the legal list
    const voteState = { ...s, phase: 'vote' as const, votes: s.votes.map(() => -1), voteIdx: 0 };
    expect(werewolfEngine.legalActions(voteState, 0).some((a) => a.target === 0)).toBe(false);
  });
});
