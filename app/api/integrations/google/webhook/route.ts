import {NextResponse} from 'next/server';
import {getServerFirestore} from '@/lib/firebase/server';
import {runConnectedGmailScan} from '@/lib/automation/gmail-sync';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.message || !body.message.data) {
      return NextResponse.json({error: 'Invalid Pub/Sub message payload'}, {status: 400});
    }

    // Decode base64 payload from Pub/Sub
    const decodedString = Buffer.from(body.message.data, 'base64').toString('utf-8');
    const data = JSON.parse(decodedString);
    const emailAddress = typeof data.emailAddress === 'string' ? data.emailAddress.toLowerCase().trim() : '';

    if (!emailAddress) {
      return NextResponse.json({error: 'No emailAddress found in decoded message'}, {status: 400});
    }

    // Query matching user in googleIntegrations
    const db = getServerFirestore();
    const snap = await db
      .collection('googleIntegrations')
      .where('email', '==', emailAddress)
      .limit(1)
      .get();

    if (snap.empty) {
      console.log(`[Gmail Webhook] No matching user integration found for email: ${emailAddress}`);
      return NextResponse.json({status: 'ignored', reason: 'User integration not found'});
    }

    const doc = snap.docs[0];
    const {userId} = doc.data();

    // Trigger instant scanning
    console.log(`[Gmail Webhook] Push event detected. Running instant inbox scan for: ${emailAddress} (User: ${userId})`);
    const scanResult = await runConnectedGmailScan(userId, {limit: 5});

    return NextResponse.json({
      status: 'success',
      email: emailAddress,
      userId,
      scanned: scanResult.scanned,
      processed: scanResult.processed,
    });
  } catch (error) {
    console.error('[Gmail Webhook] Error processing push event', error);
    return NextResponse.json({error: 'Internal processing error'}, {status: 500});
  }
}
