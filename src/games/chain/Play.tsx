import { useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { chainEngine } from './engine';
import { ChainTable, LetterTower } from './Board';
import { chainMeta } from './meta';

const ACCENTS = ['#a3e635', '#f472b6', '#38bdf8', '#fbbf24'];

export function ChainPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t, lang } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const tableSkin = useSkin(chainMeta.skins, 'table');
  const felt = tableSkin.skin?.colors.felt ?? '#1e2b1e';

  const rt = useGameRuntime(chainEngine, { ...config, lang: config.lang ?? 'fa' }, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = chainEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;
  const canRotate = isMyTurn && chainEngine.validate(state, { type: 'rotate' }, viewer);

  const submit = () => {
    if (!word.trim()) return;
    if (chainEngine.validate(state, { type: 'word', word }, viewer)) {
      dispatch({ type: 'word', word });
      setWord('');
      setError(null);
    } else {
      setError(t('game.badWord'));
    }
  };

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        <span>
          {t('game.startLetter')}: <b style={{ color: '#fff' }}>{state.letter}</b>
        </span>
      }
    />
  );

  const actions = (
    <div className="chain-form">
      {isMyTurn && (
        <>
          <input
            className="chain-input"
            dir={lang === 'fa' ? 'rtl' : 'ltr'}
            placeholder={t('game.typeWord')}
            value={word}
            maxLength={24}
            onChange={(e) => {
              setWord(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          <Button variant="primary" onClick={submit}>
            ⏎
          </Button>
          <Button onClick={() => dispatch({ type: 'forfeit' })}>💔 {t('game.forfeit')}</Button>
          {canRotate && (
            <Button onClick={() => dispatch({ type: 'rotate' })}>🔁 {t('game.rotateLetter')}</Button>
          )}
          {error && <span className="chain-error">{error}</span>}
        </>
      )}
    </div>
  );

  return (
    <GameFrame
      meta={chainMeta}
      config={config}
      engine={chainEngine}
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
      renderChipExtra={(seat) => (
        <>
          {'❤️'.repeat(Math.max(0, state.lives[seat.id] ?? 0)) || '💀'}
          {' '}
          · {t('game.score')} {state.score[seat.id] ?? 0}
        </>
      )}
      winnerSummary={
        state.words.length > 0
          ? `${t('game.chain')}: ${state.words.length} · ${state.words.slice(-3).join(' › ')}`
          : null
      }
    >
      <GameCanvas camera={{ position: [0, 8.8, 10.5], fov: 46 }} minDistance={7} maxDistance={24} maxPolarAngle={1.25}>
        <LetterTower letter={state.letter} accent={ACCENTS[actor ?? 0] ?? '#a3e635'} />
        <ChainTable
          state={state}
          accent={ACCENTS[actor ?? 0] ?? '#a3e635'}
          felt={felt}
          onTileClick={() => undefined}
        />
      </GameCanvas>
    </GameFrame>
  );
}
