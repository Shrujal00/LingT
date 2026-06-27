import {NextResponse} from 'next/server';
import {getServerDocument, hasFirebaseAdminConfig} from '@/lib/firebase/server';
import {hasGoogleOAuthConfig, type StoredGoogleIntegration} from '@/lib/google/oauth';

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const userId = searchParams.get('userId')?.trim();

  if (!userId) {
    return NextResponse.json({error: 'userId is required'}, {status: 400});
  }

  if (!hasFirebaseAdminConfig()) {
    return NextResponse.json(
      {
        connected: false,
        scope: '',
        connectedAt: null,
        oauthConfigured: hasGoogleOAuthConfig(),
        serverStorageConfigured: false,
        error: 'Firebase Admin credentials are missing.',
      },
      {
        headers: {'Cache-Control': 'no-store, max-age=0'},
      },
    );
  }

  try {
    const integration = await getServerDocument<StoredGoogleIntegration>('googleIntegrations', userId);

    return NextResponse.json(
      {
        connected: Boolean(integration?.refreshToken || integration?.accessToken),
        scope: integration?.scope || '',
        connectedAt: integration?.connectedAt || null,
        lastGmailScanAt: (integration as StoredGoogleIntegration & {lastGmailScanAt?: string})?.lastGmailScanAt || null,
        lastGmailScan: (integration as StoredGoogleIntegration & {lastGmailScan?: unknown})?.lastGmailScan || null,
        oauthConfigured: hasGoogleOAuthConfig(),
        serverStorageConfigured: true,
        error: null,
      },
      {
        headers: {'Cache-Control': 'no-store, max-age=0'},
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        scope: '',
        connectedAt: null,
        oauthConfigured: hasGoogleOAuthConfig(),
        serverStorageConfigured: hasFirebaseAdminConfig(),
        error: error instanceof Error ? error.message : 'Unable to read integration status.',
      },
      {
        headers: {'Cache-Control': 'no-store, max-age=0'},
      },
    );
  }
}
