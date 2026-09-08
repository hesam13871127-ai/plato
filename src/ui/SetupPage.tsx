import { useMemo, useState } from 'react';
import type { GameConfig, GameMeta, PlayerSlot } from '../core/types';
import { useI18n } from '../i18n';
import { BOT_NAMES, SEAT_COLORS, useProfile } from '../state/store';
import { Button } from './components';

export function SetupPage({
  meta,
  onBack,
  onStart,
}: {
  meta: GameMeta;
  onBack: () => void;
  onStart: (config: GameConfig) => void;
}) {
  const { t, lang } = useI18n();
  const myName = useProfile((s) => s.name);
  const [count, setCount] = useState(2);
  const [slots, setSlots] = useState<PlayerSlot[]>(() =>
    [0, 1, 2, 3].map((id) => ({
      id,
      kind: id === 0 ? 'human' : 'bot',
      name: id === 0 ? '' : BOT_NAMES[lang][id] ?? `Bot ${id}`,
      difficulty: 'medium' as const,
    })),
  );

  const update = (id: number, patch: Partial<PlayerSlot>) =>
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const activeCount = Math.min(Math.max(count, meta.minPlayers), meta.maxPlayers);
  const canStart = useMemo(
    () => slots.slice(0, activeCount).every((s) => s.kind === 'human' || s.kind === 'bot'),
    [slots, activeCount],
  );

  const start = () => {
    const chosen = slots.slice(0, activeCount).map((s, i) => ({
      ...s,
      name: s.name.trim() || (s.id === 0 ? myName.trim() || t('setup.you') : `${BOT_NAMES[lang][i] ?? 'Bot'} ${i}`),
    }));
    onStart({ slots: chosen, seed: (Date.now() % 2 ** 31) | 1, lang });
  };

  return (
    <div className="setup-wrap">
      <div className="setup-head">
        <Button variant="ghost" onClick={onBack}>← {t('setup.back')}</Button>
        <h2>
          {meta.names[lang]} <span style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 400 }}>{meta.tagline[lang]}</span>
        </h2>
      </div>

      {meta.maxPlayers > meta.minPlayers && (
        <div className="setup-count">
          {Array.from({ length: meta.maxPlayers - meta.minPlayers + 1 }, (_, i) => meta.minPlayers + i).map((n) => (
            <button key={n} className={`count-btn ${n === activeCount ? 'on' : ''}`} onClick={() => setCount(n)}>
              {n}
            </button>
          ))}
        </div>
      )}

      {slots.slice(0, activeCount).map((slot) => (
        <div key={slot.id} className="seat-row">
          <span className="seat-dot" style={{ background: SEAT_COLORS[slot.id % 4] }} />
          <input
            className="name-input"
            placeholder={slot.id === 0 ? myName || t('setup.you') : t('setup.name')}
            value={slot.name}
            onChange={(e) => update(slot.id, { name: e.target.value })}
          />
          {slot.id !== 0 && (
            <div className="seat-kind">
              <button className={slot.kind === 'human' ? 'on' : ''} onClick={() => update(slot.id, { kind: 'human' })}>
                {t('setup.human')}
              </button>
              <button className={slot.kind === 'bot' ? 'on' : ''} onClick={() => update(slot.id, { kind: 'bot' })}>
                {t('setup.bot')}
              </button>
            </div>
          )}
          {slot.kind === 'bot' && (
            <div className="seat-diff">
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <button key={d} className={slot.difficulty === d ? 'on' : ''} onClick={() => update(slot.id, { difficulty: d })}>
                  {t(`setup.${d}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
        <Button variant="primary" disabled={!canStart} onClick={start}>
          🎮 {t('setup.start')}
        </Button>
      </div>
    </div>
  );
}
