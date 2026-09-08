import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { golfEngine, HOLES, totals } from './engine';
import { AimArrow, GolfCourse, ReplayBall } from './Board';
import { minigolfMeta } from './meta';

const ACCENTS = ['#38bdf8', '#fb7185', '#a3e635', '#fbbf24'];

export function MinigolfPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t, lang } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [power, setPower] = useState(0.6);
  const [aim, setAim] = useState<[number, number] | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const boardSkin = useSkin(minigolfMeta.skins, 'board');
  const felt = boardSkin.skin?.colors.felt ?? '#2f7d4f';

  const rt = useGameRuntime(golfEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = golfEngine.currentPlayers(state);
  const actor = actors[0] ?? null;
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const isMyTurn = actor === viewer && config.slots[viewer]?.kind === 'human';

  const hole = HOLES[state.hole]!;
  const myStrokes = state.strokes[state.hole]?.[viewer] ?? 0;
  const totalsNow = totals(state);

  const stroke = () => {
    if (!isMyTurn) return;
    const target = aim ?? [hole.cup[0], hole.cup[1]];
    const angle = Math.atan2(target[1] - state.ball[1], target[0] - state.ball[0]);
    dispatch({ type: 'stroke', angle, power });
  };

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== null ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        isMyTurn
          ? `${t('game.hole')} ${state.hole + 1} · ${hole.name[lang]} · ${t('game.par')} ${hole.par} · ${t('game.strokes')}: ${myStrokes}`
          : state.lastShot
            ? state.lastShot.holed
              ? `⛳ ${seatName(state.lastShot.player)} — ${t('game.holed')}`
              : state.lastShot.pickedUp
                ? `😩 ${seatName(state.lastShot.player)} — ${t('game.pickedUp')}`
                : `🏌️ ${seatName(state.lastShot.player)}: ${state.lastShot.strokesAfter}`
            : t('game.thinking')
      }
    />
  );

  const actions = (
    <div className="bet-controls">
      {isMyTurn && (
        <>
          <span className="bet-value">{t('game.power')}</span>
          <input
            className="power-slider"
            type="range"
            min={10}
            max={100}
            value={Math.round(power * 100)}
            onChange={(e) => setPower(Number(e.target.value) / 100)}
          />
          <span className="bet-value">{Math.round(power * 100)}%</span>
          <button className="t-btn" onClick={stroke}>
            ⛳ {t('game.strokeIt')}
          </button>
        </>
      )}
    </div>
  );

  return (
    <GameFrame
      meta={minigolfMeta}
      config={config}
      engine={golfEngine}
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
      renderChipExtra={(seat) => <>⛳ {totalsNow[seat.id] ?? 0}</>}
      winnerSummary={`${t('game.hole')} ${state.hole + 1}/${HOLES.length} · ${t('game.par')} ${hole.par}`}
    >
      <GameCanvas
        camera={{ position: [0, 9.4, 8.2], fov: 46 }}
        minDistance={5}
        maxDistance={22}
        maxPolarAngle={1.2}
      >
        <GolfCourse hole={hole} felt={felt} onAim={(x, y) => setAim([x, y])} />
        <ReplayBall
          shot={state.lastShot}
          rest={state.ball}
          hole={hole}
          color={ACCENTS[actor ?? 0] ?? '#38bdf8'}
        />
        <AimArrow from={state.ball} to={aim} hole={hole} visible={isMyTurn} />
      </GameCanvas>

      <div className="golf-score">
        <div className="row on">
          <span>
            {t('game.hole')} {state.hole + 1} — {hole.name[lang]}
          </span>
          <span>
            {t('game.par')} {hole.par}
          </span>
        </div>
        {state.strokes.map((holeStrokes, hIdx) => (
          <div key={hIdx} className={`row ${hIdx === state.hole ? 'on' : ''}`}>
            <span>
              {t('game.hole')} {hIdx + 1}
            </span>
            <span>
              {holeStrokes.map((s, p) => `${p === 0 ? '' : ' · '}${s > 0 ? s : '–'}`).join('')}
            </span>
          </div>
        ))}
        <div className="row">
          <span>{t('game.total')}</span>
          <span>{totalsNow.map((v) => v).join(' · ')}</span>
        </div>
      </div>
    </GameFrame>
  );
}
