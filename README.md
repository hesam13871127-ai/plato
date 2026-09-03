# VibeTable 🎲

A social table-games platform. **Phase 1 — Foundation**: architecture, database,
authentication and project setup, fully working and ready to run.

| Layer | Stack |
| ------ | ----- |
| Mobile client | **Flutter 3.24+** with **Riverpod 2.x**, clean architecture |
| Backend API | **NestJS** (latest) — modules, guards, interceptors, Swagger |
| Database | **MySQL 8.0+** (InnoDB, `utf8mb4`), TypeORM + SQL migrations |
| Realtime | **Socket.io** (JWT-authenticated gateway) |
| Auth | JWT access + refresh token (rotation + reuse detection), Phone OTP (SMS), Google, Apple |

UI is dark-mode first with a glassmorphism design system:
Deep Navy `#0B1426`, Electric Purple `#7B5CFF`, Soft Cyan `#00E5FF`.

---

## Repository layout

```
plato/
├── backend/                 # NestJS API
│   ├── src/
│   │   ├── auth/            # OTP, JWT, refresh rotation, Google/Apple, email
│   │   ├── users/           # profile read/update + public user serializer
│   │   ├── health/          # liveness + DB connectivity
│   │   ├── realtime/        # Socket.io gateway
│   │   ├── database/        # entities (24), data source, migrations
│   │   ├── common/          # filters, guards, interceptors, decorators, utils
│   │   └── config/          # typed configuration + Joi validation
│   ├── test/                # e2e integration tests (in-memory SQLite)
│   └── Dockerfile
├── database/
│   ├── schema.sql           # ⭐ canonical MySQL 8.0 schema (source of truth)
│   └── seed.sql             # optional starter data (games, season, shop, bot)
├── mobile/                  # Flutter app
│   └── lib/
│       ├── core/            # theme, networking, storage, routing, widgets
│       └── features/
│           ├── auth/        # presentation / domain / data (clean architecture)
│           ├── home/
│           ├── profile/
│           └── splash/
└── docker-compose.yml       # MySQL + API, one command
```

---

## Quick start (Docker — recommended)

```bash
# from the repo root
docker compose up --build
```

This starts MySQL 8 (schema auto-loaded), then the API which runs migrations on
boot. Services:

- API base: `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/docs`
- Health: `http://localhost:3000/health`

Optional seed data:

```bash
docker exec -i vibetable-mysql mysql -uvibetable -pvibetable vibetable < database/seed.sql
```

---

## Backend (local development)

Requires Node.js 20+ and MySQL 8 running locally.

```bash
cd backend
cp .env.example .env          # edit secrets / DB credentials
npm install

# Create the database (once)
mysql -u root -p -e "CREATE DATABASE vibetable CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Option A — apply the canonical SQL directly
mysql -u vibetable -p vibetable < ../database/schema.sql

# Option B — let TypeORM run the migration (it executes schema.sql)
npm run migration:run

npm run start:dev
```

### Without MySQL (instant spin-up for UI/dev)

The API can run on in-memory SQLite for a zero-database demo (used by tests):

```bash
NODE_ENV=development DB_TYPE=sqlite DB_SYNCHRONIZE=true DB_RUN_MIGRATIONS=false \
JWT_ACCESS_SECRET=dev-access-secret-change-me-please-32chars \
JWT_REFRESH_SECRET=dev-refresh-secret-change-me-please-32chars \
npm run start
```

### Tests

```bash
npm run test:e2e    # 16 integration tests covering the full auth lifecycle
npm run build       # TypeScript production build
```

---

## API surface

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| POST | `/api/auth/phone/request-otp` | Send SMS one-time code |
| POST | `/api/auth/phone/verify` | Verify code → sign in/register |
| POST | `/api/auth/google` | Sign in with Google ID token |
| POST | `/api/auth/apple` | Sign in with Apple ID token |
| POST | `/api/auth/email/register` | Email/password registration |
| POST | `/api/auth/email/login` | Email/password sign-in |
| POST | `/api/auth/refresh` | Rotate refresh token → new token pair |
| POST | `/api/auth/logout` | Revoke a refresh token |
| GET  | `/api/users/me` | Current profile (🔒 requires bearer token) |
| PATCH | `/api/users/me` | Update profile |
| GET  | `/health` | Liveness + DB check |

