import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { connect4Engine } from './engine';
import { Connect4Board } from './Board';
import { connect4Meta } from './meta';

export function Connect4Play({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const pieceSkin = useSkin(connect4Meta.skins, 'pieces');
  const boardSkin = useSkin(connect4Meta.skins, 'board');

  const rt = useGameRuntime(connect4Engine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = connect4Engine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const myColor = viewer === 0 ? pieceSkin.skin.colors.p0 ?? '#ef4444' : pieceSkin.skin.colors.p1 ?? '#facc15';

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={isMyTurn ? t('game.dropCol') : t('game.thinking')}
    />
  );

  return (
    <GameFrame
      meta={connect4Meta}
      config={config}
      engine={connect4Engine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      reward={reward}
      renderChipExtra={() => <>{state.winner !== null ? '🏁' : ''}</>}
      winnerSummary={`${state.moves} moves`}
    >
      <GameCanvas
        camera={{ position: [0, 4.2, 14], fov: 40 }}
        target={[0, 3.4, 0]}
        minDistance={8}
        maxDistance={26}
        maxPolarAngle={1.35}
      >
        <Connect4Board
          state={state}
          pieceSkin={pieceSkin.skin}
          boardSkin={boardSkin.skin}
          interactive={isMyTurn}
          myColor={myColor}
          onDrop={(col) => rt.dispatch({ type: 'drop', col })}
        />
      </GameCanvas>
    </GameFrame>
  );
}
