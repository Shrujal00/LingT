import {NextResponse} from 'next/server';
import {addServerDocument, getAuthenticatedUserId, hasFirebaseAdminConfig} from '@/lib/firebase/server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const requestedUserId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const userId = await getAuthenticatedUserId(request, requestedUserId);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const platform = typeof body?.platform === 'string' ? body.platform.trim() : 'web';

  if (!userId || !token) {
    return NextResponse.json({error: 'userId and token are required'}, {status: 400});
  }

  if (!hasFirebaseAdminConfig()) {
    return NextResponse.json(
      {
        registered: false,
        error: 'Firebase Admin credentials are required to store notification tokens.',
      },
      {status: 200, headers: {'Cache-Control': 'no-store, max-age=0'}},
    );
  }

  await addServerDocument('notificationTokens', {
    userId,
    token,
    platform,
    permissionOnly: body?.permissionOnly === true,
    lastSeenAt: new Date().toISOString(),
    source: 'ling-notifications',
  });

  return NextResponse.json(
    {registered: true},
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
