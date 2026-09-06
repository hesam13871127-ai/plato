# Phase 10 — Final Testing Checklist & Deployment Guide

Phase 10 ships the **full admin panel** (user, shop, game, season and
analytics management for admins; moderation-only scope for moderators),
extends automated test coverage, and finalises production deployment.

---

## 1. What was added

### Backend (`backend/src/admin/`)

| Route (all under `/api/admin`, JWT + `@Roles('admin')`) | Purpose |
| --- | --- |
| `GET  /overview` | Platform analytics: total/active users, games, matches (all + today), coins & pips in circulation, matches per day (14 d), top games. |
| `GET  /users?search=&status=&limit=&offset=` | Paginated user directory (search by email/phone/username/display name; bots excluded). |
| `PATCH /users/:userId` | Edit display name / account status / role. |
| `POST /users/ban` · `POST /users/lift-ban` | Temporary/permanent bans and reversals (delegates to `ModerationService`, JWT revoked on ban). |
| `POST /users/grant-currency` | Credit/debit coins or pips (`amount` signed); recorded as `admin_adjustment` economy ledger entry and audit. |
| `GET/POST /shop/items` · `DELETE /shop/items/:id` | Full shop CRUD (post body with `id` = update). |
| `GET/POST /games` · `PATCH /games/:slug` · `POST /games/status` | Game catalogue management. Activating a game whose engine is not registered is rejected (`400`); engine-less games are forced to `coming_soon`. |
| `GET /seasons` · `POST /seasons/rollover` | Season list and manual rollover (snapshot ranks → grant tier & game rewards → next season). |

Every state-changing action is written to the audit log
(`moderation.writeAudit`) with actor, action, target and reason.

### Mobile (`mobile/lib/features/admin/`)

- `data/admin_remote_data_source.dart` — typed API client + view models
  (`AdminOverview`, `AdminUser`, `AdminShopItem`, `AdminGame`).
- `presentation/screens/admin_panel_screen.dart` — role-gated 6-tab panel
  (Overview, Users, Shop, Games, Seasons, link to Moderation dashboard).
- Tabs: analytics overview, user management (search, suspend/reactivate,
  mute, ban/lift-ban, promote/demote admin, grant/deduct coins & pips),
  shop CRUD editor, game status controls + add-game, season list +
  rollover with confirmation.
- Route `/admin` registered in `app_router.dart`; the profile screen shows
  an **Admin panel** entry for `admin` accounts and the **Moderation
  dashboard** entry for `moderator` + `admin` accounts. Role is read from
  the server; the server guard is authoritative.

### Security model

- Admins only: every admin route uses `JwtAuthGuard` + `RolesGuard` with
  `@Roles('admin')`. Players receive `403`; moderators are **not** admins
  and cannot reach admin routes (verified by e2e).
- Staff bootstrap via env (`MODERATION_ADMIN_EMAILS`,
  `MODERATION_ADMIN_PHONES`, `MODERATION_MODERATOR_EMAILS`) — promotes on
  login, never downgrades an already-staffed account.
- Bans immediately invalidate the banned user's refresh token.
- Currency adjustments are ledger-backed and audited.

---

## 2. Automated tests

Backend e2e (`backend/`):

```bash
npm ci
npm test:e2e          # runs all test/*.e2e-spec.ts
# or: npx jest --config test/jest-e2e.json
```

Current result: **9 suites / 93 tests passing.**

New suite `test/admin.e2e-spec.ts` (8 tests) covers: player forbidden,
overview payload, user search, currency grant/deduct, shop
create/edit/delete, game maintenance/re-enable, engine-less game forced to
`coming_soon` and rejected for activation, and the season list.

Type check:

```bash
npx tsc --noEmit -p tsconfig.build.json   # exits 0
```

---

## 3. Manual QA checklist (Flutter, Windows host)

Run against the local API (`docker compose up`) or a staging server.

### Access control
- [ ] **Creating the first admin**: set `MODERATION_ADMIN_EMAILS` (or
      `MODERATION_ADMIN_PHONES`) to *your* account, then **register or log
      in once** — you are promoted immediately (no restart needed; the
      startup seeder also promotes already-existing accounts). The mobile
      profile screen then shows the **Admin panel** button.
