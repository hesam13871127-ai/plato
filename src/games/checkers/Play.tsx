import { useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { checkersEngine, type CheckersAction, type Square } from './engine';
import { CheckersBoard } from './Board';
import { checkersMeta } from './meta';

export function CheckersPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const pieceSkin = useSkin(checkersMeta.skins, 'pieces');
  const boardSkin = useSkin(checkersMeta.skins, 'board');

  const rt = useGameRuntime(checkersEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = checkersEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  const legal = useMemo(
    () => (isMyTurn ? checkersEngine.legalActions(state, viewer) : []),
    [state, viewer, isMyTurn],
  );
  const mustCapture = legal.some((a) => Math.abs(a.to[0] - a.from[0]) === 2);

  const doMove = (action: CheckersAction) => {
    rt.dispatch(action);
    setSelected(null);
  };

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        isMyTurn
          ? state.chainFrom
            ? t('game.chain')
            : mustCapture
              ? `⚔ ${t('game.mustCapture')}`
              : selected
                ? t('game.pickTarget')
                : t('game.pickPiece')
          : t('game.thinking')
      }
    />
  );

  return (
    <GameFrame
      meta={checkersMeta}
      config={config}
      engine={checkersEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setSelected(null);
        rt.restart();
      }}
      banner={banner}
      reward={reward}
      renderChipExtra={(seat) => <>⚔ {state.captured[seat.id] ?? 0}</>}
      winnerSummary={`⚔ ${state.captured[0]}–${state.captured[1]}`}
    >
      <GameCanvas camera={{ position: [0, 12.5, 10.5], fov: 42 }} minDistance={8} maxDistance={30} maxPolarAngle={1.2}>
        <CheckersBoard
          state={state}
          pieceSkin={pieceSkin.skin}
          boardSkin={boardSkin.skin}
          viewerSeat={(viewer === 1 ? 1 : 0) as 0 | 1}
          interactive={isMyTurn}
          selected={selected}
          legal={legal}
          onSelect={setSelected}
          onMove={doMove}
        />
      </GameCanvas>
    </GameFrame>
  );
}
