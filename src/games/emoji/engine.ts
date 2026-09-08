import { makeQuizEngine } from '../_quiz/quiz';
import { PUZZLES } from './puzzles';

export type { QuizState } from '../_quiz/quiz';

/** 5 puzzles per player; a 4-seat table needs 20 ≤ 40 bank items. */
export const emojiEngine = makeQuizEngine(
  PUZZLES.map((q) => ({ optionCount: q.options.length, answer: q.answer })),
  {
  perPlayer: 5,
  botAccuracy: { easy: 0.35, medium: 0.7, hard: 0.95 },
});
