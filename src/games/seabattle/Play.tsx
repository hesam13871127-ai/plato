import { useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { seaEngine, randomFleet, validateFleet, type ShipSpec } from './engine';
import { makeRng } from '../../core/rng';
import { SeaBattleScene } from './Board';
import { seaMeta } from './meta';

const ACCENTS = ['#ef4444', '#22d3ee'];

export function SeaBattlePlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [seed, setSeed] = useState(() => (Date.now() % 2 ** 31) | 1);
  const recordResult = useProfile((s) => s.recordResult);
  const tableSkin = useSkin(seaMeta.skins, 'table');
  const water = tableSkin.skin?.colors.felt ?? '#1e3a8a';

  const rt = useGameRuntime(seaEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = seaEngine.currentPlayers(state);
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const enemy = 1 - viewer;
  const isMyAction = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const placing = state.phase === 'place' && !state.placed[viewer];

  // client-side auto-fleet for the human (rerollable)
  const fleet: ShipSpec[] = useMemo(() => randomFleet(makeRng(seed)), [seed]);
  void validateFleet;

  const shipsLeft = (seat: number) => state.fleets[seat]!.filter((s) => s.hits < s.size).length;
  const myShots = state.shots[enemy]!;
  const myHits = myShots.filter((s) => s.hit).length;
  const mySunk = state.fleets[enemy]!.filter((s) => s.hits >= s.size).length;
  const last = state.lastEvent;

  const banner = (
    <TurnBanner
      text={
        state.phase === 'over'
          ? t('game.winner', { name: seatName(state.winner ?? 0) })
          : placing
            ? t('game.placeFleet')
            : isMyAction
              ? t('game.yourTurn')
              : t('game.turnOf', { name: seatName(state.turn) })
      }
      hint={
        state.phase === 'over'
          ? '🏆'
          : placing
            ? t('game.placeFleet')
            : last
              ? last.hit
                ? `${last.sunkSize ? `💥 ${t('game.sunkMsg')} (${last.sunkSize})` : `🔴 ${t('game.hitMsg')}`} — ${seatName(last.player)}`
                : `⚪ ${t('game.missMsg')} — ${seatName(last.player)}`
              : t('game.aim')
      }
    />
  );

  const actions = (
    <div className="ww-targets">
      {placing && (
        <>
          <Button onClick={() => setSeed((Date.now() % 2 ** 31) | 1)}>🎲 {t('game.reroll')}</Button>
          <Button variant="primary" onClick={() => dispatch({ type: 'fleet', ships: fleet })}>
            ⚓ {t('game.ready')}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <GameFrame
      meta={seaMeta}
      config={config}
      engine={seaEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setSeed((Date.now() % 2 ** 31) | 1);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => <>🚢 {shipsLeft(seat.id)}</>}
      winnerSummary={`${t('game.hitMsg')} ${myHits}/${myShots.length} · ${t('game.sunkMsg')} ${mySunk}/5`}
    >
      <GameCanvas camera={{ position: [0, 9.6, 8.2], fov: 46 }} minDistance={6} maxDistance={24} maxPolarAngle={1.2}>
        <SeaBattleScene
          state={state}
          viewer={viewer}
          water={water}
          accent={ACCENTS[viewer] ?? '#ef4444'}
          labelOwn={`${seatName(viewer)} — ${t('game.yourFleet')}`}
          labelEnemy={`${seatName(enemy)} — ${t('game.enemyWaters')}`}
          interactive={isMyAction}
          onFire={(x, y) => dispatch({ type: 'fire', x, y })}
        />
      </GameCanvas>
    </GameFrame>
  );
}
