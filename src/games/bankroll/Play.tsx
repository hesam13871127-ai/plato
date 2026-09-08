import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { bankrollEngine, spreadMultiplier, START_CHIPS } from './engine';
import { BankrollTable } from './Board';
import { bankrollMeta } from './meta';

const ACCENTS = ['#f59e0b', '#22d3ee', '#fb7185', '#a3e635'];

export function BankrollPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [stake, setStake] = useState(10);
  const recordResult = useProfile((s) => s.recordResult);
  const tableSkin = useSkin(bankrollMeta.skins, 'table');
  const felt = tableSkin.skin?.colors.felt ?? '#1e3a2f';

  const rt = useGameRuntime(bankrollEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = bankrollEngine.currentPlayers(state);
  const actor = actors[0] ?? null;
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const isMyTurn = actor === viewer && config.slots[viewer]?.kind === 'human' && state.banks[viewer]! > 0;

  const myBank = state.banks[viewer] ?? 0;
  const [lo, hi] = state.table ? [...state.table].sort((a, b) => a - b) : [0, 0];
  const spread = hi - lo - 1;
  const mult = spreadMultiplier(Math.max(0, spread));
  const ev = state.lastEvent;

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== null ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        isMyTurn
          ? `${lo} — ${hi} · ×${mult} · ${t('game.chips')}: ${myBank}`
          : ev
            ? ev.kind === 'win'
              ? `✅ ${seatName(ev.player)} +${ev.payout}`
              : ev.kind === 'post'
                ? `💥 ${seatName(ev.player)} ${ev.payout}`
                : ev.kind === 'lose'
                  ? `❌ ${seatName(ev.player)} ${ev.payout}`
                  : `⏭ ${seatName(ev.player)}`
            : t('game.thinking')
      }
    />
  );

  const actions = (
    <div className="bet-controls">
      {isMyTurn && (
        <>
          <input
            className="bet-slider"
            type="range"
            min={1}
            max={Math.max(1, myBank)}
            value={Math.min(stake, Math.max(1, myBank))}
            onChange={(e) => setStake(Number(e.target.value))}
          />
          <span className="bet-value">
            {Math.min(stake, Math.max(1, myBank))} 💰
          </span>
          <Button variant="primary" onClick={() => dispatch({ type: 'bet', amount: Math.min(stake, myBank) })}>
            🃏 {t('game.bet')}
          </Button>
          <Button onClick={() => dispatch({ type: 'pass' })}>⏭ {t('game.pass')}</Button>
        </>
      )}
    </div>
  );

  return (
    <GameFrame
      meta={bankrollMeta}
      config={config}
      engine={bankrollEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        setStake(10);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => <>💰 {state.banks[seat.id] ?? 0}</>}
      winnerSummary={`${t('game.stake')}: ${Math.min(stake, Math.max(1, myBank))} · ${lo}…${hi} (×${mult})`}
    >
      <GameCanvas camera={{ position: [0, 8.6, 8.8], fov: 46 }} minDistance={6} maxDistance={22} maxPolarAngle={1.25}>
        <BankrollTable
          table={state.table}
          resultCard={ev && ev.card !== null && (ev.kind === 'win' || ev.kind === 'lose' || ev.kind === 'post') ? ev.card : null}
          names={config.slots.map((s) => s.name)}
          accents={ACCENTS}
          banks={state.banks}
          felt={felt}
          turn={state.turn}
        />
      </GameCanvas>
    </GameFrame>
  );
}
