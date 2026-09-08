import { useState, type ReactNode } from 'react';
import type { GameConfig, GameEngine, GameMeta, PlayerSlot } from '../core/types';
import { useI18n } from '../i18n';
import { SEAT_COLORS } from '../state/store';
import { Button, Modal } from './components';

/* ------------------------------------------------------------------ */

export function SeatChip({
  slot,
  color,
  active,
  winner,
  extra,
}: {
  slot: PlayerSlot;
  color: string;
  active?: boolean;
  winner?: boolean;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className={`chip ${active ? 'active' : ''} ${winner ? 'winner' : ''}`}>
      <span className="c-dot" style={{ background: color }} />
      <span className="c-name">{slot.name}</span>
      {extra && <span className="c-extra">{extra}</span>}
      {slot.kind === 'bot' && (
        <span className="c-extra" title={t('common.bot')}>
          🤖
        </span>
      )}
    </div>
  );
}

export function TurnBanner({ text, hint }: { text: string; hint?: ReactNode }) {
  return (
    <div className="turn-banner">
      {text}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function WinnerModal({
  winners,
  slots,
  reward,
  summary,
  onRematch,
  onExit,
}: {
  winners: number[];
  slots: PlayerSlot[];
  reward: number | null;
  summary?: ReactNode;
  onRematch?: () => void;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const names = winners.map((w) => slots.find((s) => s.id === w)?.name ?? '?').join(' و ');
  return (
    <Modal>
      <div className="winner-emoji">{winners.length ? '🏆' : '🤝'}</div>
      <div className="winner-name">
        {winners.length ? t('game.winner', { name: names }) : t('game.drawResult')}
      </div>
      {summary && <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>{summary}</div>}
      {reward !== null && reward > 0 && (
        <div className="reward-line">
          🪙 {reward} {t('hub.coins')}
        </div>
      )}
      <div className="modal-actions" style={{ justifyContent: 'center' }}>
        {onRematch && <Button onClick={onRematch} variant="primary">{t('game.rematch')}</Button>}
        <Button onClick={onExit}>{t('game.backToHub')}</Button>
      </div>
    </Modal>
  );
}

export function TutorialModal({ meta, onClose }: { meta: GameMeta; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [i, setI] = useState(0);
  const steps = meta.tutorial[lang];
  const step = steps[i];
  if (!step) return null;
  return (
    <Modal onClose={onClose}>
      <h2>
        {t('tut.title')} — {meta.names[lang]}
      </h2>
      <div className="sub">{meta.tagline[lang]}</div>
      <div className="tut-step">
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </div>
      <div className="tut-progress">
        {steps.map((_, k) => (
          <i key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
      <div className="modal-actions">
        <span style={{ fontSize: 12.5, color: 'var(--text-dim)', alignSelf: 'center', marginInlineEnd: 'auto' }}>
          {t('tut.step', { n: String(i + 1), m: String(steps.length) })}
        </span>
        <Button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          {t('tut.prev')}
        </Button>
        {i < steps.length - 1 ? (
          <Button variant="primary" onClick={() => setI(i + 1)}>
            {t('tut.next')}
          </Button>
        ) : (
          <Button variant="primary" onClick={onClose}>
            {t('tut.close')}
          </Button>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Shared in-game screen: top bar, side rail with seat chips, canvas area with
 * banner + action overlays, and the winner modal.
 */
export function GameFrame<S, A>({
  meta,
  config,
  engine,
  state,
  onExit,
  onRematch,
  seatColors,
  renderChipExtra,
  banner,
  actions,
  hand,
  winnerSummary,
  reward,
  children,
}: {
  meta: GameMeta;
  config: GameConfig;
  engine: GameEngine<S, A>;
  state: S;
  onExit: () => void;
  onRematch?: () => void;
  seatColors?: string[];
  renderChipExtra?: (seat: PlayerSlot) => ReactNode;
  banner?: ReactNode;
  actions?: ReactNode;
  hand?: ReactNode;
  winnerSummary?: ReactNode;
  reward?: number | null;
  children: ReactNode;
}) {
  const { t, lang } = useI18n();
  const [showTut, setShowTut] = useState(false);
  const over = engine.isGameOver(state);
  const winners = over ? engine.winners(state) : [];
  const actors = over ? [] : engine.currentPlayers(state);

  return (
    <div className="game-frame">
      <div className="game-topbar">
        <Button size="small" variant="ghost" onClick={onExit}>
          ← {t('game.back')}
        </Button>
        <div>
          <div className="g-title">{meta.names[lang]}</div>
          <div className="g-tag">{meta.tagline[lang]}</div>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <Button size="small" onClick={() => setShowTut(true)}>
          ❓ {t('hub.tutorial')}
        </Button>
      </div>

      <div className="game-body">
        <div className="canvas-wrap">
          {children}
          {banner}
          {actions}
          {hand}
        </div>
        <div className="game-side">
          {config.slots.map((slot) => (
            <SeatChip
              key={slot.id}
              slot={slot}
              color={seatColors?.[slot.id] ?? SEAT_COLORS[slot.id % 4]}
              active={actors.includes(slot.id)}
              winner={winners.includes(slot.id)}
              extra={renderChipExtra?.(slot)}
            />
          ))}
        </div>
      </div>

      {showTut && <TutorialModal meta={meta} onClose={() => setShowTut(false)} />}
      {over && (
        <WinnerModal
          winners={winners}
          slots={config.slots}
          reward={reward ?? null}
          summary={winnerSummary}
          onRematch={onRematch}
          onExit={onExit}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="action-row">{children}</div>;
}

export function ColorPickerModal({ onPick, onCancel }: { onPick: (c: 'red' | 'yellow' | 'green' | 'blue') => void; onCancel: () => void }) {
  const { t } = useI18n();
  const colors: { id: 'red' | 'yellow' | 'green' | 'blue'; css: string }[] = [
    { id: 'red', css: '#ef4444' },
    { id: 'yellow', css: '#eab308' },
    { id: 'green', css: '#22c55e' },
    { id: 'blue', css: '#3b82f6' },
  ];
  return (
    <Modal onClose={onCancel}>
      <h2>{t('game.chooseColor')}</h2>
      <div className="color-picker">
        {colors.map((c) => (
          <button key={c.id} className="color-btn" style={{ background: c.css }} onClick={() => onPick(c.id)} />
        ))}
      </div>
      <div className="modal-actions">
        <Button onClick={onCancel}>{t('game.cancel')}</Button>
      </div>
    </Modal>
  );
}
