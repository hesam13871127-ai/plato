import type { ReactNode } from 'react';
import { QuizStage } from '../_quiz/stage';
import type { QuizState } from '../_quiz/quiz';
import { QUESTIONS } from './questions';

export function TriviaStage({
  state,
  lang,
  accent,
  felt,
  onPick,
  interactive,
}: {
  state: QuizState;
  lang: 'fa' | 'en';
  accent: string;
  felt: string;
  onPick: (i: number) => void;
  interactive: boolean;
}): ReactNode {
  const item = state.qi !== null ? QUESTIONS[state.qi] : null;
  const prompt = item ? item.q[lang] : '…';
  const sub = item ? item.category[lang] : undefined;
  const options =
    item && state.phase !== 'over' ? state.order.map((dataIdx) => item.options[dataIdx]![lang]) : ['…', '…', '…', '…'];
  const correctIdx = item ? state.order.indexOf(item.answer) : null;
  const reveal = state.phase === 'reveal';
  return (
    <QuizStage
      prompt={prompt}
      sub={sub}
      lang={lang}
      options={options}
      picked={reveal ? state.lastEvent!.choice : null}
      correctIdx={reveal ? correctIdx : null}
      reveal={reveal}
      accent={accent}
      felt={felt}
      onPick={onPick}
      interactive={interactive}
    />
  );
}
