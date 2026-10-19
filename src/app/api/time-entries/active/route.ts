import {NextRequest, NextResponse} from 'next/server';
import {ADMIN_UID} from '@/lib/admin';
import {AuthError, requireAdmin} from '@/lib/firebase-auth-server';
import {getDB} from '@/lib/cloudflare';
import {getActiveTimer} from '@/lib/time-entries-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Prefer authenticated admin; fall back to shared ADMIN_UID for read
    let userId = ADMIN_UID;
    try {
      userId = await requireAdmin(request);
    } catch {
      // public/read with default admin timer scope
    }

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
