import {NextResponse} from 'next/server';
import {createGoogleAuthorizationUrl, hasGoogleOAuthConfig} from '@/lib/google/oauth';

function appUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const userId = searchParams.get('userId')?.trim();

  if (!userId) {
    return NextResponse.json({error: 'userId is required'}, {status: 400});
  }

  if (!hasGoogleOAuthConfig()) {
    return NextResponse.redirect(`${appUrl()}/integrations?google=config-missing`);
  }

  return NextResponse.redirect(createGoogleAuthorizationUrl(userId));
}
