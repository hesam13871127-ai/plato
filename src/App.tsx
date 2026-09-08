import { useState } from 'react';
import { getGame } from './core/registry';
import type { GameConfig } from './core/types';
import { I18nProvider, useI18n } from './i18n';
import { useProfile } from './state/store';
import { HubPage } from './ui/HubPage';
import { SetupPage } from './ui/SetupPage';
import { ShopPage } from './ui/ShopPage';

type Route =
  | { name: 'hub' }
  | { name: 'setup'; gameId: string }
  | { name: 'play'; gameId: string; config: GameConfig }
  | { name: 'shop' };

function Shell() {
  const { t, lang, setLang } = useI18n();
  const coins = useProfile((s) => s.coins);
  const [route, setRoute] = useState<Route>({ name: 'hub' });

  const showTopbar = route.name !== 'play';

  return (
    <div className="app">
      {showTopbar && (
        <header className="topbar">
          <div className="brand">
            <span className="logo-text">🎲 {t('app.title')}</span>
            <span className="logo-sub">{t('app.subtitle')}</span>
          </div>
          <div className="spacer" />
          <div className="pill coin-pill" title={t('hub.coins')}>
            🪙 <span>{coins}</span>
          </div>
          <button className="btn small" onClick={() => setRoute({ name: 'shop' })}>
            🛍 {t('hub.shop')}
          </button>
          <button className="btn small" onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}>
            {lang === 'fa' ? 'EN' : 'فا'}
          </button>
        </header>
      )}

      <main className="main">
        {route.name === 'hub' && (
          <HubPage onPlay={(id) => setRoute({ name: 'setup', gameId: id })} onShop={() => setRoute({ name: 'shop' })} />
        )}
        {route.name === 'setup' && (
          <SetupPage
            meta={getGame(route.gameId)}
            onBack={() => setRoute({ name: 'hub' })}
            onStart={(config) => setRoute({ name: 'play', gameId: route.gameId, config })}
          />
        )}
        {route.name === 'play' && (
          <PlayRoute key={`${route.gameId}-${route.config.seed}`} gameId={route.gameId} config={route.config} onExit={() => setRoute({ name: 'hub' })} />
        )}
        {route.name === 'shop' && <ShopPage onBack={() => setRoute({ name: 'hub' })} />}
      </main>
    </div>
  );
}

function PlayRoute({ gameId, config, onExit }: { gameId: string; config: GameConfig; onExit: () => void }) {
  const meta = getGame(gameId);
  const Play = meta.Play;
  return (
    <div style={{ margin: '-10px -26px -30px', height: 'calc(100vh)' }}>
      <Play config={config} onExit={onExit} />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}