Success responses are wrapped: `{ success, data, timestamp }`.
Errors are wrapped: `{ statusCode, error, message, path, timestamp }`.

### Auth model

- **Access token** — short-lived JWT (default 15 min), sent as
  `Authorization: Bearer <token>`.
- **Refresh token** — long-lived opaque token (default 30 days). Only a
  **SHA-256 hash** is stored. Every refresh **rotates** the token in a family;
  presenting an already-used token triggers **family-wide revocation** (theft
  detection).
- **OTP** codes are hashed, time-limited, attempt-bounded and rate-limited.
  In development the code is returned as `devCode` and logged (never in production).
- **Google / Apple** ID tokens are verified server-side against their JWKS /
  audiences. Configure `GOOGLE_CLIENT_IDS` and `APPLE_CLIENT_ID` in `.env`.
- Internal fields (`is_bot`, `password_hash`, hashed tokens) are **never**
  serialized to clients — the user serializer is the single chokepoint.

---

## Database

`database/schema.sql` is the canonical MySQL 8.0 DDL (24 tables) and is executed
verbatim by the TypeORM initial migration. Highlights:

- UUID primary keys (`CHAR(36)`), `DATETIME(6)` UTC timestamps, `BIGINT` money.
- Full foreign-key graph with `CASCADE` / `RESTRICT` / `SET NULL` as appropriate.
- Targeted indexes for hot paths (leaderboards, message history, wallet ledger).
- `CHECK` constraints for non-negative wallets, valid player counts, date
  ranges and self-referential bans.
- `ENUM`s for statuses; a generated-column uniqueness guarantee for owned
  shop items.

Tables: `users`, `profiles`, `refresh_tokens`, `otp_codes`, `bots`,
`friendships`, `groups`, `group_members`, `games`, `rooms`, `room_players`,
`seasons`, `matches`, `match_players`, `rankings`, `shop_items`,
`user_inventory`, `transactions`, `chats`, `chat_participants`, `messages`,
`message_reads`, `reports`, `bans`.

---

## Flutter app

```bash
cd mobile
flutter pub get
# Point at your API (Android emulator default is http://10.0.2.2:3000):
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

Strict **clean architecture** per feature:

```
features/auth/
├── domain/    # entities (AuthUser), repository contract (interface)
├── data/      # models (JSON), remote + social data sources, repository impl
└── presentation/  # Riverpod providers/notifier/state, screens, widgets
```

- **Riverpod 2.x** for DI and state; a global `authNotifierProvider` drives an
  auth-state-aware `go_router` (splash → auth → home).
- **Dio** client with an interceptor that injects the bearer token and
  transparently rotates + retries once on a 401.
- Tokens are stored in **flutter_secure_storage** (Keychain / EncryptedSharedPrefs).
- `fpdart` `Either<Failure, T>` for error-safe repository results.
- Design system: `core/theme` (brand colors, typography), reusable
  `GlassCard` (frosted backdrop blur) and `GradientButton` widgets.

Run the widget tests with `flutter test`.

---

## Security checklist (phase 1)

- [x] Passwords hashed with bcrypt (cost 12); never returned.
- [x] Refresh tokens + OTP codes stored only as SHA-256 hashes.
- [x] Refresh-token rotation with reuse detection and family revocation.
- [x] JWT issuer/audience/expiry validation; global auth guard (secure by default).
- [x] Strict input validation (class-validator) with whitelisting.
- [x] Server-side verification of Google/Apple identity tokens.
- [x] Internal `is_bot` flag never leaves the server.
- [x] Parameterized queries via TypeORM; CORS, Helios-style validation, structured errors.
