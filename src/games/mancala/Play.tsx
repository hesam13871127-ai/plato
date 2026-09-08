import { useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { STORE_P0, STORE_P1, mancalaEngine } from './engine';
import { MANCALA_SEAT_COLORS, MancalaBoard } from './Board';
import { mancalaMeta } from './meta';

export function MancalaPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const boardSkin = useSkin(mancalaMeta.skins, 'board');

  const rt = useGameRuntime(mancalaEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = mancalaEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  const pickable = useMemo(() => {
    if (!isMyTurn) return [];
    return mancalaEngine
      .legalActions(state, viewer)
      .map((a) => (a.type === 'sow' ? a.pit : -1))
      .filter((p) => p >= 0);
  }, [state, viewer, isMyTurn]);

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={isMyTurn ? t('game.pickPit') : state.lastEvent?.extraTurn ? `↻ ${seatName(state.lastEvent.player)}` : t('game.thinking')}
    />
  );

  return (
    <GameFrame
      meta={mancalaMeta}
      config={config}
      engine={mancalaEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      reward={reward}
      seatColors={MANCALA_SEAT_COLORS}
      renderChipExtra={(seat) => <>🏺 {state.pits[seat.id === 0 ? STORE_P0 : STORE_P1]}</>}
      winnerSummary={config.slots
        .map((s) => `${s.name}: ${state.pits[s.id === 0 ? STORE_P0 : STORE_P1]}`)
        .join(' · ')}
    >
      <GameCanvas camera={{ position: [0, 9.5, 7.5], fov: 44 }} minDistance={7} maxDistance={24} maxPolarAngle={1.25}>
        <MancalaBoard
          state={state}
          boardSkin={boardSkin.skin}
          pickable={pickable}
          onPit={(pit) => rt.dispatch({ type: 'sow', pit })}
        />
      </GameCanvas>
    </GameFrame>
  );
}
