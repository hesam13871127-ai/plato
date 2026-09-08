import { useEffect, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { ActionRow, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { CATEGORIES, CATEGORY_LABELS, diceEngine, scoreCategory, totalScore, upperSection, type Category } from './engine';
import { DiceFelt, DieDice } from './Board';
import { diceMeta } from './meta';

const ACCENTS = ['#8b5cf6', '#f59e0b', '#22d3ee', '#fb7185'];

export function DicePlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t, lang } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [hold, setHold] = useState<boolean[]>([false, false, false, false, false]);
  const recordResult = useProfile((s) => s.recordResult);

  const rt = useGameRuntime(diceEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = diceEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  // spin animation on new dice values
  useEffect(() => {
    if (state.lastEvent?.kind === 'roll') {
      setRolling(true);
      setHold([false, false, false, false, false]);
      const timer = window.setTimeout(() => setRolling(false), 450);
      return () => window.clearTimeout(timer);
    }
  }, [state.lastEvent]);

  useEffect(() => {
    if (!isMyTurn) setHold([false, false, false, false, false]);
  }, [isMyTurn, state.turn]);

  const canRoll = isMyTurn && state.phase === 'roll' && state.rollsLeft > 0;
  const mustScore = isMyTurn && state.phase === 'assign';

  const doRoll = () => {
    rt.dispatch({ type: 'roll', hold });
  };

  const doScore = (category: Category) => {
    rt.dispatch({ type: 'score', category });
  };

  const myCard = state.scores[viewer] ?? Object.fromEntries(CATEGORIES.map((c) => [c, null]));
  const unscored = CATEGORIES.filter((c) => myCard[c] === null);

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        isMyTurn
          ? mustScore
            ? t('game.scoreCategory')
            : `${t('game.holdDice')} · ${state.rollsLeft + 1} ⟳`
          : t('game.thinking')
      }
    />
  );

  const actions = (
    <ActionRow>
      {canRoll && (
        <Button variant="primary" onClick={doRoll}>
          🎲 {t('game.rollDice')}
        </Button>
      )}
    </ActionRow>
  );

  // scorecard as a DOM overlay
  const scorecard = (
    <div className="dice-sheet-wrap">
      <div className="dice-sheet">
        <div className="sheet-players">
          {config.slots.map((slot) => {
            const card = state.scores[slot.id]!;
            const upper = upperSection(card);
            return (
              <div key={slot.id} className={`sheet-col ${actors.includes(slot.id) ? 'active' : ''}`}>
                <div className="sheet-name" style={{ color: ACCENTS[slot.id % 4] }}>
                  {slot.name}
                </div>
                <div className="sheet-total">{totalScore(card)}</div>
                <div className="sheet-sub">
                  {upper.sum}
                  {upper.bonus ? ` +${upper.bonus}` : ''}
                </div>
              </div>
            );
          })}
        </div>
        <div className="sheet-rows">
          {CATEGORIES.map((cat) => (
            <div key={cat} className={`sheet-row ${mustScore && unscored.includes(cat) ? 'pickable' : ''}`}>
              <span className="row-label">{CATEGORY_LABELS[cat][lang]}</span>
              {config.slots.map((slot) => {
                const v = state.scores[slot.id]![cat];
                const isPick = mustScore && slot.id === viewer && unscored.includes(cat);
                return (
                  <button
                    key={slot.id}
                    className={`cell ${v === null ? 'empty' : ''} ${isPick ? 'pick' : ''}`}
                    disabled={!isPick}
                    onClick={() => isPick && doScore(cat)}
                    title={isPick ? String(scoreCategory(state.dice, cat)) : undefined}
                  >
                    {v === null ? (isPick ? scoreCategory(state.dice, cat) : '·') : v}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <GameFrame
      meta={diceMeta}
      config={config}
      engine={diceEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setHold([false, false, false, false, false]);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => <>🎯 {totalScore(state.scores[seat.id]!)}</>}
      winnerSummary={config.slots.map((s) => `${s.name}: ${totalScore(state.scores[s.id]!)}`).join(' · ')}
    >
      <GameCanvas camera={{ position: [0, 8.5, 8], fov: 44 }} minDistance={6} maxDistance={22} maxPolarAngle={1.25}>
        <DiceFelt />
        {state.dice.map((d, i) => (
          <DieDice
            key={i}
            value={d}
            held={isMyTurn && state.phase === 'roll' && hold[i]}
            position={[(i - 2) * 1.7, 0.55, 0]}
            rolling={rolling}
            onClick={() => {
              if (isMyTurn && state.phase === 'roll' && state.rollsLeft > 0) {
                setHold((h) => h.map((v, k) => (k === i ? !v : v)));
              }
            }}
          />
        ))}
      </GameCanvas>
      {scorecard}
    </GameFrame>
  );
}
