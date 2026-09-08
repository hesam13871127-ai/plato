import { useEffect, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { triviaEngine } from './engine';
import { QUESTIONS } from './questions';
import { TriviaStage } from './Board';
import { triviaMeta } from './meta';

const ACCENTS = ['#f59e0b', '#22d3ee', '#fb7185', '#a3e635'];
const LETTERS_FA = ['۱', '۲', '۳', '۴'];
const LETTERS = ['A', 'B', 'C', 'D'];

export function TriviaPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t, lang } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const tableSkin = useSkin(triviaMeta.skins, 'table');
  const felt = tableSkin.skin?.colors.felt ?? '#2b2350';

  const rt = useGameRuntime(triviaEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = triviaEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  const item = state.qi !== null ? QUESTIONS[state.qi] : null;
  const options = item && state.phase !== 'over' ? state.order.map((d) => item.options[d]![lang]) : [];
  const correctIdx = item ? state.order.indexOf(item.answer) : null;
  const reveal = state.phase === 'reveal';

  // humans auto-advance from the reveal screen after a beat
  const revealOwner = state.lastEvent?.player ?? null;
  useEffect(() => {
    if (state.phase !== 'reveal' || revealOwner === null) return;
    if (config.slots[revealOwner]?.kind !== 'human') return;
    const timer = setTimeout(() => dispatch({ type: 'next' }, revealOwner), 2400);
    return () => clearTimeout(timer);
  }, [state.phase, state.answered, revealOwner, config.slots, dispatch]);

  const banner = (
    <TurnBanner
      text={
        reveal
          ? state.lastEvent!.correct
            ? `✅ ${t('game.correct')} +${state.lastEvent!.gained}`
            : `❌ ${t('game.wrong')}`
          : isMyTurn
            ? t('game.yourTurn')
            : actor !== undefined
              ? t('game.turnOf', { name: seatName(actor) })
              : ''
      }
      hint={reveal ? undefined : item ? `${t('game.category')}: ${item.category[lang]}` : t('game.thinking')}
    />
  );

  const actions = (
    <div className="quiz-answers">
      {state.phase === 'ask' && isMyTurn && options.length > 0 && (
        <>
          {options.map((opt, i) => (
            <button key={i} className="qa-btn" onClick={() => dispatch({ type: 'answer', choice: i })}>
              <span className="qa-letter">{lang === 'fa' ? LETTERS_FA[i] : LETTERS[i]}</span>
              {opt}
            </button>
          ))}
        </>
      )}
      {reveal && config.slots[revealOwner ?? 0]?.kind === 'human' && (
        <Button variant="primary" onClick={() => dispatch({ type: 'next' }, revealOwner ?? 0)}>
          {t('game.next')} →
        </Button>
      )}
    </div>
  );

  return (
    <GameFrame
      meta={triviaMeta}
      config={config}
      engine={triviaEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => (
        <>
          ⭐ {state.scores[seat.id] ?? 0}
          {state.streaks[seat.id]! > 1 ? ` 🔥${state.streaks[seat.id]}` : ''}
        </>
      )}
      winnerSummary={`${t('game.round')}: ${Math.min(state.answered + 1, state.totalRounds)}/${state.totalRounds}`}
    >
      <GameCanvas camera={{ position: [0, 9.2, 11], fov: 46 }} minDistance={7} maxDistance={26} maxPolarAngle={1.25}>
        <TriviaStage
          state={state}
          lang={lang}
          accent={ACCENTS[actor ?? 0] ?? '#f59e0b'}
          felt={felt}
          onPick={(i) => dispatch({ type: 'answer', choice: i })}
          interactive={isMyTurn}
        />
      </GameCanvas>
    </GameFrame>
  );
}
