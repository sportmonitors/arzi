import {NextRequest, NextResponse} from 'next/server';
import {adminDocumentPath, deleteDocument, updateDocument} from '@/lib/firestore-rest';
import type {WorkLog} from '@/types';

export const runtime = 'nodejs';

const getAdminUid = () => process.env.NEXT_PUBLIC_ADMIN_UID;

const getIdToken = (request: NextRequest) => {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice(7);
};

type RouteContext = {params: Promise<{id: string}>};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const adminUid = getAdminUid();
    if (!adminUid) {
      return NextResponse.json(
        {error: 'ADMIN_UID is not configured'},
        {status: 500}
      );
    }

    const {id} = await context.params;
    const workLog = (await request.json()) as WorkLog;
    const {id: _id, ...data} = workLog;

    await updateDocument(
      adminDocumentPath(adminUid, 'work-logs', id),
      data,
      {idToken: getIdToken(request)}
    );

    return NextResponse.json({ok: true});
  } catch (error) {
    console.error('PUT /api/db/work-logs/[id] failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update work log';
    const status = message.includes('PERMISSION_DENIED') ||
      message.includes('Missing or insufficient permissions')
      ? 403
      : 502;
    return NextResponse.json({error: message}, {status});
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const adminUid = getAdminUid();
    if (!adminUid) {
      return NextResponse.json(
        {error: 'ADMIN_UID is not configured'},
        {status: 500}
      );
    }

    const {id} = await context.params;
    await deleteDocument(
      adminDocumentPath(adminUid, 'work-logs', id),
      {idToken: getIdToken(request)}
    );

    return NextResponse.json({ok: true});
  } catch (error) {
    console.error('DELETE /api/db/work-logs/[id] failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to delete work log';
    const status = message.includes('PERMISSION_DENIED') ||
      message.includes('Missing or insufficient permissions')
      ? 403
      : 502;
    return NextResponse.json({error: message}, {status});
  }
}