- [ ] A normal player profile screen shows **no** Admin/Moderation entry;
      deep-linking `/admin` is blocked server-side (403 → friendly error).
- [ ] A moderator sees only **Moderation dashboard**, not Admin panel.
- [ ] An admin sees both; admin token works, and logging out removes access.

### Overview
- [ ] Stats cards populate (users, active 7 d, games, matches today/overall,
      coins/pips circulation); matches-per-day chart renders; top games list
      shows match counts.

### Users
- [ ] Search by email / phone / username / display name returns matching
      non-bot accounts; pagination (limit/offset) works.
- [ ] Suspend → account shows `suspended`; reactivate restores `active`.
- [ ] Mute 24 h → user cannot send chat messages until it expires.
- [ ] Ban (temp with reason / permanent) → the banned session is logged out
      on next refresh; lift-ban restores login.
- [ ] Make admin / remove admin flips the role; removing your own admin role
      is reflected on next login.
- [ ] Grant coins/pips adds balance; deduct with an amount larger than the
      balance is rejected by the ledger; both appear in the user's wallet
      history and the audit log.

### Shop
- [ ] New item appears in the shop list immediately after saving.
- [ ] Editing name/price/rarity/currency/type/availability persists.
- [ ] Toggle "available" hides the item from players while keeping it in the
      catalogue; delete removes it after confirmation.

### Games
- [ ] Each catalogue game shows slug, player range, bots/ranked flags, and a
      coloured status chip.
- [ ] Enable / Maintenance / Disable / Coming-soon buttons change status;
      maintenance games disappear from the player hub and block new matches.
- [ ] Adding a game without a backend engine stores it as `coming_soon`;
      attempting to enable it shows the server's 400 error.

### Seasons
- [ ] Seasons list shows number, name, dates, status (active highlighted).
- [ ] Rollover requires confirmation; after it completes a new active season
      exists and players have received tier + game rewards (check a profile's
      coin/pips delta and audit entries).

### Regression (prior phases)
- [ ] Phone OTP signup/login works; refresh token flow works.
- [ ] All four games play end-to-end (real players + invisible bots), XP/
      rank/coins update post-match, chat works, haptics/sounds fire.
- [ ] Matchmaking/queue, friend list, profile, shop purchase all work.
- [ ] No Google/Apple sign-in anywhere.

---

## 4. Deployment

### One-command stack (Docker)

```bash
# 1. Configure secrets
cp backend/.env.example backend/.env     # then edit secrets
export JWT_ACCESS_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export MODERATION_ADMIN_EMAILS="owner@vibetable.app"
export CORS_ORIGINS="https://your-mobile-web-host.example"

# 2. Start MySQL + API. MySQL is initialised from database/schema.sql and
#    the API also runs TypeORM migrations on boot (DB_RUN_MIGRATIONS=true).
docker compose up -d --build

docker compose logs -f api               # watch migration + bootstrap
curl -s http://localhost:3000/health     # {"status":"ok",...}
```

Production notes:

- Set `NODE_ENV=production`, strong unique JWT secrets (≥ 32 chars), real
  MySQL credentials, and `CORS_ORIGINS` to the exact web origin(s).
- `DB_SYNCHRONIZE=false` always in production — schema comes from
  `database/schema.sql` / migrations only.
- SMS: set `SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.
- The first account registered with an email/phone listed in
  `MODERATION_ADMIN_*` becomes admin; promote additional staff from the
  admin panel (Users → make admin).
- Recommended in front of the API: TLS-terminating reverse proxy (nginx/
  Caddy), and only port 443 exposed publicly.

### Mobile release build

```bash
cd mobile
flutter analyze          # expect "No issues found"
flutter build apk --release      # Android
flutter build ios --release      # iOS (macOS)
```

Point the client at the production API base URL via the app's environment
configuration before building.

### Rollback / operations

- Database volume `vibetable-mysql-data` persists data; back it up with
  `docker compose exec mysql mysqldump -uvibetable -pvibetable vibetable > backup.sql`.
- Season rollover is irreversible; run it at the scheduled season boundary
  and take a backup first.
- Audit log (moderation events, admin actions) is queryable from the
  moderation dashboard's "Recent activity" view.
