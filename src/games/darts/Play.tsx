import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { dartsEngine, START_SCORE } from './engine';
import { Dartboard } from './Board';
import { dartsMeta } from './meta';

const ACCENTS = ['#fb7185', '#38bdf8', '#fbbf24', '#c084fc'];

export function DartsPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);

  const rt = useGameRuntime(dartsEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = dartsEngine.currentPlayers(state);
  const actor = actors[0] ?? null;
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const isMyTurn = actor === viewer && config.slots[viewer]?.kind === 'human';

  const lastHit = state.lastEvent?.hit.label ?? '—';
  const bust = state.lastEvent?.bust === true;

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== null ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        isMyTurn
          ? `${t('game.aimThrow')} · ${t('game.darts')}: ${'🎯'.repeat(state.dartsLeft)}`
          : state.lastEvent
            ? bust
              ? `💥 ${t('game.bust')}`
              : `${seatName(state.lastEvent.player)}: ${state.lastEvent.hit.label}`
            : t('game.thinking')
      }
    />
  );

  return (
    <GameFrame
      meta={dartsMeta}
      config={config}
      engine={dartsEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => <>🎯 {START_SCORE - (state.scores[seat.id] ?? 0)}</>}
      winnerSummary={null}
    >
      <GameCanvas camera={{ position: [0, 0.4, 4.6], fov: 44 }} minDistance={2.4} maxDistance={12} maxPolarAngle={Math.PI / 2 + 0.35}>
        <Dartboard
          darts={state.turnDarts}
          freshIdx={state.turnDarts.length > 0 ? state.turnDarts.length - 1 : null}
          accent={ACCENTS[actor ?? 0] ?? '#fb7185'}
          interactive={isMyTurn && state.phase === 'throw'}
          onThrow={(x, y) => dispatch({ type: 'throw', x, y })}
        />
      </GameCanvas>

      <div className="darts-score">
        {state.scores.map((s, i) => (
          <div key={i} className={`row ${i === actor ? 'on' : ''}`}>
            <span>{seatName(i)}</span>
            <span>{s}</span>
          </div>
        ))}
        <div className="big">
          {state.phase === 'over' ? '🏁' : lastHit === '—' ? '🎯' : bust ? '💥' : lastHit}
        </div>
        <div className="row">
          <span>{t('game.darts')}</span>
          <span>{'●'.repeat(state.dartsLeft)}{'○'.repeat(3 - state.dartsLeft)}</span>
        </div>
      </div>
    </GameFrame>
  );
}
