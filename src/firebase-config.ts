// Firebase web config. These values are public by design (they identify the
// project, they don't grant access); Firestore security rules protect the data.
// Paste the values from Firebase console > Project settings > Your apps > Web app,
// or set the VITE_FIREBASE_* variables at build time.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
