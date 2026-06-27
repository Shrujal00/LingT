'use client';

import {doc, getDoc, serverTimestamp, setDoc} from 'firebase/firestore';
import {firestoreDb} from './client';

export interface LingTProfile {
  firstName: string;
  lastName: string;
  heardFrom: string;
  aliases: string;
  primaryMode: 'student' | 'professional' | 'founder' | 'personal';
  reminderStyle: 'gentle' | 'direct' | 'persistent';
  focusWindow: 'morning' | 'afternoon' | 'evening' | 'flexible';
  topGoal: string;
  onboardingComplete: boolean;
}

function profileRef(userId: string) {
  return doc(firestoreDb, 'users', userId);
}

export async function getUserProfile(userId: string) {
  const snapshot = await getDoc(profileRef(userId));
  return snapshot.exists() ? (snapshot.data() as Partial<LingTProfile>) : null;
}

export async function hasCompletedOnboarding(userId: string) {
  const profile = await getUserProfile(userId);
  return profile?.onboardingComplete === true;
}

export async function saveUserProfile(userId: string, profile: LingTProfile) {
  await setDoc(
    profileRef(userId),
    {
      ...profile,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    {merge: true},
  );
}
