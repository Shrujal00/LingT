import {NextResponse} from 'next/server';
import {setServerDocument} from '@/lib/firebase/server';
import {exchangeGoogleCode, parseGoogleOAuthState} from '@/lib/google/oauth';

function appUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${appUrl()}/integrations?google=denied`);
  }

  if (!code || !state) {
    return NextResponse.json({error: 'code and state are required'}, {status: 400});
  }

  try {
    const userId = parseGoogleOAuthState(state);
    const tokens = await exchangeGoogleCode(code);

    if (!tokens.refresh_token && !tokens.access_token) {
      throw new Error('Google did not return usable tokens.');
    }

    await setServerDocument('googleIntegrations', userId, {
      userId,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
      scope: tokens.scope || '',
      connectedAt: new Date().toISOString(),
      automationEnabled: true,
      gmailAutoScanEnabled: true,
      calendarAssistEnabled: true,
      autoCommitCalendar: process.env.LINGT_AUTOCOMMIT_CALENDAR === 'true',
      provider: 'google',
    });

    return NextResponse.redirect(`${appUrl()}/integrations?google=connected&scan=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google OAuth failed';
    return NextResponse.redirect(
      `${appUrl()}/integrations?google=error&message=${encodeURIComponent(message)}`,
    );
  }
}
