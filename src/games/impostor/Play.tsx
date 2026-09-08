import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { impostorEngine } from './engine';
import { WORDS } from './words';
import { ImpostorTable } from './Board';
import { impostorMeta } from './meta';

const ACCENTS = ['#8b5cf6', '#22d3ee', '#f59e0b', '#fb7185', '#a3e635', '#38bdf8'];

export function ImpostorPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t, lang } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);

  const rt = useGameRuntime(impostorEngine, config, {
    botDelayMs: 1000,
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = impostorEngine.currentPlayers(state);
  const actor = actors[0] ?? null;
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const isMyAction = actor === viewer && config.slots[viewer]?.kind === 'human';

  const roundImpostor = state.impostors[state.round] ?? 0;
  const iAmImpostor = roundImpostor === viewer;
  const word = WORDS[state.words[state.round] ?? 0]!;
  const legal = impostorEngine.legalActions(state, viewer);

  const narration = (): string => {
    const e = state.lastEvent;
    if (!e) return '';
    switch (e.kind) {
      case 'round':
        return `${t('game.round')} ${e.round + 1}`;
      case 'accused':
        return e.correct
          ? `🎣 ${t('game.impostorCaught')}`
          : `😅 ${seatName(e.target)} — ${t('game.impostorSurvived')}`;
      case 'survived':
        return `🕶️ ${t('game.impostorSurvived')}`;
      case 'guess':
        return e.correct
          ? `🎯 ${seatName(e.impostor)} ${t('game.guessWord')} (+3)`
          : `❌ ${seatName(e.impostor)} — ${t('game.impostorCaught')}`;
      default:
        return '';
    }
  };

  const banner = (
    <TurnBanner
      text={
        state.phase === 'over'
          ? `${impostorEngine.winners(state).map(seatName).join(' · ')} 🏆`
          : isMyAction
            ? t('game.yourTurn')
            : actor !== null
              ? t('game.turnOf', { name: seatName(actor) })
              : ''
      }
      hint={
        state.phase === 'clue'
          ? isMyAction
            ? iAmImpostor
              ? `🕶️ ${t('game.youAreImpostor')} — ${t('game.pickClue')}`
              : `${t('game.yourWord')}: ${word.name[lang]} — ${t('game.pickClue')}`
            : narration()
          : state.phase === 'vote'
            ? isMyAction
              ? t('game.accuse')
              : narration()
            : state.phase === 'guess'
              ? isMyAction
                ? `🎯 ${t('game.guessWord')}`
                : narration()
              : narration()
      }
    />
  );

  const actions = (
    <div className="ww-targets">
      {state.phase === 'clue' && isMyAction &&
        state.options[state.round]![viewer]!.map((clue, idx) => (
          <button key={idx} className="t-btn" onClick={() => dispatch({ type: 'clue', idx })}>
            💬 {clue[lang]}
          </button>
        ))}
      {state.phase === 'vote' && isMyAction &&
        legal
          .filter((a): a is Extract<typeof a, { type: 'vote' }> => a.type === 'vote')
          .map((a) => (
            <button key={a.target} className="t-btn" onClick={() => dispatch({ type: 'vote', target: a.target })}>
              🤔 {seatName(a.target)}
            </button>
          ))}
      {state.phase === 'guess' && isMyAction &&
        state.guessOptions[state.round]!.map((w, idx) => (
          <button key={idx} className="t-btn" onClick={() => dispatch({ type: 'guess', idx })}>
            {WORDS[w]!.name[lang]}
          </button>
        ))}
    </div>
  );

  return (
    <GameFrame
      meta={impostorMeta}
      config={config}
      engine={impostorEngine}
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
      renderChipExtra={(seat) => <>⭐ {state.scores[seat.id] ?? 0}</>}
      winnerSummary={`${t('game.round')} ${state.round + 1}/${state.playerCount} · ${narration()}`}
    >
      <GameCanvas camera={{ position: [0, 9.4, 10.6], fov: 46 }} minDistance={6} maxDistance={26} maxPolarAngle={1.3}>
        <ImpostorTable state={state} names={config.slots.map((s) => s.name)} accents={ACCENTS} lang={lang} />
      </GameCanvas>

      <div className="ww-role-card">
        <span className="r-title">{t('game.yourRole')}</span>
        {iAmImpostor ? (
          <span className="r-name" style={{ color: '#fb7185' }}>🕶️ {t('game.youAreImpostor')}</span>
        ) : (
          <>
            <span className="r-title">{t('game.yourWord')}</span>
            <span className="r-name" style={{ color: '#a3e635' }}>{word.name[lang]}</span>
          </>
        )}
        <span className="r-note">
          {t('game.round')} {state.round + 1}/{state.playerCount} — {narration()}
        </span>
      </div>
    </GameFrame>
  );
}
