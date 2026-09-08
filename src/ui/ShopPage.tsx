import { useMemo } from 'react';
import { games } from '../core/registry';
import type { SkinKind } from '../core/types';
import { useI18n } from '../i18n';
import { useProfile } from '../state/store';
import { Button, Toast, useToast } from './components';

export function ShopPage({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  const coins = useProfile((s) => s.coins);
  const owned = useProfile((s) => s.owned);
  const equipped = useProfile((s) => s.equipped);
  const buy = useProfile((s) => s.buy);
  const equip = useProfile((s) => s.equip);
  const [toast, showToast] = useToast();

  const kinds = useMemo(() => ['pieces', 'board', 'table', 'cards', 'dice'] as SkinKind[], []);

  return (
    <div>
      <div className="setup-head">
        <Button variant="ghost" onClick={onBack}>← {t('setup.back')}</Button>
        <h2>🛍 {t('shop.title')}</h2>
        <div style={{ flex: 1 }} />
        <div className="pill coin-pill">🪙 {coins} {t('shop.coins')}</div>
      </div>
      <div className="footer-note" style={{ marginTop: 0, marginBottom: 8 }}>{t('shop.earnHint')}</div>

      {games.map((g) => {
        const kindsUsed = kinds.filter((k) => g.skins.some((s) => s.kind === k));
        if (kindsUsed.length === 0) return null;
        return (
          <div key={g.id} className="shop-group">
            <h3 style={{ color: g.accent }}>{g.names[lang]}</h3>
            {kindsUsed.map((kind) => (
              <div key={kind}>
                <div className="shop-kinds">
                  <span className="tag accent">{t(`shop.kind.${kind}`)}</span>
                </div>
                <div className="shop-grid">
                  {g.skins
                    .filter((s) => s.kind === kind)
                    .map((skin) => {
                      const isOwned = skin.price === 0 || owned.includes(skin.id);
                      const isEquipped = (equipped[g.id]?.[kind] ?? g.skins.find((s) => s.kind === kind && s.price === 0)?.id) === skin.id;
                      return (
                        <div key={skin.id} className={`skin-card ${isEquipped ? 'equipped' : ''}`}>
                          <div className="preview">
                            <skin.Preview />
                          </div>
                          <div className="s-name">{skin.name[lang]}</div>
                          <div className="s-row">
                            <span className={`price ${skin.price === 0 ? 'free' : ''}`}>
                              {skin.price === 0 ? t('shop.free') : `🪙 ${skin.price}`}
                            </span>
                            {isEquipped ? (
                              <Button size="small" disabled>✓ {t('shop.equipped')}</Button>
                            ) : !isOwned ? (
                              <Button
                                size="small"
                                variant="primary"
                                onClick={() => {
                                  const ok = buy(skin.id, skin.price, g.id, kind);
                                  if (!ok) showToast(t('shop.notEnough'));
                                }}
                              >
                                {t('shop.buy')}
                              </Button>
                            ) : (
                              <Button size="small" onClick={() => equip(skin.id, g.id, kind)}>
                                {t('shop.equip')}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {toast && <Toast message={toast} />}
    </div>
  );
}
