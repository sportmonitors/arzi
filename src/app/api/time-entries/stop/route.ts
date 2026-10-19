import {NextRequest, NextResponse} from 'next/server';
import {AuthError, requireAdmin} from '@/lib/firebase-auth-server';
import {getDB} from '@/lib/cloudflare';
import {stopTimer} from '@/lib/time-entries-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const uid = await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as {
      description?: string;
      endAt?: string;
    };
    const db = await getDB();

    const entry = await stopTimer(db, uid, {
      description: body.description,
      endAt: body.endAt ? new Date(body.endAt).toISOString() : undefined,
    });

    return NextResponse.json(entry);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    if (error instanceof Error && error.message === 'NO_ACTIVE_TIMER') {
      return NextResponse.json({error: 'No active timer'}, {status: 409});
    }
    console.error('POST /api/time-entries/stop failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to stop timer'},
      {status: 502}
    );
  }
}
