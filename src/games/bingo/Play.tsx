import { useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { ActionRow, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { bingoEngine } from './engine';
import { BingoTable } from './Board';
import { bingoMeta } from './meta';

const ACCENTS = ['#8b5cf6', '#f59e0b', '#22d3ee', '#fb7185'];

export function BingoPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);

  const rt = useGameRuntime(bingoEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = bingoEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  const lastNumber = state.lastEvent?.number ?? null;
  const recent = useMemo(() => [...state.drawn].slice(-8).reverse(), [state.drawn]);

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        isMyTurn
          ? t('game.drawBall')
          : state.lastEvent
            ? `🎲 ${state.lastEvent.number}`
            : t('game.thinking')
      }
    />
  );

  const actions = (
    <ActionRow>
      {isMyTurn && (
        <Button variant="primary" onClick={() => rt.dispatch({ type: 'draw' })}>
          🎱 {t('game.draw')}
        </Button>
      )}
    </ActionRow>
  );

  return (
    <GameFrame
      meta={bingoMeta}
      config={config}
      engine={bingoEngine}
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
      renderChipExtra={(seat) => <>📋 {state.cards[seat.id] ? '✓' : ''}</>}
      winnerSummary={recent.length ? `${t('game.recent')}: ${recent.join(' · ')}` : null}
    >
      <GameCanvas camera={{ position: [0, 12.5, 10], fov: 44 }} minDistance={8} maxDistance={28} maxPolarAngle={1.2}>
        <BingoTable
          cards={state.cards}
          names={config.slots.map((s) => s.name)}
          accents={ACCENTS}
          lastNumber={lastNumber}
        />
      </GameCanvas>
    </GameFrame>
  );
}
