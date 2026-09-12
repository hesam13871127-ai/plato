# VibeTable 🎲

A social table-games platform. **Phase 1 — Foundation**: architecture, database,
authentication and project setup, fully working and ready to run.

| Layer | Stack |
| ------ | ----- |
| Mobile client | **Flutter 3.24+** with **Riverpod 2.x**, clean architecture |
| Backend API | **NestJS** (latest) — modules, guards, interceptors, Swagger |
| Database | **MySQL 8.0+** (InnoDB, `utf8mb4`), TypeORM — schema auto-synced from entities |
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
│   │   ├── database/        # entities (single source of truth for the schema)
│   │   ├── common/          # filters, guards, interceptors, decorators, utils
│   │   └── config/          # typed configuration + Joi validation
│   ├── test/                # e2e integration tests (in-memory SQLite)
│   └── Dockerfile
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

This starts MySQL 8, then the API — TypeORM `synchronize` creates the whole
schema from the entity metadata on boot (no SQL files, no migrations).
Starter data (games, season, shop items, quests, lounge) is seeded
automatically by the API at startup. Services:

- API base: `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/docs`
- Health: `http://localhost:3000/health`

---

## Backend (local development)

Requires Node.js 20+ and MySQL 8 running locally.

```bash
cd backend
cp .env.example .env          # edit secrets / DB credentials
npm install

# Create the database (once)
mysql -u root -p -e "CREATE DATABASE vibetable CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

npm run start:dev
```

The first boot creates every table from the entities via TypeORM
`synchronize`; on later boots it updates the schema to match any entity
changes. No SQL files or migrations to manage.

### Without MySQL (instant spin-up for UI/dev)

The API can run on in-memory SQLite for a zero-database demo (used by tests):

```bash
NODE_ENV=development DB_TYPE=sqlite \
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

There are **no SQL files and no migrations** — the TypeORM entities in
`backend/src/database/entities/` are the single source of truth. TypeORM
`synchronize` (enabled by `DB_SYNCHRONIZE=true`, the default) creates the
schema on first boot and keeps it in sync with the entities on every boot,
without touching existing data. All database access in the API goes through
TypeORM (repositories + query builder + `DataSource`); there is no direct
driver usage anywhere.

Highlights of the entity model:

- UUID primary keys, `DATETIME(6)` UTC timestamps, `BIGINT` money.
- snake_case column names via `SnakeNamingStrategy` (shared by the MySQL and
  SQLite paths), so runtime and DDL can never drift apart.
- Full foreign-key graph with `CASCADE` / `RESTRICT` / `SET NULL` as appropriate.
- Targeted indexes for hot paths (leaderboards, message history, wallet ledger).
- `@Check` constraints for invariants (non-negative wallets, season date
  ranges, valid player counts, …). Note: TypeORM 0.3.x does not emit CHECK
  constraints for the MySQL driver family, so they are enforced by the
  in-memory SQLite used in tests; on MySQL the application logic upholds them.

Starter data (game catalogue, shop items, daily quests, first season, public
lounge, bot pool, dev admin) is seeded by runtime seeders in the API at
startup — idempotent, so reboots never duplicate or overwrite it.

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
