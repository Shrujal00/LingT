export interface RuntimeFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  vapidKey?: string;
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

function runtimeEnv(name: string) {
  return process.env[name];
}

export function getRuntimeFirebaseConfig(): RuntimeFirebaseConfig {
  return {
    apiKey: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_FIREBASE_API_KEY')),
    authDomain: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN')),
    projectId: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID')),
    storageBucket: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')),
    messagingSenderId: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID')),
    appId: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_FIREBASE_APP_ID')),
    measurementId: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID')) || undefined,
    vapidKey: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_FIREBASE_VAPID_KEY')) || undefined,
  };
}

export function hasRuntimeFirebaseConfig(config = getRuntimeFirebaseConfig()) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}
