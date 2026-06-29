import {NextResponse} from 'next/server';
import {getAuthenticatedUserId, getServerDocument, hasFirebaseAdminConfig, setServerDocument} from '@/lib/firebase/server';
import type {StoredGoogleIntegration} from '@/lib/google/oauth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const requestedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const userId = await getAuthenticatedUserId(request, requestedUserId);
  const timezone = typeof body.timezone === 'string' ? body.timezone : undefined;

  if (!userId) {
    return NextResponse.json({error: 'Sign in first.'}, {status: 401});
  }

  if (!hasFirebaseAdminConfig()) {
    return NextResponse.json({error: 'Firebase Admin credentials are required.'}, {status: 500});
  }

  const integration = await getServerDocument<StoredGoogleIntegration>('googleIntegrations', userId);
  if (!integration?.refreshToken && !integration?.accessToken) {
    return NextResponse.json({error: 'Connect Google first.'}, {status: 409});
  }

  await setServerDocument('googleIntegrations', userId, {
    automationEnabled: true,
    gmailAutoScanEnabled: true,
    calendarAssistEnabled: true,
    autoCommitCalendar: process.env.LINGT_AUTOCOMMIT_CALENDAR === 'true' && body.autoCommitCalendar === true,
    timezone,
    enabledAt: new Date().toISOString(),
  });

  return NextResponse.json(
    {
      ok: true,
      automationEnabled: true,
      gmailAutoScanEnabled: true,
      calendarAssistEnabled: true,
      autoCommitCalendar: process.env.LINGT_AUTOCOMMIT_CALENDAR === 'true' && body.autoCommitCalendar === true,
    },
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
