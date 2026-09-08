import { useRef, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { ActionRow, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { bowlingEngine, cumulativeScores } from './engine';
import { BowlingAim, BowlingLane, BowlingPointer, BowlingScene, useBowlingReplay, type BowlingAnim } from './Board';
import { bowlingMeta } from './meta';

const ACCENTS = ['#8b5cf6', '#f59e0b', '#22d3ee', '#fb7185'];
const LANE_H_DISPLAY = 12.5;const DEFAULT_LANE_SKIN = {
  id: 'default',
  gameId: 'bowling',
  kind: 'board' as const,
  name: { fa: '', en: '' },
  price: 0,
  colors: { wood: '#c9a165', gutter: '#2b2317' },
};

export function BowlingPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [power, setPower] = useState(0.85);
  const [angle, setAngle] = useState(0);
  const [, forceTick] = useState(0);
  const recordResult = useProfile((s) => s.recordResult);
  const laneSkin = useSkin(bowlingMeta.skins, 'board');
  const ballSkin = useSkin(bowlingMeta.skins, 'pieces');
  const animRef = useRef<BowlingAnim | null>(null);

  const rt = useGameRuntime(bowlingEngine, config, {
    botDelayMs: 1200,
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  useBowlingReplay(
    state.lastEvent ? state.lastEvent.frame * 31 + state.lastEvent.roll : 0,
    state.lastShot?.snapshot ?? [],
    state.lastShot?.angle ?? 0,
    state.lastShot?.power ?? 0.8,
    animRef,
  );

  const actors = bowlingEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const animating = animRef.current !== null;

  const throwBall = () => {
    if (!isMyTurn || animating) return;
    animRef.current = null;
    rt.dispatch({ type: 'throw', angle, power });
  };

  const ev = state.lastEvent;
  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        ev
          ? ev.knocked === 10 && ev.roll === 0
            ? t('game.strikeMsg')
            : ev.standingAfter === 0 && ev.roll === 1
              ? t('game.spareMsg')
              : `🎳 ${ev.knocked}`
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
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{t('game.power')}</span>
          <input
            type="range"
            min={40}
            max={100}
            value={Math.round(power * 100)}
            onChange={(e) => setPower(Number(e.target.value) / 100)}
            style={{ width: 140, accentColor: bowlingMeta.accent }}
          />
          <Button variant="primary" onClick={throwBall}>
            🎳 {t('game.throwBall')}
          </Button>
        </>
      )}
    </ActionRow>
  );

  const scoreboard = (
    <div className="dice-sheet-wrap bowling-sheet-wrap">
      <div className="dice-sheet">
        <div className="sheet-players">
          {config.slots.map((slot) => (
            <div key={slot.id} className={`sheet-col ${actors.includes(slot.id) ? 'active' : ''}`}>
              <div className="sheet-name" style={{ color: ACCENTS[slot.id % 4] }}>
                {slot.name}
              </div>
              <div className="sheet-total">
                {cumulativeScores(state.frames[slot.id] ?? []).slice(-1)[0] ?? 0}
              </div>
            </div>
          ))}
        </div>
        <div className="bowling-frames">
          {config.slots.map((slot) => (
            <div key={slot.id} className="frame-row">
              {(state.frames[slot.id] ?? []).map((frame, fi) => (
                <div key={fi} className={`frame-cell ${fi === state.frame && actors.includes(slot.id) ? 'now' : ''}`}>
                  <span className="f-idx">{fi + 1}</span>
                  <span className="f-rolls">
                    {frame.map((r, k) => (r === 10 && k === 0 ? '✕' : r)).join(' ')}
                  </span>
                  <span className="f-score">{cumulativeScores(state.frames[slot.id] ?? [])[fi] ?? ''}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <GameFrame
      meta={bowlingMeta}
      config={config}
      engine={bowlingEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        animRef.current = null;
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => <>🎳 {cumulativeScores(state.frames[seat.id] ?? []).slice(-1)[0] ?? 0}</>}
      winnerSummary={config.slots
        .map((s) => `${s.name}: ${cumulativeScores(state.frames[s.id] ?? []).slice(-1)[0] ?? 0}`)
        .join(' · ')}
    >
      <GameCanvas
        camera={{ position: [0, 6.5, LANE_H_DISPLAY], fov: 46 }}
        target={[0, 0.3, 2]}
        minDistance={5}
        maxDistance={30}
        maxPolarAngle={1.35}
      >
        <BowlingLane skin={laneSkin.skin ?? DEFAULT_LANE_SKIN} />
        <BowlingScene
          standing={state.standing}
          animRef={animRef}
          onAnimDone={() => forceTick((n) => n + 1)}
          laneColor={laneSkin.skin?.colors?.wood ?? '#c9a165'}
          ballColor={ballSkin.skin?.colors?.ball ?? '#6b21a8'}
        />
        {isMyTurn && !animating && (
          <>
            <BowlingAim angle={angle} power={power} />
            <BowlingPointer onMove={setAngle} onClick={throwBall} />
          </>
        )}
      </GameCanvas>
      {scoreboard}
    </GameFrame>
  );
}
