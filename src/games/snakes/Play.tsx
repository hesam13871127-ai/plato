import { useEffect, useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { ActionRow, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { snakesEngine } from './engine';
import { SNAKES_SEAT_COLORS, SnakesBoard } from './Board';
import { Die3D } from '../ludo/Board';
import { snakesMeta } from './meta';

const DICE_SPOT: [number, number, number][] = [
  [-5.8, 0.75, -5.8],
  [-5.8, 0.75, 5.8],
  [5.8, 0.75, 5.8],
  [5.8, 0.75, -5.8],
];

export function SnakesPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const recordResult = useProfile((s) => s.recordResult);
  const boardSkin = useSkin(snakesMeta.skins, 'board');

  const rt = useGameRuntime(snakesEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = snakesEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const canRoll = isMyTurn && state.phase === 'roll';

  useEffect(() => {
    if (state.lastEvent) {
      setSpinning(true);
      const timer = window.setTimeout(() => setSpinning(false), 520);
      return () => window.clearTimeout(timer);
    }
  }, [state.lastEvent]);

  const ev = state.lastEvent;
  const eventLine = useMemo(() => {
    if (!ev) return null;
    const arrow = ev.from === 0 ? '🚀' : `${ev.from}→${ev.to}`;
    if (ev.won) return `🏁 ${ev.dice}`;
    if (ev.snake) return `🐍 ${ev.dice} · ${arrow}`;
    if (ev.ladder) return `🪜 ${ev.dice} · ${arrow}`;
    if (ev.extra) return `🎲 6 — ${t('game.sixAgain')}`;
    return `🎲 ${ev.dice}`;
  }, [ev, t]);

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        <span>
          {isMyTurn ? (canRoll ? t('game.roll') : '') : t('game.thinking')}
          {eventLine && <span style={{ marginInlineStart: 10 }}>{eventLine}</span>}
        </span>
      }
    />
  );

  const actions = (
    <ActionRow>
      {canRoll && (
        <Button variant="primary" onClick={() => rt.dispatch({ type: 'roll' })}>
          🎲 {t('game.roll')}
        </Button>
      )}
    </ActionRow>
  );

  return (
    <GameFrame
      meta={snakesMeta}
      config={config}
      engine={snakesEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={SNAKES_SEAT_COLORS}
      renderChipExtra={(seat) => <>▶ {state.pos[seat.id] ?? 0}</>}
    >
      <GameCanvas camera={{ position: [0, 15.5, 12.5], fov: 44 }} minDistance={9} maxDistance={34} maxPolarAngle={1.15}>
        <SnakesBoard
          state={state}
          boardSkin={boardSkin.skin}
          canRoll={canRoll}
          onRoll={() => rt.dispatch({ type: 'roll' })}
        />
        <Die3D
          value={state.lastEvent ? state.lastEvent.dice : null}
          spinning={spinning}
          position={DICE_SPOT[state.turn % 4]!}
          colors={{ face: '#fbf5e4', pip: '#221d15' }}
        />
      </GameCanvas>
    </GameFrame>
  );
}
