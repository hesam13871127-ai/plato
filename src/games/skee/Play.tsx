import { useEffect, useRef, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { skeeEngine, SK_BALLS, type SkeeShot } from './engine';
import { AimArrow, GhostBalls, ReplayBall, SkeeLane } from './Board';
import { skeeMeta } from './meta';

const ACCENTS = ['#fbbf24', '#38bdf8', '#c084fc', '#fb7185'];
const MAX_TILT = (Math.PI / 180) * 50;

export function SkeePlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [tilt, setTilt] = useState(0); // −1..1 → angle around straight
  const [power, setPower] = useState(0.8);
  const [shots, setShots] = useState<SkeeShot[]>([]);
  const [replayKey, setReplayKey] = useState(0);
  const recordResult = useProfile((s) => s.recordResult);
  const laneSkin = useSkin(skeeMeta.skins, 'board');
  const lastShotRef = useRef<SkeeShot | null>(null);

  const rt = useGameRuntime(skeeEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      recordResult(won, winReward(config.slots));
      setReward(winReward(config.slots));
    },
  });
  const { state, dispatch } = rt;

  // track shot history for ghost balls
  useEffect(() => {
    if (state.lastShot && state.lastShot !== lastShotRef.current) {
      lastShotRef.current = state.lastShot;
      setShots((prev) => [...prev, state.lastShot!]);
      setReplayKey((k) => k + 1);
    }
  }, [state.lastShot]);

  const actors = skeeEngine.currentPlayers(state);
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human' && state.phase === 'roll';

  const angle = Math.PI / 2 + tilt * MAX_TILT;
  const last = state.lastShot;

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
        state.phase === 'over'
          ? `🏆 ${Math.max(...state.scores)}`
          : last
            ? last.hole !== null
              ? `🎯 ${seatName(last.player)} +${last.points}`
              : `${seatName(last.player)} +0`
            : t('game.skeeHint')
      }
    />
  );

  const actions = (
    <div className="ww-targets skee-controls">
      {isMyTurn && (
        <>
          <label className="skee-slider">
            <span>↔</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={tilt}
              onChange={(e) => setTilt(Number(e.target.value))}
            />
          </label>
          <label className="skee-slider">
            <span>💪</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.01}
              value={power}
              onChange={(e) => setPower(Number(e.target.value))}
            />
          </label>
          <Button variant="primary" onClick={() => dispatch({ type: 'roll', angle, power })}>
            🎳 {t('game.roll')}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <GameFrame
      meta={skeeMeta}
      config={config}
      engine={skeeEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setShots([]);
        setReplayKey(0);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => <>🎳 {SK_BALLS - (state.rolled[seat.id] ?? 0)}</>}
      winnerSummary={state.scores.map((s, i) => `${seatName(i)} ${s}`).join(' · ')}
    >
      <GameCanvas camera={{ position: [0, 7.4, 10.5], fov: 46 }} minDistance={5} maxDistance={22} maxPolarAngle={1.25}>
        <SkeeLane
          laneColor={laneSkin.skin?.colors.lane ?? '#d9c69b'}
          rampColor={laneSkin.skin?.colors.ramp ?? '#b45309'}
        />
        {isMyTurn && <AimArrow angle={angle} color={ACCENTS[viewer] ?? '#fbbf24'} />}
        <GhostBalls shots={shots} colors={ACCENTS} />
        {shots.length > 0 && (
          <ReplayBall key={replayKey} shot={shots[shots.length - 1]!} color={ACCENTS[shots[shots.length - 1]!.player] ?? '#fbbf24'} />
        )}
      </GameCanvas>
    </GameFrame>
  );
}
