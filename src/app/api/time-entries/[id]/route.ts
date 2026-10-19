import {NextRequest, NextResponse} from 'next/server';
import {AuthError, requireAdmin} from '@/lib/firebase-auth-server';
import {getDB} from '@/lib/cloudflare';
import {deleteTimeEntry, updateTimeEntry} from '@/lib/time-entries-db';
import type {UpdateTimeEntryInput} from '@/types/time-tracking';

export const runtime = 'nodejs';

type Ctx = {params: Promise<{id: string}>};

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    await requireAdmin(request);
    const {id} = await context.params;
    const body = (await request.json()) as UpdateTimeEntryInput;
    const db = await getDB();

    const entry = await updateTimeEntry(db, id, {
      ...body,
      startAt: body.startAt ? new Date(body.startAt).toISOString() : undefined,
      endAt: body.endAt ? new Date(body.endAt).toISOString() : undefined,
    });

    return NextResponse.json(entry);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({error: 'Not found'}, {status: 404});
    }
    console.error('PUT /api/time-entries/[id] failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to update'},
      {status: 502}
    );
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    await requireAdmin(request);
    const {id} = await context.params;
    const db = await getDB();
    await deleteTimeEntry(db, id);
    return new NextResponse(null, {status: 204});
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({error: 'Not found'}, {status: 404});
    }
    console.error('DELETE /api/time-entries/[id] failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to delete'},
      {status: 502}
    );
  }
}
