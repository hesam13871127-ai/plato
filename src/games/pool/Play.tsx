import { useRef, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { ActionRow, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { poolEngine, type PoolState } from './engine';
import { AimGuide, CueStick, PoolBalls, PoolPockets, PoolTable, TablePointer, toWorld, useShotReplay, type PoolAnim } from './Board';
import { poolMeta } from './meta';

export function PoolPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [power, setPower] = useState(0.6);
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const [, forceTick] = useState(0);
  const recordResult = useProfile((s) => s.recordResult);
  const pieceSkin = useSkin(poolMeta.skins, 'pieces');
  const tableSkin = useSkin(poolMeta.skins, 'table');
  const animRef = useRef<PoolAnim | null>(null);

  const rt = useGameRuntime(poolEngine, config, {
    botDelayMs: 1100,
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;
  useShotReplay(state, animRef);

  const actors = poolEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  const cue = state.balls.find((b) => b.kind === 'cue' && !b.pocketed) ?? state.balls.find((b) => b.kind === 'cue');
  const aimAngle = aim && cue ? Math.atan2(aim.y - cue.y, aim.x - cue.x) : null;

  const shoot = () => {
    if (aimAngle === null || !isMyTurn) return;
    animRef.current = null;
    rt.dispatch({ type: 'shot', angle: aimAngle, power });
    setAim(null);
  };

  const animating = animRef.current !== null;
  const myGroup = state.groups[viewer];
  const groupLabel = (seat: number) => {
    const g = state.groups[seat];
    if (state.open) return t('game.openTable');
    return g === 'solid' ? `● ${t('game.solids')}` : `◍ ${t('game.stripes')}`;
  };
  const pottedCount = (seat: number) => {
    const g = state.groups[seat];
    if (!g) return 0;
    return state.balls.filter((b) => b.kind === g && b.pocketed).length;
  };

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        state.lastEvent && state.lastEvent.foul
          ? `⚠ ${t('game.foul')} — ${state.lastEvent.reason === 'scratch' ? '🖐' : '🚫'}`
          : isMyTurn
            ? `${myGroup ? groupLabel(viewer) : t('game.openTable')} · ${t('game.aim')}`
            : t('game.thinking')
      }
    />
  );

  const actions = (
    <ActionRow>
      {isMyTurn && !animating && (
        <>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{t('game.power')}</span>
          <input
            type="range"
            min={15}
            max={100}
            value={Math.round(power * 100)}
            onChange={(e) => setPower(Number(e.target.value) / 100)}
            style={{ width: 150, accentColor: poolMeta.accent }}
          />
          <Button variant="primary" disabled={aimAngle === null} onClick={shoot}>
            🎱 {t('game.strike')}
          </Button>
        </>
      )}
    </ActionRow>
  );

  return (
    <GameFrame
      meta={poolMeta}
      config={config}
      engine={poolEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setAim(null);
        animRef.current = null;
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      renderChipExtra={(slot) => (
        <>
          {groupLabel(slot.id)}
          {state.groups[slot.id] && ` · ${pottedCount(slot.id)}/7`}
        </>
      )}
    >
      <GameCanvas camera={{ position: [0, 8.5, 7.5], fov: 44 }} minDistance={6} maxDistance={24} maxPolarAngle={1.25}>
        <PoolTable skin={tableSkin.skin} />
        <PoolPockets />
        <PoolBalls
          state={state}
          animRef={animRef}
          onAnimDone={() => forceTick((n) => n + 1)}
        />
        {isMyTurn && !animating && cue && aim && cue.x !== undefined && (
          <>
            <AimGuide from={toWorld(cue.x, cue.y)} to={toWorld(aim.x, aim.y)} color="#3ddc97" />
            <CueStick from={toWorld(cue.x, cue.y)} angle={aimAngle ?? 0} pullback={0.25 + power * 0.7} />
          </>
        )}
        {isMyTurn && !animating && (
          <TablePointer
            onMove={(x, y) => setAim({ x, y })}
            onClick={() => {
              if (aimAngle !== null) {
                animRef.current = null;
                rt.dispatch({ type: 'shot', angle: aimAngle, power });
                setAim(null);
              }
            }}
          />
        )}
      </GameCanvas>
    </GameFrame>
  );
}
