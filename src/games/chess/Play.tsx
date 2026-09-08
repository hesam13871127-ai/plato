import { useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { Button, Modal } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { chessEngine, inCheckNow, type ChessMove } from './engine';
import { ChessBoard } from './Board';
import { chessMeta } from './meta';

const PROMO_LABEL: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞' };

export function ChessPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pendingPromo, setPendingPromo] = useState<ChessMove | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const pieceSkin = useSkin(chessMeta.skins, 'pieces');
  const boardSkin = useSkin(chessMeta.skins, 'board');

  const rt = useGameRuntime(chessEngine, config, {
    botDelayMs: 650,
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = chessEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const check = !chessEngine.isGameOver(state) && inCheckNow(state);

  const doMove = (move: ChessMove) => {
    const piece = state.board[move.from];
    const lastRank = viewer === 0 ? 7 : 0;
    if (piece?.type === 'p' && (move.to / 8 | 0) === lastRank && !move.promo) {
      setPendingPromo(move);
      return;
    }
    rt.dispatch(move);
    setSelected(null);
  };

  /** pieces white has captured (= 15 black set pieces minus what's still on the board) */
  const capturedByWhite = useMemo(() => {
    let black = 15;
    for (const p of state.board) if (p && p.color === 'b' && p.type !== 'k') black--;
    return 15 - black;
  }, [state.board]);

  const banner = (
    <TurnBanner
      text={
        chessEngine.isGameOver(state)
          ? state.status === 'checkmate'
            ? `♛ ${t('game.winner', { name: seatName(state.winner === 'w' ? 0 : 1) })}`
            : state.status === 'stalemate'
              ? `🤝 ${t('game.drawResult')}`
              : `🤝 ${t('game.drawResult')}`
          : isMyTurn
            ? `${check ? '‼ ' + t('game.check') + ' — ' : ''}${t('game.yourTurn')}`
            : `${check ? '‼ ' + t('game.check') + ' — ' : ''}${t('game.turnOf', { name: seatName(actor) })}`
      }
      hint={isMyTurn ? (selected !== null ? t('game.pickTarget') : t('game.pickPiece')) : t('game.thinking')}
    />
  );

  return (
    <GameFrame
      meta={chessMeta}
      config={config}
      engine={chessEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setSelected(null);
        setPendingPromo(null);
        rt.restart();
      }}
      banner={banner}
      reward={reward}
      renderChipExtra={(seat) => (seat.id === 0 ? `⚔ ${capturedByWhite}` : `⚔ ${15 - capturedByWhite}`)}
      winnerSummary={
        state.status === 'checkmate'
          ? t('game.checkmate')
          : state.status === 'stalemate'
            ? t('game.stalemate')
            : t('game.drawResult')
      }
    >
      <GameCanvas camera={{ position: [0, 11.5, 10], fov: 42 }} minDistance={8} maxDistance={30} maxPolarAngle={1.2}>
        <ChessBoard
          state={state}
          pieceSkin={pieceSkin.skin}
          boardSkin={boardSkin.skin}
          viewerSeat={(viewer === 1 ? 1 : 0) as 0 | 1}
          interactive={isMyTurn}
          selected={selected}
          onSelect={setSelected}
          onMove={doMove}
        />
      </GameCanvas>
      {pendingPromo && (
        <Modal onClose={() => setPendingPromo(null)}>
          <h2>{t('game.promote')}</h2>
          <div className="color-picker">
            {(['q', 'r', 'b', 'n'] as const).map((p) => (
              <button
                key={p}
                className="btn"
                style={{ fontSize: 34, width: 64, height: 64 }}
                onClick={() => {
                  rt.dispatch({ ...pendingPromo, promo: p });
                  setPendingPromo(null);
                  setSelected(null);
                }}
              >
                {PROMO_LABEL[p]!}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </GameFrame>
  );
}
