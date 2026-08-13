"use client";

import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { browserLocalPersistence, getAuth, GithubAuthProvider, GoogleAuthProvider, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();

// Auth's default IndexedDB-backed persistence throws "Database is closing/hidden" across tab
// visibility changes and dev-mode hot reloads (a well-known flaky spot in the SDK). localStorage
// persistence sidesteps IndexedDB entirely and is plenty durable for this app's needs.
setPersistence(auth, browserLocalPersistence).catch(() => {});
