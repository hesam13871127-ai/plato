# VibeTable Admin Web Panel

A dependency-free browser panel (plain HTML + CSS + vanilla JavaScript, no build
step) served by the backend at **`/panel`**.

- Local: `http://localhost:3000/panel`
- Production: `https://<your-api-host>/panel`

## What it does

- **Overview** — users, active games, matches today/total, open reports, coins/pips
  in circulation, top games and a 14-day matches chart.
- **Users** — search by email/phone/username, suspend, ban (chat/login/matchmaking/
  permanent), lift bans, grant/revoke admin role, and grant or deduct coins/pips
  with an audited reason.
- **Shop** — full catalogue control: add/edit/delete items, set type (frame,
  banner, bubble, theme, skin, id color, dice set, emote, bundle, consumable),
  rarity, price, currency, discount, stock, availability, unique-owned and
  giftable flags.
- **Games** — add games, edit player counts / duration / bots / ranked flags,
  switch between **active / maintenance / coming soon**, and delete games that
  have no recorded matches (games with match history must be disabled instead).
- **Seasons** — list seasons and trigger an immediate season rollover (rank
  snapshot + reward grants).
- **Reports & Chat** — resolve player reports (dismiss / warn / mute / ban /
  delete content), review auto-flagged content, view/lift active bans, delete
  offending messages by ID, ban users by ID, read the audit trail and the
  error/security event feed.

## Security

The page itself is a static shell. **Every action** calls the same JWT-protected
`/api/admin/*` and `/api/moderation/*` routes used by the mobile app; the server
enforces the `admin` (or `moderator`) role on every endpoint. In development a
demo admin (`admin@vibetable.local` / `Admin123!`) is seeded automatically;
set `DEV_SEED_ADMIN=false` (or `NODE_ENV=production`) to disable it.

Files: `index.html` (structure), `styles.css` (dark glassmorphism brand theme),
`app.js` (all panel logic). Served via `ServeStaticModule` under `/panel`,
excluding `/api`, `/docs` and `/health`.
