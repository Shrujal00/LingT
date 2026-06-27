import 'server-only';

import {getServerDocument, getServerFirestore, setServerDocument} from '@/lib/firebase/server';
import {getUserGoogleAccessToken} from '@/lib/google/user';
import {googleApiFetch} from '@/lib/google/oauth';
import {runGmailAutomation} from './email-agent';

interface GmailMessageList {
  messages?: Array<{id: string; threadId: string}>;
}

interface GmailMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    mimeType?: string;
    headers?: Array<{name: string; value: string}>;
    body?: {data?: string};
    parts?: GmailMessage['payload'][];
  };
}

export interface GmailScanResult {
  scanned: number;
  processed: number;
  skipped: number;
  errors: Array<{messageId: string; error: string}>;
}

function processedDocId(userId: string, messageId: string) {
  return `${userId}_${messageId}`.replace(/[^\w-]/g, '_');
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBody(data = '') {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf8');
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBody(part: GmailMessage['payload']): string {
  if (!part) return '';

  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBody(part.body.data);
  }

  const nested = part.parts?.map(extractBody).find((value) => value.trim());
  if (nested) return nested;

  if (part.mimeType === 'text/html' && part.body?.data) {
    return stripHtml(decodeBody(part.body.data));
  }

  return '';
}

async function listUnreadMessages(userId: string, maxResults: number) {
  const accessToken = await getUserGoogleAccessToken(userId);
  const params = new URLSearchParams({
    q: 'is:unread newer_than:14d -category:promotions -category:social',
    maxResults: String(maxResults),
  });

  return googleApiFetch<GmailMessageList>(
    accessToken,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
  );
}

async function getMessage(userId: string, messageId: string) {
  const accessToken = await getUserGoogleAccessToken(userId);
  const params = new URLSearchParams({format: 'full'});

  return googleApiFetch<GmailMessage>(
    accessToken,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`,
  );
}

async function alreadyProcessed(userId: string, messageId: string) {
  return Boolean(await getServerDocument('gmailProcessedMessages', processedDocId(userId, messageId)));
}

async function markProcessed(userId: string, messageId: string) {
  await setServerDocument('gmailProcessedMessages', processedDocId(userId, messageId), {
    userId,
    messageId,
    source: 'ling-gmail-sync',
    processedAt: new Date().toISOString(),
  });
}

export async function runConnectedGmailScan(
  userId: string,
  options: {limit?: number; timezone?: string; autoCommitCalendar?: boolean} = {},
): Promise<GmailScanResult> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);
  const listed = await listUnreadMessages(userId, limit);
  const messages = listed.messages ?? [];
  const result: GmailScanResult = {scanned: messages.length, processed: 0, skipped: 0, errors: []};

  for (const item of messages) {
    try {
      if (await alreadyProcessed(userId, item.id)) {
        result.skipped += 1;
        continue;
      }

      const message = await getMessage(userId, item.id);
      await runGmailAutomation({
        userId,
        messageId: message.id,
        threadId: message.threadId,
        subject: header(message, 'subject') || '(no subject)',
        from: header(message, 'from') || 'unknown sender',
        receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : header(message, 'date'),
        snippet: message.snippet,
        body: extractBody(message.payload) || message.snippet || '',
        timezone: options.timezone,
        autoCommitCalendar: options.autoCommitCalendar === true,
      });
      await markProcessed(userId, item.id);
      result.processed += 1;
    } catch (error) {
      result.errors.push({
        messageId: item.id,
        error: error instanceof Error ? error.message : 'Unknown Gmail sync error',
      });
    }
  }

  await setServerDocument('googleIntegrations', userId, {
    lastGmailScanAt: new Date().toISOString(),
    lastGmailScan: result,
  });

  return result;
}

export async function listConnectedGoogleUsers(maxResults = 50) {
  const snapshot = await getServerFirestore()
    .collection('googleIntegrations')
    .limit(maxResults)
    .get();

  return snapshot.docs
    .map((item) => item.data() as {userId?: string; refreshToken?: string})
    .filter((item): item is {userId: string; refreshToken: string} => Boolean(item.userId && item.refreshToken));
}
