import { useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { ActionRow, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { Die3D } from '../ludo/Board';
import { backgammonEngine, pipCount, type BackgammonAction } from './engine';
import { BackgammonBoard } from './Board';
import { backgammonMeta } from './meta';

export function BackgammonPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | 'bar' | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const pieceSkin = useSkin(backgammonMeta.skins, 'pieces');
  const boardSkin = useSkin(backgammonMeta.skins, 'board');

  const rt = useGameRuntime(backgammonEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = backgammonEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  const legal = useMemo(
    () => (isMyTurn ? (backgammonEngine.legalActions(state, viewer) as Extract<BackgammonAction, { type: 'move' }>[]) : []),
    [state, viewer, isMyTurn],
  );

  const canRoll = isMyTurn && state.phase === 'roll';
  const movePhase = isMyTurn && state.phase === 'move';

  const movableFroms = useMemo(() => {
    if (!movePhase) return new Set<string>();
    return new Set(legal.map((m) => String(m.from)));
  }, [legal, movePhase]);

  const targets = useMemo(() => {
    if (selected === null) return [];
    return legal.filter((m) => String(m.from) === String(selected));
  }, [legal, selected]);

  const doMove = (from: number | 'bar', to: number | 'off', die: number) => {
    rt.dispatch({ type: 'move', from, to, die });
    setSelected(null);
  };

  const onCheckerSelect = (from: number | 'bar' | null) => {
    if (!movePhase || from === null) {
      setSelected(null);
      return;
    }
    const key = String(from);
    if (movableFroms.has(key)) {
      setSelected(selected !== null && String(selected) === key ? null : from);
    } else {
      setSelected(null);
    }
  };

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        isMyTurn
          ? state.phase === 'roll'
            ? t('game.roll')
            : state.bar[viewer]! > 0
              ? t('game.enterFromBar')
              : selected !== null
                ? t('game.pickTarget')
                : t('game.pickPiece')
          : state.lastEvent?.kind === 'skip'
            ? '⏭'
            : t('game.thinking')
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
      {movePhase && state.dice && (
        <span
          style={{
            background: 'rgba(12,8,24,0.72)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '8px 18px',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          🎲 {state.dice[0]} + {state.dice[1]}
          {state.remaining.length > 2 ? ` ×${state.remaining.length}` : ''} — {state.remaining.join('، ')}
        </span>
      )}
    </ActionRow>
  );

  return (
    <GameFrame
      meta={backgammonMeta}
      config={config}
      engine={backgammonEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setSelected(null);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      renderChipExtra={(seat) => (
        <>
          🏠 {state.borneOff[seat.id] ?? 0}/15 · {t('game.pips')}: {pipCount(state, seat.id)}
        </>
      )}
      winnerSummary={config.slots
        .map((s) => `${s.name}: ${state.borneOff[s.id] ?? 0}/15`)
        .join(' · ')}
    >
      <GameCanvas camera={{ position: [0, 12.5, 9.5], fov: 42 }} minDistance={8} maxDistance={28} maxPolarAngle={1.2}>
        <BackgammonBoard
          state={state}
          boardSkin={boardSkin.skin}
          pieceColors={pieceSkin.skin?.colors}
          viewerSeat={(viewer === 1 ? 1 : 0) as 0 | 1}
          interactive={movePhase}
          selected={selected}
          targets={targets}
          onSelect={onCheckerSelect}
          onMove={doMove}
        />
        <Die3D
          value={state.dice?.[0] ?? null}
          spinning={false}
          position={[-1.1, 0.75, state.turn === 0 ? 2.6 : -2.6]}
          colors={{ face: '#fbf5e4', pip: '#221d15' }}
        />
        <Die3D
          value={state.dice?.[1] ?? null}
          spinning={false}
          position={[1.1, 0.75, state.turn === 0 ? 2.6 : -2.6]}
          colors={{ face: state.dice?.[0] === state.dice?.[1] ? '#ffd166' : '#fbf5e4', pip: '#221d15' }}
        />
      </GameCanvas>
    </GameFrame>
  );
}
