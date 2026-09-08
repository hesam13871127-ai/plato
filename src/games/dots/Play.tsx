import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { dotsEngine } from './engine';
import { DOTS_PLAYER_COLORS, DotsBoard } from './Board';
import { dotsMeta } from './meta';

export function DotsPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const boardSkin = useSkin(dotsMeta.skins, 'board');

  const rt = useGameRuntime(dotsEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = dotsEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={isMyTurn ? t('game.drawLine') : t('game.thinking')}
    />
  );

  return (
    <GameFrame
      meta={dotsMeta}
      config={config}
      engine={dotsEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      reward={reward}
      seatColors={DOTS_PLAYER_COLORS}
      renderChipExtra={(seat) => <>📦 {state.scores[seat.id] ?? 0}</>}
      winnerSummary={config.slots.map((s) => `${s.name}: ${state.scores[s.id] ?? 0}`).join(' · ')}
    >
      <GameCanvas camera={{ position: [0, 9, 7.5], fov: 44 }} minDistance={5} maxDistance={22} maxPolarAngle={1.3}>
        <DotsBoard
          state={state}
          boardSkin={boardSkin.skin}
          interactive={isMyTurn}
          onLine={(action) => rt.dispatch(action)}
        />
      </GameCanvas>
    </GameFrame>
  );
}
