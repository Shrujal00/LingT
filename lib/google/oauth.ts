import 'server-only';

import {createHmac, randomBytes, timingSafeEqual} from 'crypto';
import type {CalendarAction} from '@/lib/orchestration/schemas';

export interface GoogleTokenSet {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export interface StoredGoogleIntegration {
  userId: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
  scope?: string;
  connectedAt?: string;
  automationEnabled?: boolean;
  gmailAutoScanEnabled?: boolean;
  calendarAssistEnabled?: boolean;
  autoCommitCalendar?: boolean;
  timezone?: string;
}

export const googleScopes = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
];

export function hasGoogleOAuthConfig() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function appUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${appUrl()}/api/integrations/google/callback`;
}

function stateSecret() {
  return process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.GOOGLE_CLIENT_SECRET || 'lingt-dev-state';
}

function base64Url(input: string) {
  return Buffer.from(input).toString('base64url');
}

function signState(payload: string) {
  return createHmac('sha256', stateSecret()).update(payload).digest('base64url');
}

export function createGoogleOAuthState(userId: string) {
  const payload = JSON.stringify({
    userId,
    nonce: randomBytes(12).toString('base64url'),
    createdAt: Date.now(),
  });

  return `${base64Url(payload)}.${signState(payload)}`;
}

export function parseGoogleOAuthState(state: string) {
  const [encoded, signature] = state.split('.');
  if (!encoded || !signature) {
    throw new Error('Invalid OAuth state');
  }

  const payload = Buffer.from(encoded, 'base64url').toString('utf8');
  const expected = signState(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid OAuth state signature');
  }

  const parsed = JSON.parse(payload) as {userId?: string; createdAt?: number};
  if (!parsed.userId || !parsed.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000) {
    throw new Error('Expired OAuth state');
  }

  return parsed.userId;
}

export function createGoogleAuthorizationUrl(userId: string) {
  const params = new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: googleScopes.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state: createGoogleOAuthState(userId),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenSet> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      code,
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth exchange failed: ${response.status}`);
  }

  return response.json();
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status}`);
  }

  return response.json();
}

export async function googleApiFetch<T>(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Google API request failed: ${response.status} ${detail}`);
  }

  return response.json() as Promise<T>;
}

export function toCalendarEvent(action: CalendarAction) {
  return {
    summary: action.title,
    description: `${action.description}\n\nReason: ${action.reason}\nCreated by LingT.`,
    start: {
      dateTime: action.start,
      timeZone: action.timezone,
    },
    end: {
      dateTime: action.end,
      timeZone: action.timezone,
    },
    attendees: action.attendees.map((email) => ({email})),
  };
}
