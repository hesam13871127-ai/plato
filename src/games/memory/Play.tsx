import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { memoryEngine } from './engine';
import { MemoryTable } from './Board';
import { memoryMeta } from './meta';

const ACCENTS = ['#fb7185', '#38bdf8', '#fbbf24', '#c084fc'];
const DEFAULT_BACK = '#7c3aed';

export function MemoryPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const cardSkin = useSkin(memoryMeta.skins, 'cards');
  const backColor = cardSkin.skin?.colors.back ?? DEFAULT_BACK;

  const rt = useGameRuntime(memoryEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = memoryEngine.currentPlayers(state);
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
      hint={isMyTurn ? t('game.matchPair') : t('game.thinking')}
    />
  );

  return (
    <GameFrame
      meta={memoryMeta}
      config={config}
      engine={memoryEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => (
        <>
          🃏 {state.pairs[seat.id] ?? 0} {t('game.pairs')}
        </>
      )}
      winnerSummary={`${t('game.pairs')}: ${state.pairs.map((p, i) => `${seatName(i)} ${p}`).join(' · ')}`}
    >
      <GameCanvas
        camera={{ position: [0, 8.2, 8.6], fov: 48 }}
        minDistance={5}
        maxDistance={22}
        maxPolarAngle={1.15}
      >
        <MemoryTable
          state={state}
          backColor={backColor}
          accents={ACCENTS}
          onReveal={(i) => dispatch({ type: 'reveal', idx: i })}
          interactive={isMyTurn}
        />
      </GameCanvas>
    </GameFrame>
  );
}
