import {NextRequest, NextResponse} from 'next/server';
import {AuthError, requireAdmin} from '@/lib/firebase-auth-server';
import {getDB} from '@/lib/cloudflare';
import {createTimeEntry, listTimeEntries} from '@/lib/time-entries-db';
import type {CreateTimeEntryInput, TimeEntrySource} from '@/types/time-tracking';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const db = await getDB();
    const {searchParams} = request.nextUrl;
    const result = await listTimeEntries(db, {
      limit: Number(searchParams.get('limit') || 500),
      cursor: searchParams.get('cursor'),
      projectId: searchParams.get('projectId'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      source: searchParams.get('source') as TimeEntrySource | null,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/time-entries failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to load time entries'},
      {status: 502}
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const uid = await requireAdmin(request);
    const body = (await request.json()) as CreateTimeEntryInput;

    if (!body.description?.trim()) {
      return NextResponse.json({error: 'description is required'}, {status: 400});
    }
    if (!body.startAt || !body.endAt) {
      return NextResponse.json({error: 'startAt and endAt are required'}, {status: 400});
    }

    const db = await getDB();
    const entry = await createTimeEntry(
      db,
      {
        description: body.description.trim(),
        startAt: new Date(body.startAt).toISOString(),
        endAt: new Date(body.endAt).toISOString(),
        rate: body.rate,
        projectId: body.projectId,
        billable: body.billable,
        source: 'manual',
      },
      {userId: uid}
    );

    return NextResponse.json(entry, {status: 201});
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    console.error('POST /api/time-entries failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to create time entry'},
      {status: 502}
    );
  }
}
