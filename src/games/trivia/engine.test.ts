import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { triviaEngine } from './engine';
import { QUESTIONS } from './questions';

function cfg(n: number): GameConfig {
  return {
    seed: 11,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

/** drive one full question: correct answer + next */
function answerCorrect(s: ReturnType<typeof triviaEngine.createInitialState>, player: number) {
  const qi = s.qi!;
  const item = QUESTIONS[qi]!;
  const display = s.order.indexOf(item.answer);
  return triviaEngine.applyAction(s, { type: 'answer', choice: display }, player, makeRng(1));
}

describe('trivia engine', () => {
  it('sets up a shuffled deck covering exactly the rounds needed', () => {
    const s = triviaEngine.createInitialState(cfg(2), makeRng(5));
    expect(s.totalRounds).toBe(12);
    expect(s.deck.length + 1).toBe(QUESTIONS.length); // one already drawn
    expect(s.scores).toEqual([0, 0]);
    expect(s.phase).toBe('ask');
    expect(s.qi).not.toBeNull();
    expect(s.order).toHaveLength(4);
  });

  it('scores a correct answer 10 and builds a streak bonus', () => {
    let s = triviaEngine.createInitialState(cfg(2), makeRng(5));
    s = answerCorrect(s, 0);
    expect(s.phase).toBe('reveal');
    expect(s.lastEvent?.correct).toBe(true);
    expect(s.lastEvent?.gained).toBe(10);
    expect(s.scores[0]).toBe(10);

    s = triviaEngine.applyAction(s, { type: 'next' }, 0, makeRng(1));
    expect(s.phase).toBe('ask');
    expect(s.turn).toBe(1);
    s = triviaEngine.applyAction(s, { type: 'answer', choice: s.order.indexOf(QUESTIONS[s.qi!]!.answer) }, 1, makeRng(1));
    s = triviaEngine.applyAction(s, { type: 'next' }, 1, makeRng(1));
    s = answerCorrect(s, 0); // second correct in a row → 10 + 1×2
    expect(s.scores[0]).toBe(22);
  });

  it('a wrong answer scores nothing and resets the streak', () => {
    let s = triviaEngine.createInitialState(cfg(2), makeRng(5));
    s = answerCorrect(s, 0);
    s = triviaEngine.applyAction(s, { type: 'next' }, 0, makeRng(1));
    // player 1 answers wrong (any display index that is not the correct one)
    const item = QUESTIONS[s.qi!]!;
    const wrongIdx = [0, 1, 2, 3].find((i) => i !== s.order.indexOf(item.answer))!;
    s = triviaEngine.applyAction(s, { type: 'answer', choice: wrongIdx }, 1, makeRng(1));
    expect(s.lastEvent?.correct).toBe(false);
    expect(s.lastEvent?.gained).toBe(0);
    expect(s.scores[1]).toBe(0);
    expect(s.streaks[1]).toBe(0);
  });

  it('never repeats a question within a game', () => {
    let s = triviaEngine.createInitialState(cfg(2), makeRng(9));
    const seen = new Set<number>();
    while (!triviaEngine.isGameOver(s)) {
      if (s.phase === 'ask') {
        expect(seen.has(s.qi!)).toBe(false);
        seen.add(s.qi!);
        const item = QUESTIONS[s.qi!]!;
        s = triviaEngine.applyAction(s, { type: 'answer', choice: s.order.indexOf(item.answer) }, s.turn, makeRng(1));
      } else {
        s = triviaEngine.applyAction(s, { type: 'next' }, s.lastEvent!.player, makeRng(1));
      }
    }
    expect(seen.size).toBe(12);
  });

  it('ends after every player answered perPlayer times and elects the top scorer', () => {
    let s = triviaEngine.createInitialState(cfg(2), makeRng(5));
    // player 0 always right, player 1 always wrong
    while (!triviaEngine.isGameOver(s)) {
      if (s.phase === 'ask') {
        const item = QUESTIONS[s.qi!]!;
        const correct = s.order.indexOf(item.answer);
        const choice = s.turn === 0 ? correct : (correct + 1) % 4;
        s = triviaEngine.applyAction(s, { type: 'answer', choice }, s.turn, makeRng(1));
      } else {
        s = triviaEngine.applyAction(s, { type: 'next' }, s.lastEvent!.player, makeRng(1));
      }
    }
    expect(s.answered).toBe(12);
    expect(s.scores[0]).toBeGreaterThan(s.scores[1]);
    expect(triviaEngine.winners(s)).toEqual([0]);
  });

  it('rejects answering out of turn or in the reveal phase', () => {
    const s = triviaEngine.createInitialState(cfg(2), makeRng(5));
    expect(triviaEngine.validate(s, { type: 'answer', choice: 0 }, 1)).toBe(false);
    const revealed = triviaEngine.applyAction(s, { type: 'answer', choice: 0 }, 0, makeRng(1));
    expect(triviaEngine.validate(revealed, { type: 'answer', choice: 1 }, 1)).toBe(false);
    expect(triviaEngine.validate(revealed, { type: 'next' }, 0)).toBe(true);
  });

  it('hard bots answer correctly far more often than chance', () => {
    const s = triviaEngine.createInitialState(cfg(2), makeRng(5));
    const rng = makeRng(42);
    let right = 0;
    for (let i = 0; i < 50; i++) {
      const st = triviaEngine.createInitialState(cfg(2), makeRng(i + 1));
      const move = triviaEngine.chooseBotMove(st, 0, rng, 'hard') as { type: string; choice: number };
      const item = QUESTIONS[st.qi!]!;
      if (move.type === 'answer' && move.choice === st.order.indexOf(item.answer)) right++;
    }
    expect(right).toBeGreaterThanOrEqual(40);
  });

  it('bank stays healthy: 4 options, valid answer index, no empty text', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(40);
    for (const q of QUESTIONS) {
      expect(q.options).toHaveLength(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(q.q.fa.length).toBeGreaterThan(3);
      expect(q.q.en.length).toBeGreaterThan(3);
      for (const o of q.options) {
        expect(o.fa.length).toBeGreaterThan(0);
        expect(o.en.length).toBeGreaterThan(0);
      }
    }
  });
});
