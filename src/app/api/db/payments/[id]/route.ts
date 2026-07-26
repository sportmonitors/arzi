import {NextRequest, NextResponse} from 'next/server';
import {ADMIN_UID} from '@/lib/admin';
import {adminDocumentPath, deleteDocument, updateDocument} from '@/lib/firestore-rest';
import type {Payment} from '@/types';

export const runtime = 'nodejs';

const getIdToken = (request: NextRequest) => {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice(7);
};

type RouteContext = {params: Promise<{id: string}>};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const {id} = await context.params;
    const payment = (await request.json()) as Payment;
    const {id: _id, ...data} = payment;

    await updateDocument(
      adminDocumentPath(ADMIN_UID, 'payments', id),
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
    const {id} = await context.params;
    await deleteDocument(
      adminDocumentPath(ADMIN_UID, 'payments', id),
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
