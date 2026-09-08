import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { reversiEngine } from './engine';
import { ReversiScene } from './Board';
import { reversiMeta } from './meta';

const ACCENTS = ['#57534e', '#f4f4f5'];

export function ReversiPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const boardSkin = useSkin(reversiMeta.skins, 'board');

  const rt = useGameRuntime(reversiEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = reversiEngine.currentPlayers(state);
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';

  const dark = state.board.filter((c) => c === 1).length;
  const light = state.board.filter((c) => c === 2).length;
  const passed = state.lastEvent === null && state.board.some((c) => c !== 0);
  void passed;

  const banner = (
    <TurnBanner
      text={
        state.phase === 'over'
          ? dark === light
            ? t('game.draw')
            : t('game.winner', { name: seatName(dark > light ? 0 : 1) })
          : isMyTurn
            ? t('game.yourTurn')
            : t('game.turnOf', { name: seatName(state.turn) })
      }
      hint={
        state.phase === 'over'
          ? `⚫ ${dark} — ${light} ⚪`
          : `⚫ ${dark} — ${light} ⚪`
      }
    />
  );

  return (
    <GameFrame
      meta={reversiMeta}
      config={config}
      engine={reversiEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => <>⚫ {(seat.id === 0 ? dark : light)}</>}
      winnerSummary={`⚫ ${dark} — ${light} ⚪`}
    >
      <GameCanvas camera={{ position: [0, 8.2, 6.4], fov: 46 }} minDistance={4} maxDistance={18} maxPolarAngle={1.25}>
        <ReversiScene
          board={state.board}
          turn={state.turn}
          lastEvent={state.lastEvent}
          interactive={isMyTurn && state.phase === 'play'}
          onMove={(idx) => dispatch({ type: 'move', idx })}
          boardColor={boardSkin.skin?.colors.base ?? '#166534'}
          lineColor={boardSkin.skin?.colors.rim ?? '#3f2d20'}
          accent={ACCENTS[state.turn] ?? '#57534e'}
        />
      </GameCanvas>
    </GameFrame>
  );
}
