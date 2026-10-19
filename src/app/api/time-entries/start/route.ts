import {NextRequest, NextResponse} from 'next/server';
import {AuthError, requireAdmin} from '@/lib/firebase-auth-server';
import {getDB} from '@/lib/cloudflare';
import {startTimer} from '@/lib/time-entries-db';
import type {StartTimerInput} from '@/types/time-tracking';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const uid = await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as StartTimerInput;
    const db = await getDB();

    const timer = await startTimer(db, uid, {
      description: body.description?.trim() || '',
      projectId: body.projectId,
      rate: body.rate,
    });

    return NextResponse.json(timer, {status: 201});
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    if (error instanceof Error && error.message === 'TIMER_ALREADY_RUNNING') {
      return NextResponse.json(
        {error: 'A timer is already running'},
        {status: 409}
      );
    }
    console.error('POST /api/time-entries/start failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to start timer'},
      {status: 502}
    );
  }
}
