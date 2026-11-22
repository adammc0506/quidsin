# QuidsIn

Split group bills with one shareable reference (e.g. `QI-7KQ4-M9X2`). No sign-up, no daily limits.

- **Web app:** Vite + React + TypeScript, installable as a PWA.
- **Android app:** Capacitor wrapper in `android/`.
- **Backend:** Cloudflare Worker (`worker/index.ts`) + D1 database (`migrations/`), free plan. The same Worker serves the website.
- **Demo mode:** with no Cloudflare connection, groups are saved on the device only — handy for trying it out.

## 1. Connect Cloudflare (free)

1. In the Cloudflare dashboard open **Workers & Pages** once, so your free `workers.dev` subdomain is set up.
2. **My Profile → API Tokens → Create Token**, use the **Edit Cloudflare Workers** template, add the permission **Account → D1 → Edit**, and create it.
3. In the GitHub repo: **Settings → Secrets and variables → Actions**, add `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (shown on the dashboard's Workers & Pages overview).
4. Push to `main` (or re-run the workflow). It creates the `quidsin` D1 database, applies the migrations, deploys the site and API to `https://quidsin.<your-subdomain>.workers.dev`, and builds an APK that talks to it.

Every API call needs the group reference, and the Worker validates all input (people belong to the group, shares add up). Free plan: 100,000 API requests a day, D1 5 million rows read and 100,000 written a day, 5 GB storage. The app refreshes an open group every 20 seconds, only while it's on screen.

## 2. Run the web app locally

```bash
npm install
npx wrangler d1 migrations apply quidsin --local
npm run build && npx wrangler dev   # site + API on http://localhost:8787
npm run dev                          # or: UI only, demo mode
npm test                      # money and reference logic tests
```

## 3. Build the Android APK

### Option A — GitHub Actions (no Android Studio needed)

1. Push this folder to a GitHub repo (branch `main`).
2. Add the Cloudflare secrets from step 1.
3. Every push builds the APK. Open **Actions → Build Android APK → latest run → Artifacts → QuidsIn-debug-apk**, download and unzip.
4. On your phone, open the `.apk` and allow "install unknown apps" when asked.

### Option B — Android Studio

```bash
npm run build && npx cap sync android
npx cap open android      # then Build → Build APK(s)
```

The workflow produces a **debug** APK for testing. For the Play Store you'll need a signed release bundle (`./gradlew bundleRelease` with your own keystore).

## 4. The web version

The workflow deploys it with the API, at the `workers.dev` address shown in the run summary. You can add your own domain later under the Worker's **Settings → Domains & Routes**.

## Project layout

| Path | What it is |
| --- | --- |
| `src/lib/money.ts` | Splits, balances and debt simplification (integer pence) |
| `src/lib/reference.ts` | Reference generation and clean-up |
| `src/lib/store.ts` | API store and on-device demo store |
| `worker/index.ts` | Cloudflare Worker API |
| `migrations/` | D1 database schema |
| `wrangler.toml` | Cloudflare config |
| `src/App.tsx` | Screens: home, new group, group, add expense |
| `android/` | Capacitor Android project |
| `.github/workflows/android.yml` | APK build on GitHub |
