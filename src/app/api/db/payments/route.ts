import {NextRequest, NextResponse} from 'next/server';
import {
  adminCollectionPath,
  createDocument,
  listCollection,
} from '@/lib/firestore-rest';
import type {Payment} from '@/types';

export const runtime = 'nodejs';

const getAdminUid = () => process.env.NEXT_PUBLIC_ADMIN_UID;

const getIdToken = (request: NextRequest) => {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice(7);
};

export async function GET() {
  try {
    const adminUid = getAdminUid();
    if (!adminUid) {
      return NextResponse.json(
        {error: 'ADMIN_UID is not configured'},
        {status: 500}
      );
    }

    const payments = await listCollection<Payment>(
      adminCollectionPath(adminUid, 'payments'),
      {orderBy: 'date desc', pageSize: 500}
    );

    return NextResponse.json(payments);
  } catch (error) {
    console.error('GET /api/db/payments failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to load payments'},
      {status: 502}
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUid = getAdminUid();
    if (!adminUid) {
      return NextResponse.json(
        {error: 'ADMIN_UID is not configured'},
        {status: 500}
      );
    }

    const body = (await request.json()) as Omit<Payment, 'id'>;
    const payment = await createDocument<Payment>(
      adminCollectionPath(adminUid, 'payments'),
      {
        ...body,
        createdAt: new Date(),
      },
      {idToken: getIdToken(request)}
    );

    return NextResponse.json(payment, {status: 201});
  } catch (error) {
    console.error('POST /api/db/payments failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create payment';
    const status = message.includes('PERMISSION_DENIED') ||
      message.includes('Missing or insufficient permissions')
      ? 403
      : 502;
    return NextResponse.json({error: message}, {status});
  }
}
