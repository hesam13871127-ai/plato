# 🎮 VibeTable — راهنمای اجرا و خروجی گرفتن / Run & Build Guide

راهنمای کامل اجرای بک‌اند و اپ موبایل، به‌همراه دستورهای خروجی گرفتن (build).
Complete guide to running the backend and the mobile app, plus build commands.

---

## ۰) پیش‌نیازها / Prerequisites

| ابزار | نسخه | برای |
|---|---|---|
| **Node.js** | 18+ (20 توصیه می‌شود) | بک‌اند |
| **npm** | 9+ | بک‌اند |
| **Docker Desktop** | هر نسخهٔ جدید | اجرای MySQL (ساده‌ترین راه) |
| **Flutter SDK** | ≥ 3.5 (پایدار) | اپ موبایل |
| **MySQL** | 8.0+ | دیتابیس (اگر بدون Docker) |

چک کردن فلاتر بعد از نصب:
```bash
flutter doctor          # مشکلات را نشان می‌دهد و راه حل می‌گوید
flutter doctor --android-licenses   # اگر برای اندروید می‌سازید
```

---

## ۱) بک‌اند / Backend

### ۱-۱) تنظیم فایل `.env`

```bash
cd backend
cp .env.example .env
```

مقادیر پیش‌فرض `.env.example` برای توسعهٔ محلی کافی است. فقط اگر رمز MySQL را
عوض کردید، `DB_PASSWORD` را هم عوض کنید.

> 💡 در حالت development یک ادمین آماده ساخته می‌شود:
> `admin@vibetable.local` / `Admin123!` (متغیر `DEV_SEED_ADMIN`).

### ۱-۲) اجرای MySQL — دو راه

**راه ساده (پیشنهادی): فقط MySQL با Docker**

```bash
docker compose up -d mysql
```

این کانتینر MySQL 8.0 را روی پورت `3306` بالا می‌آورد، اسکیمای کامل را از
`database/schema.sql` می‌سازد و دیتای اولیه (بازی‌ها + آیتم‌های فروشگاه) را از
`database/seed.sql` لود می‌کند.

**راه دوم: کل استک (MySQL + API) با Docker**

```bash
docker compose up -d --build     # API روی http://localhost:3000
docker compose logs -f api       # لاگ را ببینید
```

**راه سوم: MySQL لوکال** — اگر خودتان نصب کرده‌اید، این‌ها را یک‌بار اجرا کنید:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p vibetable < database/seed.sql
```

### ۱-۳) نصب و اجرای API

```bash
cd backend
npm ci                    # نصب دقیق وابستگی‌ها (یا npm install)
npm run start:dev         # حالت توسعه با watch — http://localhost:3000
```

اولین اجرا مایگریشن‌ها را خودکار می‌راند (`DB_RUN_MIGRATIONS=true`)، جدول‌ها را
می‌سازد و کاتالوگ ۳۰ بازی + آیتم‌های فروشگاه را seed می‌کند.

بررسی سلامت:
```bash
curl http://localhost:3000/api/health
```

### ۱-۴) خروجی production بک‌اند

```bash
cd backend
npm run build             # خروجی تایپ‌اسکریپت → dist/
npm run start:prod        # اجرای dist/main.js (NODE_ENV=production)
```

خروجی در پوشهٔ `backend/dist/` است — کل آن پوشه + `node_modules` (با
`npm ci --omit=dev`) + فایل `.env` را روی سرور کپی کنید.

### ۱-۵) تست‌ها

```bash
cd backend
npm run test:e2e          # کل تست‌های e2e (فعلاً 292 ✓)
npx jest --config ./test/jest-e2e.json --runInBand game-engines   # فقط قواعد بازی‌ها
npm run lint              # ESLint
npx tsc --noEmit -p tsconfig.json   # چک تایپ
```

---

## ۲) اپ موبایل / Mobile (Flutter)

### ۲-۱) نصب وابستگی‌ها

```bash
cd mobile
flutter pub get
```

### ۲-۲) اپ به بک‌اند وصل می‌شود — قواعد آدرس

اپ **خودکار** آدرس API را تشخیص می‌دهد (`lib/core/platform/default_api_host.dart`):

| پلتفرم | آدرس پیش‌فرض |
|---|---|
| مرورگر (وب) | `http://localhost:3000` |
| شبیه‌ساز اندروید | `http://10.0.2.2:3000` |
| iOS Simulator / دسکتاپ | `http://localhost:3000` |
| گوشی واقعی | باید IP کامپیوتر را بدهید (پایین ⬇️) |

