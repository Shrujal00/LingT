'use client';

import {getApp, getApps, initializeApp} from 'firebase/app';
import {getAuth, GoogleAuthProvider} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';
import type {RuntimeFirebaseConfig} from './runtime-config';

declare global {
  interface Window {
    __LINGT_FIREBASE_CONFIG__?: RuntimeFirebaseConfig;
  }
}

function runtimeFirebaseConfig() {
  return typeof window === 'undefined' ? undefined : window.__LINGT_FIREBASE_CONFIG__;
}

const runtimeConfig = runtimeFirebaseConfig();

export const hasFirebaseConfig = Boolean(
  runtimeConfig?.apiKey ||
    (process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
);

const firebaseConfig: RuntimeFirebaseConfig = {
  apiKey: runtimeConfig?.apiKey || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: runtimeConfig?.authDomain || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: runtimeConfig?.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: runtimeConfig?.storageBucket || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: runtimeConfig?.messagingSenderId || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: runtimeConfig?.appId || process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  measurementId: runtimeConfig?.measurementId || process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export function getFirebaseVapidKey() {
  return runtimeFirebaseConfig()?.vapidKey || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account',
});
