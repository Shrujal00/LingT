import { NextResponse } from 'next/server';

export async function GET() {
  // Simulating internal checklist checks
  const systemStatus = {
    status: 'operational',
    timestamp: new Date().toISOString(),
    service: 'LingT Core Orchestrator',
    version: '1.0.0-beta',
    environment: process.env.NODE_ENV || 'development',
    integrations: {
      gemini: {
        status: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
        provider: 'Google GenAI SDK (gemini-2.5-flash / gemini-3.5-flash)',
      },
      firebase: {
        status: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'configured' : 'missing',
        message: 'Firebase Auth and Firestore back the user workspace',
      },
      googleCalendar: {
        status: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? 'configured' : 'missing',
        message: 'OAuth enables Calendar read/write after consent',
      },
      gmailAgent: {
        status: process.env.GMAIL_WEBHOOK_SECRET ? 'configured' : 'missing',
        message: 'Apps Script can call /api/gmail/webhook for incoming mail processing',
      },
    },
    checks: {
      memoryCache: 'healthy',
      taskScheduler: 'idle',
      escalationDaemon: 'active',
    },
  };

  return NextResponse.json(systemStatus, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
