import { useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { ActionRow, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { PIP_POS } from '../../ui/three/textures';
import { dominoesEngine, type DominoAction } from './engine';
import { DominoBoard, DominoPiece, TILE_H } from './Board';
import { dominoesMeta } from './meta';

export function DominoesPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const pieceSkin = useSkin(dominoesMeta.skins, 'pieces');
  const tableSkin = useSkin(dominoesMeta.skins, 'table');
  const [selected, setSelected] = useState<number | null>(null);

  const rt = useGameRuntime(dominoesEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  // Hot-seat: whoever is a human and on turn sees their hand (fallback: seat 0).
  const actors = dominoesEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;

  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const legal = useMemo(
    () => (isMyTurn ? dominoesEngine.legalActions(state, viewer) : []),
    [state, viewer, isMyTurn],
  );
  const playableTileIds = useMemo(
    () => new Set(legal.filter((a): a is Extract<DominoAction, { type: 'place' }> => a.type === 'place').map((a) => a.tileId)),
    [legal],
  );

  const canDraw = legal.some((a) => a.type === 'draw');
  const canPass = legal.some((a) => a.type === 'pass');

  // For the very first move there is no end choice.
  const isFirstMove = state.firstMove && isMyTurn;

  const legalEnds: ('left' | 'right')[] = useMemo(() => {
    if (!isMyTurn || selected === null || isFirstMove) return [];
    const ends: ('left' | 'right')[] = [];
    if (legal.some((a) => a.type === 'place' && a.tileId === selected && a.end === 'left')) ends.push('left');
    if (legal.some((a) => a.type === 'place' && a.tileId === selected && a.end === 'right')) ends.push('right');
    return ends;
  }, [legal, selected, isMyTurn, isFirstMove]);

  const play = (tileId: number, end: 'left' | 'right' = 'right') => {
    rt.dispatch({ type: 'place', tileId, end });
    setSelected(null);
  };

  const onTileClick = (tileId: number) => {
    if (!isMyTurn || !playableTileIds.has(tileId)) return;
    if (isFirstMove) {
      play(tileId, 'right');
      return;
    }
    if (legalEnds.length === 1 && selected === tileId) {
      play(tileId, legalEnds[0]!);
      return;
    }
    setSelected(tileId === selected ? null : tileId);
  };

  const hand = state.hands[viewer] ?? [];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const actor = actors[0];

  const banner = (
    <TurnBanner
      text={
        isMyTurn
          ? t('game.yourTurn')
          : actor !== undefined
            ? t('game.turnOf', { name: seatName(actor) })
            : ''
      }
      hint={
        isMyTurn
          ? legalEnds.length > 0
            ? t('game.pickEnd')
            : canDraw
              ? t('game.draw')
              : canPass
                ? t('game.pass')
                : t('game.pickTile')
          : t('game.thinking')
      }
    />
  );

  const actions = (
    <ActionRow>
      {canDraw && (
        <Button variant="primary" onClick={() => rt.dispatch({ type: 'draw' })}>
          🁣 {t('game.draw')}
        </Button>
      )}
      {canPass && (
        <Button variant="primary" onClick={() => rt.dispatch({ type: 'pass' })}>
          ⏭ {t('game.pass')}
        </Button>
      )}
    </ActionRow>
  );

  const dominoHand = (
    <div className="hand-wrap">
      <div className="hand-label">
        {t('game.hand')} · {seatName(viewer)} — {hand.length} {t('game.tiles')}
      </div>
      <div className="hand">
        {hand.map((tile) => {
          const playable = playableTileIds.has(tile.id);
          return (
            <div
              key={tile.id}
              className={`domino-tile ${playable ? 'playable' : 'dim'} ${selected === tile.id ? 'selected' : ''}`}
              onClick={() => onTileClick(tile.id)}
            >
              <HalfPips value={tile.a} />
              <div className="divider" />
              <HalfPips value={tile.b} />
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <GameFrame
      meta={dominoesMeta}
      config={config}
      engine={dominoesEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setSelected(null);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      hand={dominoHand}
      reward={reward}
      renderChipExtra={(seat) => (
        <>
          {state.hands[seat.id]?.length ?? 0} {t('game.tiles')}
        </>
      )}
      winnerSummary={
        state.result
          ? state.result.pips
              .map((p, i) => `${seatName(i)}: ${p}`)
              .join(' · ') + (state.result.points > 0 ? ` — +${state.result.points}` : '')
          : null
      }
    >
      <GameCanvas camera={{ position: [0, 15, 16], fov: 45 }} minDistance={10} maxDistance={60}>
        <DominoBoard
          state={state}
          pieceSkin={pieceSkin.skin}
          tableSkin={tableSkin.skin}
          legalEnds={legalEnds}
          onEndClick={(end) => selected !== null && play(selected, end)}
        />
      </GameCanvas>
    </GameFrame>
  );
}

function HalfPips({ value }: { value: number }) {
  const spots = PIP_POS[value] ?? [];
  return (
    <div className="half">
      {spots.map(([x, y], i) => (
        <span key={i} className="pip" style={{ insetInlineStart: `${x * 100}%`, top: `${y * 100}%` }} />
      ))}
    </div>
  );
}
