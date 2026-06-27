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

function cleanEnvValue(value?: string) {
  const trimmed = (value || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function normalizeConfig(config?: Partial<RuntimeFirebaseConfig>): RuntimeFirebaseConfig {
  return {
    apiKey: cleanEnvValue(config?.apiKey),
    authDomain: cleanEnvValue(config?.authDomain),
    projectId: cleanEnvValue(config?.projectId),
    storageBucket: cleanEnvValue(config?.storageBucket),
    messagingSenderId: cleanEnvValue(config?.messagingSenderId),
    appId: cleanEnvValue(config?.appId),
    measurementId: cleanEnvValue(config?.measurementId) || undefined,
    vapidKey: cleanEnvValue(config?.vapidKey) || undefined,
  };
}

function isCompleteConfig(config: RuntimeFirebaseConfig) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

const runtimeConfig = runtimeFirebaseConfig();
const buildConfig = normalizeConfig({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
});
const browserRuntimeConfig = normalizeConfig(runtimeConfig);
const firebaseConfig = isCompleteConfig(buildConfig) ? buildConfig : browserRuntimeConfig;

export const hasFirebaseConfig = isCompleteConfig(firebaseConfig);

export function getFirebaseVapidKey() {
  return cleanEnvValue(runtimeFirebaseConfig()?.vapidKey || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account',
});
