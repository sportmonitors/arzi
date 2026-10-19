import {NextResponse} from 'next/server';
import {getDB} from '@/lib/cloudflare';
import {listProjects} from '@/lib/time-entries-db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = await getDB();
    const projects = await listProjects(db);
    return NextResponse.json(projects);
  } catch (error) {
    console.error('GET /api/projects failed:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Failed to load projects'},
      {status: 502}
    );
  }
}
