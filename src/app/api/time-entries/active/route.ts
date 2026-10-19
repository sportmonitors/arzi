import {NextRequest, NextResponse} from 'next/server';
import {AuthError, requireAdmin} from '@/lib/firebase-auth-server';
import {getDB} from '@/lib/cloudflare';
import {getActiveTimer} from '@/lib/time-entries-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAdmin(request);
    const db = await getDB();
    const timer = await getActiveTimer(db, userId);
    return NextResponse.json(timer);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    console.error('GET /api/time-entries/active failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to load active timer'},
      {status: 502}
    );
  }
}
