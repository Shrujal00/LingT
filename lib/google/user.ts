import 'server-only';

import {getServerDocument, setServerDocument} from '@/lib/firebase/server';
import {
  googleApiFetch,
  refreshGoogleAccessToken,
  type StoredGoogleIntegration,
} from './oauth';
import type {CalendarAction} from '@/lib/orchestration/schemas';

export async function getUserGoogleAccessToken(userId: string) {
  const integration = await getServerDocument<StoredGoogleIntegration>('googleIntegrations', userId);
  if (!integration?.refreshToken) {
    throw new Error('Google integration is not connected for this user.');
  }

  if (integration.accessToken && integration.expiresAt && integration.expiresAt > Date.now() + 60_000) {
    return integration.accessToken;
  }

  const refreshed = await refreshGoogleAccessToken(integration.refreshToken);
  if (!refreshed.access_token) {
    throw new Error('Google did not return an access token.');
  }

  await setServerDocument('googleIntegrations', userId, {
    accessToken: refreshed.access_token,
    expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
    scope: refreshed.scope || integration.scope,
  });

  return refreshed.access_token;
}

export async function getCalendarFreeBusy(
  userId: string,
  range: {start: string; end: string; timezone?: string},
) {
  const accessToken = await getUserGoogleAccessToken(userId);

  return googleApiFetch<{
    calendars?: Record<string, {busy?: Array<{start: string; end: string}>}>;
  }>(accessToken, 'https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: range.start,
      timeMax: range.end,
      timeZone: range.timezone,
      items: [{id: 'primary'}],
    }),
  });
}

export async function listUpcomingCalendarEvents(userId: string, maxResults = 5) {
  const accessToken = await getUserGoogleAccessToken(userId);
  const now = new Date().toISOString();

  return googleApiFetch<{
    items?: Array<{
      id: string;
      summary?: string;
      description?: string;
      start?: {dateTime?: string; date?: string};
      end?: {dateTime?: string; date?: string};
    }>;
  }>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(now)}&maxResults=${maxResults}`,
  );
}

export async function createCalendarEvent(userId: string, action: CalendarAction) {
  const accessToken = await getUserGoogleAccessToken(userId);

  return googleApiFetch<{id: string; htmlLink?: string}>(
    accessToken,
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      body: JSON.stringify({
        summary: action.title,
        description: `${action.description}\n\nReason: ${action.reason}\nCreated by LingT.`,
        start: {dateTime: action.start, timeZone: action.timezone},
        end: {dateTime: action.end, timeZone: action.timezone},
        attendees: action.attendees.map((email) => ({email})),
      }),
    },
  );
}
