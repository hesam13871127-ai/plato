import { useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { fishEngine } from './engine';
import { BookStack, CardFan, FishTable, Pool } from './Board';
import { gofishMeta } from './meta';

const ACCENTS = ['#ef4444', '#38bdf8', '#fbbf24', '#c084fc'];
const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_SUITS = ['♠', '♥', '♦', '♣'];

export function GoFishPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [pickedRank, setPickedRank] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const tableSkin = useSkin(gofishMeta.skins, 'table');

  const rt = useGameRuntime(fishEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      recordResult(won, winReward(config.slots));
      setReward(winReward(config.slots));
    },
  });
  const { state, dispatch } = rt;

  const actors = fishEngine.currentPlayers(state);
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human' && state.phase === 'play';

  const myHand = state.hands[viewer]!;
  const heldRanks = useMemo(
    () => Array.from({ length: 13 }, (_, r) => r).filter((r) => myHand[r]! > 0 && !state.bookedRanks.includes(r)),
    [myHand, state.bookedRanks],
  );

  const canAsk = (target: number) =>
    isMyTurn && target !== viewer && state.hands[target]!.reduce((a, b) => a + b, 0) > 0 && pickedRank !== null;

  const lastEv = state.lastEvent;
  const evText =
    lastEv === null
      ? ''
      : lastEv.kind === 'hit'
        ? `🎣 ${seatName(lastEv.asker)} → ${seatName(lastEv.target)}: ${RANK_LABELS[lastEv.rank]} ×${lastEv.count}`
        : lastEv.kind === 'fish'
          ? lastEv.lucky
            ? `🍀 ${seatName(lastEv.asker)}: ${t('game.goFishMsg')} — ${RANK_LABELS[lastEv.rank]}! ${t('game.hitMsg')}`
            : `🐟 ${seatName(lastEv.asker)}: ${t('game.goFishMsg')}`
          : lastEv.kind === 'book'
            ? `📖 ${seatName(lastEv.player)}: ${t('game.books')} ${RANK_LABELS[lastEv.rank]}`
            : lastEv.kind === 'empty-draw'
              ? `🃏 ${seatName(lastEv.player)}`
              : '';

  const banner = (
    <TurnBanner
      text={
        state.phase === 'over'
          ? t('game.winner', { name: seatName(state.books.indexOf(Math.max(...state.books))) })
          : isMyTurn
            ? pickedRank === null
              ? t('game.pickCard')
              : t('game.askPlayer')
            : t('game.turnOf', { name: seatName(state.turn) })
      }
      hint={evText || t('game.goFishHint')}
    />
  );

  const actions = (
    <div className="fish-actions">
      {state.phase === 'play' &&
        config.slots.map((slot, i) =>
          i === viewer ? null : (
            <Button
              key={slot.id}
              disabled={!canAsk(i)}
              variant={canAsk(i) ? 'primary' : 'default'}
              onClick={() => {
                if (pickedRank !== null) {
                  dispatch({ type: 'ask', target: i, rank: pickedRank });
                  setPickedRank(null);
                }
              }}
            >
              {state.hands[i]!.reduce((a, b) => a + b, 0)} 🃏 {seatName(i)}
            </Button>
          ),
        )}
    </div>
  );

  return (
    <GameFrame
      meta={gofishMeta}
      config={config}
      engine={fishEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setPickedRank(null);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => <>📖 {state.books[seat.id] ?? 0}</>}
      winnerSummary={`${t('game.books')}: ${state.books.map((b, i) => `${seatName(i)} ${b}`).join(' · ')}`}
    >
      <GameCanvas camera={{ position: [0, 6.8, 6.2], fov: 46 }} minDistance={4} maxDistance={16} maxPolarAngle={1.25}>
        <FishTable felt={tableSkin.skin?.colors.felt ?? '#065f46'} />
        <Pool count={state.pool.length} total={Math.max(state.pool.length, 24)} />
        {/* opponents' fans around the table */}
        {state.hands.map((h, i) => {
          if (i === viewer) return null;
          const n = state.playerCount - 1;
          const k = i > viewer ? i - 1 : i;
          const ang = Math.PI + ((k + 1) / (n + 1)) * Math.PI;
          return (
            <group key={i} position={[Math.sin(ang) * 3.4, 0, Math.cos(ang) * 2.3]}>
              <CardFan count={h.reduce((a, b) => a + b, 0)} x={0} z={0} color="#1e3a8a" rotY={ang + Math.PI} />
            </group>
          );
        })}
        {/* viewer's own fan */}
        <group position={[0, 0, 2.6]}>
          <CardFan count={myHand.reduce((a, b) => a + b, 0)} x={0} z={0} color={ACCENTS[viewer] ?? '#ef4444'} rotY={0} />
        </group>
        {/* booked stacks */}
        {state.bookedRanks.slice(-6).map((r, i) => {
          const ang = (i / 6) * Math.PI * 2;
          return (
            <BookStack
              key={r}
              rank={r}
              x={Math.sin(ang) * 1.7}
              z={Math.cos(ang) * 1.15 - 0.4}
              label={RANK_LABELS[r]!}
              color="#facc15"
            />
          );
        })}
      </GameCanvas>

      <div className="fish-hand">
        {heldRanks.map((r) => (
          <button
            key={r}
            className={`fish-card ${pickedRank === r ? 'picked' : ''} ${!isMyTurn ? 'idle' : ''}`}
            disabled={!isMyTurn}
            onClick={() => setPickedRank(pickedRank === r ? null : r)}
          >
            <span className="rank">{RANK_LABELS[r]}</span>
            <span className="suits">{RANK_SUITS.slice(0, myHand[r]!).join('')}</span>
            <span className="count">×{myHand[r]}</span>
          </button>
        ))}
      </div>
    </GameFrame>
  );
}
