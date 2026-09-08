import { useEffect, useMemo, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { ActionRow, GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { LUDO_COLORS, ludoEngine, movableTokens } from './engine';
import { LudoBoard } from './Board';
import { ludoMeta } from './meta';

export function LudoPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const recordResult = useProfile((s) => s.recordResult);
  const pieceSkin = useSkin(ludoMeta.skins, 'pieces');
  const boardSkin = useSkin(ludoMeta.skins, 'board');

  const rt = useGameRuntime(ludoEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state } = rt;

  const actors = ludoEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';

  // spin animation whenever a new roll lands
  useEffect(() => {
    if (state.lastEvent?.kind === 'roll' || state.lastEvent?.kind === 'forfeit' || state.lastEvent?.kind === 'skip') {
      setSpinning(true);
      const timer = window.setTimeout(() => setSpinning(false), 520);
      return () => window.clearTimeout(timer);
    }
  }, [state.lastEvent]);

  const movable = useMemo(
    () => (isMyTurn && state.phase === 'move' ? movableTokens(state, viewer, state.dice ?? 0) : []),
    [state, viewer, isMyTurn],
  );

  const canRoll = isMyTurn && state.phase === 'roll';
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const actor = actors[0];
  const homeCount = (p: number) => state.tokens[p]?.filter((tk) => tk.step === 56).length ?? 0;

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        isMyTurn
          ? state.phase === 'roll'
            ? t('game.roll')
            : state.dice === 6
              ? `🎲 6 — ${t('game.pickToken')}`
              : `🎲 ${state.dice} — ${t('game.pickToken')}`
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
    </ActionRow>
  );

  return (
    <GameFrame
      meta={ludoMeta}
      config={config}
      engine={ludoEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={LUDO_COLORS as unknown as string[]}
      renderChipExtra={(seat) => <>🏠 {homeCount(seat.id)}/4</>}
      winnerSummary={config.slots.map((s) => `${s.name}: ${homeCount(s.id)}/4`).join(' · ')}
    >
      <GameCanvas camera={{ position: [0, 16.5, 13.5], fov: 42 }} minDistance={10} maxDistance={36} maxPolarAngle={1.15}>
        <LudoBoard
          state={state}
          pieceSkin={pieceSkin.skin}
          boardSkin={boardSkin.skin}
          movable={movable}
          onTokenClick={(token) => rt.dispatch({ type: 'move', token })}
          spinning={spinning}
        />
      </GameCanvas>
    </GameFrame>
  );
}
