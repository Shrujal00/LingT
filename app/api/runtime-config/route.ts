import {NextResponse} from 'next/server';
import {getRuntimeFirebaseConfig} from '@/lib/firebase/runtime-config';

function serializeForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export async function GET() {
  const config = getRuntimeFirebaseConfig();
  const body = `window.__LINGT_FIREBASE_CONFIG__=${serializeForScript(config)};`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