> ⚠️ **گوشی واقعی:** کامپیوتر و گوشی باید در یک وای‌فای باشند و IP لوکال
> کامپیوتر را وارد کنید: در صفحهٔ لاگین اپ گزینهٔ تغییر آدرس سرور هست، یا
> `--dart-define`:
> ```bash
> flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3000
> ```

### ۲-۳) اجرا در حالت توسعه

```bash
cd mobile
flutter devices           # ببینید چه دستگاهی وصل است
flutter run               # روی اولین دستگاه
flutter run -d chrome     # در مرورگر (سریع‌ترین راه تست)
flutter run -d emulator-5554   # روی شبیه‌ساز اندروید
```

هات‌ریلود با `r` و هات‌ری‌استارت با `R` (در ترمینالِ `flutter run`).

### ۲-۴) خروجی گرفتن (Build)

**APK اندروید (رایج‌ترین):**

```bash
cd mobile
flutter build apk --release            # خروجی: build/app/outputs/flutter-apk/app-release.apk
flutter build apk --debug              # نسخهٔ دیباگ (نیازی به ساین ندارد)
```

فایل نهایی: `mobile/build/app/outputs/flutter-apk/app-release.apk`
(همین فایل را به گوشی بدهید و نصب کنید — «نصب از منابع ناشناس» باید فعال باشد.)

**اگر release بدون keystore خطا داد** (ساین کردن):

```bash
keytool -genkey -v -keystore ~/vibetable.jks -keyalg RSA -keysize 2048 -validity 10000 -alias vibetable
```
سپس در `mobile/android/key.properties` مسیر و رمزها را بگذارید و در
`android/app/build.gradle` امضای release را وصل کنید — راهنمای رسمی:
`docs.flutter.dev/deployment/android`.

**وب (PWA):**

```bash
flutter build web --release        # خروجی: build/web/
```
کل پوشهٔ `mobile/build/web/` را روی هر هاست استاتیک بگذارید (نیاز به بک‌اند روی
همان دامنه یا CORS).

**iOS (فقط روی مک):**

```bash
flutter build ios --release        # سپس از Xcode آرشیو و ساین کنید
```

**پاک‌سازی وقتی خروجی خراب شد:**

```bash
flutter clean && flutter pub get
```

---

## ۳) سناریوی کامل «از صفر تا بازی» / Full local flow

```bash
# ترمینال ۱ — دیتابیس و API
docker compose up -d mysql
cd backend && cp .env.example .env && npm ci && npm run start:dev

# ترمینال ۲ — اپ
cd mobile && flutter pub get && flutter run -d chrome
```

۱. در اپ ثبت‌نام/ورود کنید (در حالت development، کد OTP در **کنسول بک‌اند** چاپ می‌شود — `SMS_PROVIDER=development`).
۲. از هاب بازی‌ها یک میز بسازید (هر بازی، بات‌ها هم قبول می‌کنند) و بازی کنید.
۳. پنل ادمین: `http://localhost:3000/panel` — با اکانت dev-admin.

---

## ۴) رفع اشکال سریع / Troubleshooting

| مشکل | راه حل |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL بالا نیست: `docker compose up -d mysql` |
| `Table 'vibetable.xxx' doesn't exist` | مایگریشن ران نشده: `cd backend && npm run migration:run`، یا `docker compose down -v` و `up` دوباره |
| اپ در شبیه‌ساز اندروید وصل نمی‌شود | بک‌اند روی `localhost:3000` باشد؛ اپ خودش `10.0.2.2` را می‌زند — فایروال ویندوز را هم چک کنید |
| اپ در مرورگر: CORS | `CORS_ORIGINS` در `.env` بک‌اند باید پورتِ `flutter run -d chrome` را داشته باشد (پیش‌فرض `http://localhost:8080` را دارد؛ پورت واقعی را در خروجی ترمینال فلاتر ببینید و اضافه کنید) |
| بیلد اندروید فیل می‌شود | `flutter doctor` + `flutter clean && flutter pub get` + نسخهٔ JDK (17) |
| `jest` فیل می‌شود بعد از pull | `cd backend && npm ci` (وابستگی‌های جدید) |

---

*ساخته‌شده با NestJS + TypeORM + MySQL + Flutter · ۳۰ بازی، همه با تست، بات و بورد سه‌بعدی.*
