import { makeQuizEngine, type QuizState } from '../_quiz/quiz';
import { QUESTIONS } from './questions';

export type { QuizState } from '../_quiz/quiz';

/** 6 questions per player; a 4-seat table needs 24 ≤ 44 bank items. */
export const triviaEngine = makeQuizEngine(
  QUESTIONS.map((q) => ({ optionCount: q.options.length, answer: q.answer })),
  { perPlayer: 6 });
