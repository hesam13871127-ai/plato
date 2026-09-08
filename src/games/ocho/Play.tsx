import { useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { ActionRow, ColorPickerModal, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { ochoEngine, type OchoAction, type OchoCard, type OchoColor } from './engine';
import { OchoBoard } from './Board';
import { ochoMeta } from './meta';

const CARD_BG: Record<string, string> = {
  red: 'linear-gradient(160deg, #f43f5e, #9f1239)',
  yellow: 'linear-gradient(160deg, #facc15, #a16207)',
  green: 'linear-gradient(160deg, #22c55e, #14532d)',
  blue: 'linear-gradient(160deg, #3b82f6, #1e3a8a)',
};

const COLOR_DOT: Record<string, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
};

function cardLabel(value: string): string {
  if (value === 'skip') return '⊘';
  if (value === 'reverse') return '⇄';
  if (value === 'draw2') return '+2';
  if (value === 'wild4') return '+4';
  if (value === 'wild') return '8';
  return value;
}

function CardDom({
  card,
  playable,
  dim,
  onClick,
}: {
  card: OchoCard;
  playable: boolean;
  dim: boolean;
  onClick: () => void;
}) {
  const label = cardLabel(card.value);
  const isWild = card.color === 'wild';
  return (
    <div
      className={`card-tile ${playable ? 'playable' : ''} ${dim ? 'dim' : ''} ${isWild ? 'wild' : ''}`}
      style={isWild ? undefined : { background: CARD_BG[card.color] }}
      onClick={onClick}
      title={isWild ? 'Wild' : card.color}
    >
      <span className="corner tl">{label}</span>
      <span className="big">{label}</span>
      <span className="corner br">{label}</span>
    </div>
  );
}

export function OchoPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [pendingWild, setPendingWild] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const cardSkin = useSkin(ochoMeta.skins, 'cards');
  const tableSkin = useSkin(ochoMeta.skins, 'table');

  const rt = useGameRuntime(ochoEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = ochoEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';

  const legal = useMemo(
    () => (isMyTurn ? ochoEngine.legalActions(state, viewer) : []),
    [state, viewer, isMyTurn],
  );
  const playableIds = useMemo(
    () =>
      new Set(
        legal.filter((a): a is Extract<OchoAction, { type: 'play' }> => a.type === 'play').map((a) => a.cardId),
      ),
    [legal],
  );
  const canDraw = legal.some((a) => a.type === 'draw');
  const canPass = legal.some((a) => a.type === 'pass');

  const playCard = (cardId: number, chosenColor?: OchoColor) => {
    rt.dispatch({ type: 'play', cardId, chosenColor });
    setPendingWild(null);
  };

  const onCardClick = (card: OchoCard) => {
    if (!playableIds.has(card.id)) return;
    if (card.color === 'wild') {
      setPendingWild(card.id);
      return;
    }
    playCard(card.id);
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
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <span>
            {t('game.activeColor')}:{' '}
            <span
              style={{
                display: 'inline-block',
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: COLOR_DOT[state.activeColor],
                boxShadow: `0 0 8px ${COLOR_DOT[state.activeColor]}`,
              }}
            />
          </span>
          <span>{state.dir === 1 ? '↻' : '↺'}</span>
          {isMyTurn && <span>· {canDraw ? t('game.draw') : canPass ? t('game.pass') : t('game.pickCard')}</span>}
        </span>
      }
    />
  );

  const actions = (
    <ActionRow>
      {canDraw && (
        <Button variant="primary" onClick={() => rt.dispatch({ type: 'draw' })}>
          🂠 {t('game.draw')}
        </Button>
      )}
      {canPass && (
        <Button variant="primary" onClick={() => rt.dispatch({ type: 'pass' })}>
          ⏭ {t('game.pass')}
        </Button>
      )}
    </ActionRow>
  );

  const handDom = (
    <div className="hand-wrap">
      <div className="hand-label">
        {t('game.hand')} · {seatName(viewer)} — {hand.length} {t('game.cards')}
      </div>
      <div className="hand">
        {hand.map((card) => (
          <CardDom
            key={card.id}
            card={card}
            playable={playableIds.has(card.id)}
            dim={!playableIds.has(card.id)}
            onClick={() => onCardClick(card)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <GameFrame
      meta={ochoMeta}
      config={config}
      engine={ochoEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setPendingWild(null);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      hand={handDom}
      reward={reward}
      renderChipExtra={(seat) => (
        <>
          {state.hands[seat.id]?.length ?? 0} {t('game.cards')}
        </>
      )}
      winnerSummary={state.winner !== null ? `+${state.points}` : null}
    >
      <GameCanvas camera={{ position: [0, 9.5, 9.5], fov: 44 }} minDistance={7} maxDistance={26} maxPolarAngle={1.2}>
        <OchoBoard
          state={state}
          cardSkin={cardSkin.skin}
          tableSkin={tableSkin.skin}
          viewerSeat={viewer}
          canDraw={canDraw}
          onDraw={() => rt.dispatch({ type: 'draw' })}
        />
      </GameCanvas>
      {pendingWild !== null && (
        <ColorPickerModal
          onPick={(color) => playCard(pendingWild, color)}
          onCancel={() => setPendingWild(null)}
        />
      )}
    </GameFrame>
  );
}
