# QuidsIn

Split group bills with one shareable reference (e.g. `QI-7KQ4-M9X2`). No sign-up, no daily limits.

- **Web app:** Vite + React + TypeScript, installable as a PWA.
- **Android app:** Capacitor wrapper in `android/`.
- **Backend:** Firebase Cloud Firestore, free Spark plan (rules in `firebase/firestore.rules`).
- **Demo mode:** with no Firebase settings, groups are saved on the device only — handy for trying it out.

## 1. Set up Firebase (free, no card needed)

1. Go to console.firebase.google.com and **Create a project** (Google Analytics can be off).
2. **Build → Firestore Database → Create database**, choose location `europe-west2` (London), start in **production mode**.
3. Open the **Rules** tab, replace everything with the contents of `firebase/firestore.rules`, then **Publish**.
4. **Project settings → Your apps → Web (</>)**, register an app called QuidsIn, and copy `apiKey`, `authDomain`, `projectId` and `appId` into `src/firebase-config.ts` (or set them as GitHub secrets `VITE_FIREBASE_*`).

Each group is one Firestore document (`groups/{reference}`), so opening a group costs one read. Rules allow reading a group only by its exact reference and block listing, so the reference acts as the key. Free Spark quota: 1 GiB stored, 50,000 reads and 20,000 writes per day.

## 2. Run the web app locally

```bash
npm install
cp .env.example .env.local   # optional: Firebase settings
npm run dev
npm test                      # money and reference logic tests
```

## 3. Build the Android APK

### Option A — GitHub Actions (no Android Studio needed)

1. Push this folder to a GitHub repo (branch `main`).
2. Put your Firebase settings in `src/firebase-config.ts` (or add them as Actions secrets `VITE_FIREBASE_*`). Optionally add a variable `VITE_PUBLIC_URL` (your website address, used in share links).
3. Every push builds the APK. Open **Actions → Build Android APK → latest run → Artifacts → QuidsIn-debug-apk**, download and unzip.
4. On your phone, open the `.apk` and allow "install unknown apps" when asked.

### Option B — Android Studio

```bash
npm run build && npx cap sync android
npx cap open android      # then Build → Build APK(s)
```

The workflow produces a **debug** APK for testing. For the Play Store you'll need a signed release bundle (`./gradlew bundleRelease` with your own keystore).

## 4. Host the web version

`npm run build` outputs `dist/`. Deploy it to Cloudflare Pages (build command `npm run build`, output `dist`).

## Project layout

| Path | What it is |
| --- | --- |
| `src/lib/money.ts` | Splits, balances and debt simplification (integer pence) |
| `src/lib/reference.ts` | Reference generation and clean-up |
| `src/lib/store.ts` | Firestore store and on-device demo store |
| `src/firebase-config.ts` | Firebase project settings |
| `src/App.tsx` | Screens: home, new group, group, add expense |
| `firebase/firestore.rules` | Firestore security rules |
| `android/` | Capacitor Android project |
| `.github/workflows/android.yml` | APK build on GitHub |
