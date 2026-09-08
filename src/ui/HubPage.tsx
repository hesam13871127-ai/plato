import { useState } from 'react';
import { games } from '../core/registry';
import { useI18n } from '../i18n';
import { Button } from './components';
import { TutorialModal } from './hud';

export function HubPage({ onPlay, onShop }: { onPlay: (gameId: string) => void; onShop: () => void }) {
  const { t, lang } = useI18n();
  const [tutFor, setTutFor] = useState<string | null>(null);
  const tutMeta = tutFor ? games.find((g) => g.id === tutFor) : null;

  return (
    <div>
      <div className="hub-grid">
        {games.map((g) => (
          <div key={g.id} className="game-card" style={{ ['--accent' as string]: g.accent }} onClick={() => onPlay(g.id)}>
            <div className="glow" />
            <div className="logo-canvas">
              <g.Logo />
            </div>
            <div className="card-body">
              <div className="g-name">{g.names[lang]}</div>
              <div className="g-name-en">{g.names.en}</div>
              <div className="g-meta">
                <span className="tag accent">
                  👥 {g.minPlayers}
                  {g.maxPlayers > g.minPlayers ? `–${g.maxPlayers}` : ''} {t('hub.players')}
                </span>
                <span className="tag">🎲 3D</span>
              </div>
              <div className="card-actions">
                <Button variant="primary" accent={g.accent} onClick={() => onPlay(g.id)}>
                  ▶ {t('hub.play')}
                </Button>
                <Button
                  onClick={() => setTutFor(g.id)}
                  title={t('hub.tutorial')}
                >
                  ❓
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {tutMeta && <TutorialModal meta={tutMeta} onClose={() => setTutFor(null)} />}
      <div className="footer-note">
        {t('hub.progress')} · <Button size="small" variant="ghost" onClick={onShop}>🛍 {t('hub.shop')}</Button>
      </div>
    </div>
  );
}
