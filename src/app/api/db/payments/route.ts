import {NextRequest, NextResponse} from 'next/server';
import {ADMIN_UID} from '@/lib/admin';
import {AuthError, requireAdmin} from '@/lib/firebase-auth-server';
import {
  adminCollectionPath,
  createDocument,
  listCollection,
} from '@/lib/firestore-rest';
import type {Payment} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getAdminUid = () => ADMIN_UID;

const getIdToken = (request: NextRequest) => {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice(7);
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const payments = await listCollection<Payment>(
      adminCollectionPath(getAdminUid(), 'payments'),
      {orderBy: 'date desc', pageSize: 500}
    );

    return NextResponse.json(payments);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    console.error('GET /api/db/payments failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to load payments'},
      {status: 502}
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as Omit<Payment, 'id'>;
    const payment = await createDocument<Payment>(
      adminCollectionPath(getAdminUid(), 'payments'),
      {
        ...body,
        createdAt: new Date(),
      },
      {idToken: getIdToken(request)}
    );

    return NextResponse.json(payment, {status: 201});
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    console.error('POST /api/db/payments failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create payment';
    const status =
      message.includes('PERMISSION_DENIED') ||
      message.includes('Missing or insufficient permissions')
        ? 403
        : 502;
    return NextResponse.json({error: message}, {status});
  }
}
