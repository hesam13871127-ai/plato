# VibeTable — Flutter client

Flutter 3.24+ app built with **Riverpod 2.x** and strict **clean architecture**.

## Run

Zero configuration for local development — the backend origin is selected
automatically per platform:

| Platform            | Default backend URL            |
| ------------------- | ------------------------------ |
| Web / desktop / iOS | `http://localhost:3000`        |
| Android emulator    | `http://10.0.2.2:3000` (host alias) |

```bash
flutter pub get
flutter run            # web:  flutter run -d chrome
                       # Windows desktop:  flutter run -d windows
```

Start the backend first (`npm run start:dev` in `backend/`); it listens on
`0.0.0.0:3000` with CORS open, so web and desktop connect out of the box.

Point at a remote/non-default backend with one flag:

```bash
flutter run --dart-define=API_BASE_URL=https://your-server:3000
```

> Platform runner folders (`android/`, `ios/`, `windows/`, …) are generated with
> `flutter create .` — see below. The `web/` runner is committed.

```bash
# Generate native platform projects (run once inside mobile/):
flutter create . --org=com.vibetable --project-name=vibetable
```

**Sign-in** is email/password + phone-OTP only (Google/Apple sign-in removed).

## Architecture

```
lib/
├── core/                       # cross-cutting infrastructure
│   ├── theme/                  # AppColors (#0B1426 / #7B5CFF / #00E5FF), AppTheme
│   ├── network/                # Dio client + JWT/refresh interceptor, endpoints
│   ├── storage/                # token store (secure storage native / localStorage web)
│   ├── socket/                 # Socket.IO client over cross-platform web_socket_channel
│   ├── platform/               # per-platform default API host resolution
│   ├── router/                 # go_router (auth-aware redirects)
│   ├── widgets/                # GlassCard, GradientButton (glassmorphism)
│   ├── constants/              # API base URL, storage keys
│   └── error/                  # Failure types + Dio error mapper
└── features/
    ├── splash/                 # loading/restore session
    ├── auth/
    │   ├── domain/             # AuthUser entity, AuthRepository interface
    │   ├── data/               # models, Dio remote data source, Google/Apple
    │   │                       #   social data source, repository implementation
    │   └── presentation/       # Riverpod providers + StateNotifier, screens,
    │                           #   widgets (phone-OTP, code entry, social, email)
    ├── home/                   # landing dashboard
    └── profile/                # profile + logout
```

- **State** — a single `authNotifierProvider` (`StateNotifier<AuthState>`) drives
  the router: `unknown` (splash) → `authenticated`/`unauthenticated`.
- **Errors** — repositories return `Either<Failure, T>` (fpdart); the UI reads
  user-safe messages.
- **Tokens** — access token auto-attached; on `401` the Dio interceptor rotates
  the refresh token once and retries, then logs the user out if rotation fails.

## Test

```bash
flutter test      # widget + theme unit tests
flutter analyze   # strict lints
```
