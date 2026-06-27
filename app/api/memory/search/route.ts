import {NextResponse} from 'next/server';
import {getAuthenticatedUserId} from '@/lib/firebase/server';
import {searchMemory} from '@/lib/memory/search';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const requestedUserId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const userId = await getAuthenticatedUserId(request, requestedUserId);
  const query = typeof body?.query === 'string' ? body.query.trim() : '';

  if (!userId || !query) {
    return NextResponse.json({error: 'userId and query are required'}, {status: 400});
  }

  const result = await searchMemory(userId, query);

  return NextResponse.json(result, {
    headers: {'Cache-Control': 'no-store, max-age=0'},
  });
}
