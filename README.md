# QuidsIn

Split group bills with one shareable reference (e.g. `QI-7KQ4-M9X2`). No sign-up, no daily limits.

- **Web app:** Vite + React + TypeScript, installable as a PWA.
- **Android app:** Capacitor wrapper in `android/`.
- **Backend:** Supabase (Postgres functions in `supabase/migrations`).
- **Demo mode:** with no Supabase keys, groups are saved on the device only — handy for trying it out.

## 1. Set up Supabase

1. Create a project at supabase.com (choose the London region).
2. Open **SQL Editor**, paste `supabase/migrations/001_quidsin.sql` and run it.
3. From **Project Settings → API**, copy the Project URL and the `anon` public key.

Security model: tables have Row Level Security on with no policies, so nobody can read them directly. The app only calls the `qi_*` functions, and each one needs the group reference, so the reference works as the group's key.

## 2. Run the web app locally

```bash
npm install
cp .env.example .env.local   # paste your Supabase URL and anon key
npm run dev
npm test                      # money and reference logic tests
```

## 3. Build the Android APK

### Option A — GitHub Actions (no Android Studio needed)

1. Push this folder to a GitHub repo (branch `main`).
2. In the repo: **Settings → Secrets and variables → Actions**, add secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Optionally add a variable `VITE_PUBLIC_URL` (your website address, used in share links).
3. Every push builds the APK. Open **Actions → Build Android APK → latest run → Artifacts → QuidsIn-debug-apk**, download and unzip.
4. On your phone, open the `.apk` and allow "install unknown apps" when asked.

### Option B — Android Studio

```bash
npm run build && npx cap sync android
npx cap open android      # then Build → Build APK(s)
```

The workflow produces a **debug** APK for testing. For the Play Store you'll need a signed release bundle (`./gradlew bundleRelease` with your own keystore).

## 4. Host the web version

`npm run build` outputs `dist/`. Deploy it to Cloudflare Pages (build command `npm run build`, output `dist`, plus the same two env vars).

## Project layout

| Path | What it is |
| --- | --- |
| `src/lib/money.ts` | Splits, balances and debt simplification (integer pence) |
| `src/lib/reference.ts` | Reference generation and clean-up |
| `src/lib/store.ts` | Supabase store and on-device demo store |
| `src/App.tsx` | Screens: home, new group, group, add expense |
| `supabase/migrations/` | Database schema and API functions |
| `android/` | Capacitor Android project |
| `.github/workflows/android.yml` | APK build on GitHub |
