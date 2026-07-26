import {NextRequest, NextResponse} from 'next/server';
import {adminDocumentPath, deleteDocument, updateDocument} from '@/lib/firestore-rest';
import type {Payment} from '@/types';

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
    const payment = (await request.json()) as Payment;
    const {id: _id, ...data} = payment;

    await updateDocument(
      adminDocumentPath(adminUid, 'payments', id),
      data,
      {idToken: getIdToken(request)}
    );

    return NextResponse.json({ok: true});
  } catch (error) {
    console.error('PUT /api/db/payments/[id] failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update payment';
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
      adminDocumentPath(adminUid, 'payments', id),
      {idToken: getIdToken(request)}
    );

    return NextResponse.json({ok: true});
  } catch (error) {
    console.error('DELETE /api/db/payments/[id] failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to delete payment';
    const status = message.includes('PERMISSION_DENIED') ||
      message.includes('Missing or insufficient permissions')
      ? 403
      : 502;
    return NextResponse.json({error: message}, {status});
  }
}
