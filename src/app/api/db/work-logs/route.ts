import {NextRequest, NextResponse} from 'next/server';
import {ADMIN_UID} from '@/lib/admin';
import {
  adminCollectionPath,
  createDocument,
  listCollection,
} from '@/lib/firestore-rest';
import type {WorkLog} from '@/types';

export const runtime = 'nodejs';

const getAdminUid = () => ADMIN_UID;

const getIdToken = (request: NextRequest) => {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice(7);
};

export async function GET() {
  try {
    const workLogs = await listCollection<WorkLog>(
      adminCollectionPath(getAdminUid(), 'work-logs'),
      {orderBy: 'createdAt desc', pageSize: 500}
    );

    return NextResponse.json(workLogs);
  } catch (error) {
    console.error('GET /api/db/work-logs failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to load work logs'},
      {status: 502}
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Omit<WorkLog, 'id'>;
    const workLog = await createDocument<WorkLog>(
      adminCollectionPath(getAdminUid(), 'work-logs'),
      {
        ...body,
        createdAt: new Date(),
      },
      {idToken: getIdToken(request)}
    );

    return NextResponse.json(workLog, {status: 201});
  } catch (error) {
    console.error('POST /api/db/work-logs failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create work log';
    const status = message.includes('PERMISSION_DENIED') ||
      message.includes('Missing or insufficient permissions')
      ? 403
      : 502;
    return NextResponse.json({error: message}, {status});
  }
}
