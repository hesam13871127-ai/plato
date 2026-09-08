import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { minesEngine, MW_MINES, MINE_PENALTY } from './engine';
import { MineScene } from './Board';
import { minesMeta } from './meta';

const ACCENTS = ['#38bdf8', '#fbbf24', '#c084fc', '#fb7185'];

export function MinesPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);

  const rt = useGameRuntime(minesEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      recordResult(won, winReward(config.slots));
      setReward(winReward(config.slots));
    },
  });
  const { state, dispatch } = rt;

  const actors = minesEngine.currentPlayers(state);
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';

  const last = state.lastEvent;
  const cleared = state.revealed.filter(Boolean).length;
  const total = state.w * state.h;
  const safeTotal = total - MW_MINES;

  const banner = (
    <TurnBanner
      text={
        state.phase === 'over'
          ? t('game.winner', { name: seatName(state.scores.indexOf(Math.max(...state.scores))) })
          : isMyTurn
            ? t('game.yourTurn')
            : t('game.turnOf', { name: seatName(state.turn) })
      }
      hint={
        last
          ? last.kind === 'mine'
            ? `💥 ${seatName(last.player)} −${MINE_PENALTY}`
            : `✅ ${seatName(last.player)} +${last.cells.length}`
          : `${t('game.minefield')}: ${MW_MINES} 💣 · ${cleared}/${safeTotal}`
      }
    />
  );

  return (
    <GameFrame
      meta={minesMeta}
      config={config}
      engine={minesEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => <>⭐ {state.scores[seat.id] ?? 0}</>}
      winnerSummary={state.scores.map((s, i) => `${seatName(i)} ${s}`).join(' · ')}
    >
      <GameCanvas camera={{ position: [0, 9.5, 7.2], fov: 44 }} minDistance={5} maxDistance={22} maxPolarAngle={1.2}>
        <MineScene
          state={state}
          seatColors={ACCENTS}
          interactive={isMyTurn}
          onReveal={(idx) => dispatch({ type: 'reveal', idx })}
        />
      </GameCanvas>
    </GameFrame>
  );
}
