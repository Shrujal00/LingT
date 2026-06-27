/* global importScripts, firebase */

importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY || '',
  authDomain: self.FIREBASE_AUTH_DOMAIN || '',
  projectId: self.FIREBASE_PROJECT_ID || '',
  storageBucket: self.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: self.FIREBASE_APP_ID || '',
});

try {
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    self.registration.showNotification(payload.notification?.title || 'LingT', {
      body: payload.notification?.body || 'You have a LingT reminder.',
      icon: '/favicon.ico',
    });
  });
} catch {
  // The page can still store permission-only registrations without FCM config.
}
