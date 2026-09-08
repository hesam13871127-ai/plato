import { useRef, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { ActionRow, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { carromEngine } from './engine';
import { CarromAim, CarromBoardBase, CarromPieces, CarromPointer, useCarromShotReplay, type CarromAnim } from './Board';
import { carromMeta } from './meta';
import { BASELINE_X_MAX, BASELINE_X_MIN, BASELINE_Y, CARROM_W } from './engine';

export function CarromPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [strikerX, setStrikerX] = useState(CARROM_W / 2);
  const [power, setPower] = useState(0.7);
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const [, forceTick] = useState(0);
  const recordResult = useProfile((s) => s.recordResult);
  const coinSkin = useSkin(carromMeta.skins, 'pieces');
  const boardSkin = useSkin(carromMeta.skins, 'board');
  const animRef = useRef<CarromAnim | null>(null);

  const rt = useGameRuntime(carromEngine, config, {
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
  useCarromShotReplay(state, animRef);

  const actors = carromEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  const aimAngle = aim ? Math.atan2(aim.y - BASELINE_Y[state.turn]!, aim.x - strikerX) : null;
  const animating = animRef.current !== null;

  const strike = () => {
    if (aimAngle === null || !isMyTurn) return;
    animRef.current = null;
    rt.dispatch({ type: 'strike', strikerX, angle: aimAngle, power });
    setAim(null);
  };

  const myKindName = (seat: number) => (seat === 0 ? '⚪' : '⚫');
  const coinsLeft = (seat: number) =>
    state.coins.filter((c) => c.kind === (seat === 0 ? 'white' : 'black') && !c.pocketed).length;

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        state.queenPendingBy !== null
          ? `👑 ${t('game.queen')} — ${state.queenPendingBy === viewer ? t('game.mustCover') : seatName(state.queenPendingBy)}`
          : state.lastEvent?.foul
            ? `⚠ ${t('game.foul')}`
            : isMyTurn
              ? t('game.aim')
              : t('game.thinking')
      }
    />
  );

  const actions = (
    <ActionRow>
      {isMyTurn && !animating && (
        <>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>↔</span>
          <input
            type="range"
            min={Math.round(BASELINE_X_MIN * 100) / 100 * 100}
            max={BASELINE_X_MAX * 100}
            step={1}
            value={strikerX * 100}
            onChange={(e) => setStrikerX(Number(e.target.value) / 100)}
            style={{ width: 110, accentColor: carromMeta.accent }}
            title={t('game.strikerPos')}
          />
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{t('game.power')}</span>
          <input
            type="range"
            min={15}
            max={100}
            value={Math.round(power * 100)}
            onChange={(e) => setPower(Number(e.target.value) / 100)}
            style={{ width: 130, accentColor: carromMeta.accent }}
          />
          <Button variant="primary" disabled={aimAngle === null} onClick={strike}>
            🎯 {t('game.strike')}
          </Button>
        </>
      )}
    </ActionRow>
  );

  return (
    <GameFrame
      meta={carromMeta}
      config={config}
      engine={carromEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setAim(null);
        setStrikerX(CARROM_W / 2);
        animRef.current = null;
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      renderChipExtra={(seat) => (
        <>
          {myKindName(seat.id)} {coinsLeft(seat.id)}
          {state.queenOff ? '' : ' 👑'}
        </>
      )}
    >
      <GameCanvas camera={{ position: [0, 8.2, 6.8], fov: 44 }} minDistance={5} maxDistance={22} maxPolarAngle={1.3}>
        <group rotation-y={state.turn === 1 ? Math.PI : 0}>
          <CarromBoardBase skin={boardSkin.skin} />
          <CarromPieces
            state={state}
            coinColors={coinSkin.skin?.colors}
            animRef={animRef}
            onAnimDone={() => forceTick((n) => n + 1)}
          />
          {isMyTurn && !animating && (
            <>
              <CarromAim strikerX={strikerX} seat={(state.turn === 1 ? 1 : 0) as 0 | 1} aim={aim} />
              <CarromPointer
                onMove={(x, y) => setAim({ x, y })}
                onClick={() => {
                  if (aimAngle !== null) {
                    animRef.current = null;
                    rt.dispatch({ type: 'strike', strikerX, angle: aimAngle, power });
                    setAim(null);
                  }
                }}
              />
            </>
          )}
        </group>
      </GameCanvas>
    </GameFrame>
  );
}
