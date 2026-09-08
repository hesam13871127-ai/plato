import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { GameCanvas } from '../../ui/three/shared';
import { werewolfEngine, type WolfRole } from './engine';
import { WerewolfVillage } from './Board';
import { werewolfMeta } from './meta';

const ACCENTS = ['#8b5cf6', '#f59e0b', '#22d3ee', '#fb7185', '#a3e635', '#f472b6', '#38bdf8', '#fbbf24'];

export function WerewolfPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const recordResult = useProfile((s) => s.recordResult);

  const rt = useGameRuntime(werewolfEngine, config, {
    botDelayMs: 1100,
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = werewolfEngine.currentPlayers(state);
  const actor = actors[0] ?? null;
  const viewer = config.slots.find((s) => s.kind === 'human')?.id ?? 0;
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const myRole = state.roles[viewer] as WolfRole;
  const roleLabel: Record<WolfRole, string> = {
    werewolf: t('game.roleWerewolf'),
    seer: t('game.roleSeer'),
    doctor: t('game.roleDoctor'),
    villager: t('game.roleVillager'),
  };
  const isMyAction = actor === viewer && config.slots[viewer]?.kind === 'human' && state.alive[viewer];
  const myKnowledge = state.knowledge[viewer] ?? [];

  const legal = werewolfEngine.legalActions(state, viewer);
  const aliveList = Array.from({ length: state.playerCount }, (_, i) => i).filter((i) => state.alive[i]);

  const narration = (): string => {
    const e = state.lastEvent;
    if (!e) return '';
    switch (e.kind) {
      case 'night':
        return `🌙 ${t('game.night')} ${e.night}`;
      case 'kill':
        return `🩸 ${seatName(e.target)}${t('game.killedAtNight')} (${$roleName(e.role)})`;
      case 'saved':
        return `🩹 ${seatName(e.target)} — ${t('game.savedByDoctor')}`;
      case 'quiet-night':
        return `😴 ${t('game.quietNight')}`;
      case 'lynch':
        return `⚖️ ${seatName(e.target)}${t('game.lynched')} (${$roleName(e.role)})`;
      case 'tie':
        return `🤷 ${t('game.drawResult')}`;
      case 'claim':
        return `🔮 ${seatName(e.seer)}: ${seatName(e.target)} ${t('game.isWolf')}`;
      case 'gameover':
        return e.winner === 'village' ? t('game.villageWins') : t('game.wolvesWin');
      default:
        return '';
    }
  };
  const $roleName = (r: WolfRole) => roleLabel[r];

  const phaseHint = () => {
    if (state.phase === 'over') return narration();
    if (state.phase === 'night') {
      if (isMyAction) {
        if (myRole === 'werewolf') return t('game.pickVictim');
        if (myRole === 'doctor') return t('game.pickSave');
        return t('game.pickPeek');
      }
      return `🌙 ${t('game.night')} ${state.night}…`;
    }
    if (isMyAction) return t('game.voteOut');
    return `☀️ ${t('game.day')} ${state.night}`;
  };

  const banner = (
    <TurnBanner
      text={
        state.phase === 'over'
          ? state.winner === 'village'
            ? t('game.villageWins')
            : t('game.wolvesWin')
          : isMyAction
            ? t('game.yourTurn')
            : actor !== null
              ? t('game.turnOf', { name: seatName(actor) })
              : ''
      }
      hint={phaseHint()}
    />
  );

  // one pending action type per state: derive it from my role + phase
  const myActionType =
    state.phase === 'vote'
      ? ('vote' as const)
      : myRole === 'werewolf'
        ? ('wolfPick' as const)
        : myRole === 'doctor'
          ? ('save' as const)
          : ('peek' as const);

  const actions = (
    <div className="ww-targets">
      {isMyAction &&
        legal
          .reduce<number[]>((acc, a) => (acc.includes(a.target) ? acc : [...acc, a.target]), [])
          .map((target) => (
            <button key={target} className="t-btn" onClick={() => dispatch({ type: myActionType, target })}>
              {seatName(target)}
            </button>
          ))}
    </div>
  );

  return (
    <GameFrame
      meta={werewolfMeta}
      config={config}
      engine={werewolfEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => (state.alive[seat.id] ? '🟢' : '💀')}
      winnerSummary={narration()}
    >
      <GameCanvas camera={{ position: [0, 8.6, 9.4], fov: 46 }} minDistance={6} maxDistance={24} maxPolarAngle={1.3}>
        <WerewolfVillage state={state} names={config.slots.map((s) => s.name)} accents={ACCENTS} actor={actor} viewer={viewer} />
      </GameCanvas>

      <div className="ww-role-card">
        <span className="r-title">{t('game.yourRole')}</span>
        <span className="r-name" style={{ color: myRole === 'werewolf' ? '#fb7185' : '#a3e635' }}>
          {myRole === 'werewolf' ? '🐺' : myRole === 'seer' ? '🔮' : myRole === 'doctor' ? '🩹' : '🧑‍🌾'}{' '}
          {roleLabel[myRole]}
        </span>
        {!state.alive[viewer] && <span className="r-note">💀 {t('game.youDied')}</span>}
        {myRole === 'seer' && myKnowledge.length > 0 && (
          <span className="r-note">
            🔮 {t('game.seerSaw')}
            <br />
            {myKnowledge
              .filter((k) => state.roles[k.target] !== undefined)
              .map((k) => `${seatName(k.target)}: ${k.isWolf ? '🐺' : '😇'}`)
              .join(' · ')}
          </span>
        )}
        {myRole === 'werewolf' && (
          <span className="r-note">
            🐺:{' '}
            {aliveList
              .filter((i) => state.roles[i] === 'werewolf' && i !== viewer)
              .map((i) => seatName(i))
              .join(' · ') || '—'}
          </span>
        )}
        <span className="r-note">
          {narration()}
        </span>
      </div>
    </GameFrame>
  );
}
