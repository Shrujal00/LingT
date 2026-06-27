import 'server-only';

import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';

function projectId() {
  return (
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ''
  );
}

function privateKey() {
  return (
    process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n') ||
    process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') ||
    ''
  );
}

function clientEmail() {
  return process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || '';
}

export function hasFirebaseAdminConfig() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      (projectId() && clientEmail() && privateKey()),
  );
}

function credentialConfig() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  if (clientEmail() && privateKey()) {
    return cert({
      projectId: projectId(),
      clientEmail: clientEmail(),
      privateKey: privateKey(),
    });
  }

  return applicationDefault();
}

function getServerApp(): App {
  if (!hasFirebaseAdminConfig()) {
    throw new Error('Firebase Admin credentials are required for server Firestore access.');
  }

  return getApps().some((app) => app.name === 'lingt-admin')
    ? getApp('lingt-admin')
    : initializeApp(
        {
          credential: credentialConfig(),
          projectId: projectId() || undefined,
        },
        'lingt-admin',
      );
}

export function getServerFirestore() {
  return getFirestore(getServerApp());
}

export async function verifyBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

  if (!token || !hasFirebaseAdminConfig()) return null;

  try {
    return getAuth(getServerApp()).verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function getAuthenticatedUserId(request: Request, fallbackUserId = '') {
  const decoded = await verifyBearerToken(request);
  return decoded?.uid || fallbackUserId;
}

export async function getServerDocument<T>(collectionName: string, id: string) {
  const snapshot = await getServerFirestore().collection(collectionName).doc(id).get();
  return snapshot.exists ? (snapshot.data() as T) : null;
}

export async function setServerDocument(
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
) {
  await getServerFirestore()
    .collection(collectionName)
    .doc(id)
    .set(
      {
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
}

export async function addServerDocument(
  collectionName: string,
  data: Record<string, unknown>,
) {
  const ref = getServerFirestore().collection(collectionName).doc();
  await ref.set({
    id: ref.id,
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

export async function queryServerDocuments<T>(
  collectionName: string,
  userId: string,
  maxResults = 30,
) {
  const snapshot = await getServerFirestore()
    .collection(collectionName)
    .where('userId', '==', userId)
    .limit(maxResults)
    .get();

  return snapshot.docs.map((item) => item.data() as T);
}

export async function sendNotificationToUser(
  userId: string,
  notification: {title: string; body: string},
) {
  const snapshot = await getServerFirestore()
    .collection('notificationTokens')
    .where('userId', '==', userId)
    .limit(20)
    .get();
  const tokens = snapshot.docs
    .map((item) => item.data().token)
    .filter((token): token is string => typeof token === 'string' && !token.startsWith('permission:'));

  if (tokens.length === 0) {
    return {sent: 0};
  }

  const result = await getMessaging(getServerApp()).sendEachForMulticast({
    tokens,
    notification,
  });

  return {sent: result.successCount, failed: result.failureCount};
}
