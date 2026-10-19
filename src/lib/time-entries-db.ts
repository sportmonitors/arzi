import type {
  ActiveTimer,
  CreateTimeEntryInput,
  Project,
  TimeEntry,
  TimeEntryListResponse,
  TimeEntrySource,
  UpdateTimeEntryInput,
} from '@/types/time-tracking';

const DEFAULT_RATE = 8.12;
const DEFAULT_TZ = 'Asia/Tehran';
/** D1/SQLite max bound parameters per statement. */
const D1_MAX_BOUND_VARS = 100;

type EntryRow = {
  id: string;
  description: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  start_at: string;
  end_at: string | null;
  duration_seconds: number;
  time_zone: string;
  project_id: string | null;
  billable: number;
  currency: string;
  rate: number;
  amount: number | null;
  earned_amount: number | null;
  source: TimeEntrySource;
  created_at: string;
  updated_at: string;
  project_name?: string | null;
  project_color?: string | null;
  client_name?: string | null;
};

const nowIso = () => new Date().toISOString();

const durationBetween = (startAt: string, endAt: string) => {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
  return Math.max(0, Math.floor(ms / 1000));
};

const mapEntry = (row: EntryRow, tagIds: string[] = [], tagNames: string[] = []): TimeEntry => ({
  id: row.id,
  description: row.description,
  userId: row.user_id,
  userName: row.user_name,
  userEmail: row.user_email,
  startAt: row.start_at,
  endAt: row.end_at,
  durationSeconds: row.duration_seconds,
  timeZone: row.time_zone,
  projectId: row.project_id,
  projectName: row.project_name ?? null,
  projectColor: row.project_color ?? null,
  clientName: row.client_name ?? null,
  billable: Boolean(row.billable),
  currency: row.currency,
  rate: row.rate,
  amount: row.amount,
  earnedAmount: row.earned_amount,
  source: row.source,
  tagIds,
  tagNames,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const ENTRY_SELECT = `
  SELECT e.*, p.name AS project_name, p.color AS project_color, p.client_name AS client_name
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
`;

async function loadTagsForEntries(
  db: D1Database,
  entryIds: string[]
): Promise<Map<string, {ids: string[]; names: string[]}>> {
  const map = new Map<string, {ids: string[]; names: string[]}>();
  if (entryIds.length === 0) return map;

  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < entryIds.length; i += D1_MAX_BOUND_VARS) {
    const chunk = entryIds.slice(i, i + D1_MAX_BOUND_VARS);
    const placeholders = chunk.map(() => '?').join(',');
    statements.push(
      db
        .prepare(
          `SELECT tet.time_entry_id, t.id AS tag_id, t.name AS tag_name
           FROM time_entry_tags tet
           JOIN tags t ON t.id = tet.tag_id
           WHERE tet.time_entry_id IN (${placeholders})`
        )
        .bind(...chunk)
    );
  }

  const batches = await db.batch<{
    time_entry_id: string;
    tag_id: string;
    tag_name: string;
  }>(statements);

  for (const result of batches) {
    for (const row of result.results ?? []) {
      const current = map.get(row.time_entry_id) ?? {ids: [], names: []};
      current.ids.push(row.tag_id);
      current.names.push(row.tag_name);
      map.set(row.time_entry_id, current);
    }
  }
  return map;
}

export async function listProjects(db: D1Database): Promise<Project[]> {
  const result = await db
    .prepare(
      `SELECT id, name, color, client_id, client_name
       FROM projects
       ORDER BY name COLLATE NOCASE ASC`
    )
    .all<{
      id: string;
      name: string;
      color: string | null;
      client_id: string | null;
      client_name: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    clientId: row.client_id,
    clientName: row.client_name,
  }));
}

export async function listTimeEntries(
  db: D1Database,
  opts: {
    limit?: number;
    cursor?: string | null;
    projectId?: string | null;
    from?: string | null;
    to?: string | null;
    source?: TimeEntrySource | null;
  } = {}
): Promise<TimeEntryListResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.projectId) {
    where.push('e.project_id = ?');
    params.push(opts.projectId);
  }
  if (opts.from) {
    where.push('e.start_at >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    where.push('e.start_at <= ?');
    params.push(opts.to);
  }
  if (opts.source) {
    where.push('e.source = ?');
    params.push(opts.source);
  }

  if (opts.cursor) {
    const [cursorStart, cursorId] = opts.cursor.split('|');
    if (cursorStart && cursorId) {
      where.push('(e.start_at < ? OR (e.start_at = ? AND e.id < ?))');
      params.push(cursorStart, cursorStart, cursorId);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db
    .prepare(
      `${ENTRY_SELECT}
       ${whereSql}
       ORDER BY e.start_at DESC, e.id DESC
       LIMIT ?`
    )
    .bind(...params, limit + 1)
    .all<EntryRow>();

  const list = rows.results ?? [];
  const hasMore = list.length > limit;
  const page = hasMore ? list.slice(0, limit) : list;
  const tags = await loadTagsForEntries(
    db,
    page.map((r) => r.id)
  );

  const entries = page.map((row) => {
    const t = tags.get(row.id);
    return mapEntry(row, t?.ids ?? [], t?.names ?? []);
  });

  const last = page[page.length - 1];
  return {
    entries,
    nextCursor: hasMore && last ? `${last.start_at}|${last.id}` : null,
  };
}

export async function getTimeEntry(
  db: D1Database,
  id: string
): Promise<TimeEntry | null> {
  const row = await db
    .prepare(`${ENTRY_SELECT} WHERE e.id = ?`)
    .bind(id)
    .first<EntryRow>();
  if (!row) return null;
  const tags = await loadTagsForEntries(db, [id]);
  const t = tags.get(id);
  return mapEntry(row, t?.ids ?? [], t?.names ?? []);
}

export async function createTimeEntry(
  db: D1Database,
  input: CreateTimeEntryInput,
  opts: {id?: string; userId?: string; userName?: string; userEmail?: string} = {}
): Promise<TimeEntry> {
  const id = opts.id ?? crypto.randomUUID();
  const rate = input.rate ?? DEFAULT_RATE;
  const durationSeconds = durationBetween(input.startAt, input.endAt);
  const amount = (durationSeconds / 3600) * rate;
  const source = input.source ?? 'manual';
  const stamp = nowIso();

  await db
    .prepare(
      `INSERT INTO time_entries (
        id, description, user_id, user_name, user_email,
        start_at, end_at, duration_seconds, time_zone,
        project_id, billable, currency, rate, amount, earned_amount,
        source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.description || '',
      opts.userId ?? null,
      opts.userName ?? null,
      opts.userEmail ?? null,
      input.startAt,
      input.endAt,
      durationSeconds,
      DEFAULT_TZ,
      input.projectId ?? null,
      input.billable === false ? 0 : 1,
      rate,
      amount,
      amount,
      source,
      stamp,
      stamp
    )
    .run();

  const created = await getTimeEntry(db, id);
  if (!created) throw new Error('Failed to load created entry');
  return created;
}

export async function updateTimeEntry(
  db: D1Database,
  id: string,
  input: UpdateTimeEntryInput
): Promise<TimeEntry> {
  const existing = await getTimeEntry(db, id);
  if (!existing) throw new Error('NOT_FOUND');

  const startAt = input.startAt ?? existing.startAt;
  const endAt = input.endAt ?? existing.endAt;
  if (!endAt) throw new Error('endAt is required');

  const rate = input.rate ?? existing.rate;
  const durationSeconds = durationBetween(startAt, endAt);
  const amount = (durationSeconds / 3600) * rate;
  const stamp = nowIso();

  await db
    .prepare(
      `UPDATE time_entries SET
        description = ?,
        start_at = ?,
        end_at = ?,
        duration_seconds = ?,
        project_id = ?,
        billable = ?,
        rate = ?,
        amount = ?,
        earned_amount = ?,
        updated_at = ?
       WHERE id = ?`
    )
    .bind(
      input.description ?? existing.description,
      startAt,
      endAt,
      durationSeconds,
      input.projectId === undefined ? existing.projectId ?? null : input.projectId,
      input.billable === undefined
        ? existing.billable
          ? 1
          : 0
        : input.billable
          ? 1
          : 0,
      rate,
      amount,
      amount,
      stamp,
      id
    )
    .run();

  const updated = await getTimeEntry(db, id);
  if (!updated) throw new Error('Failed to load updated entry');
  return updated;
}

export async function deleteTimeEntry(db: D1Database, id: string): Promise<void> {
  const result = await db
    .prepare(`DELETE FROM time_entries WHERE id = ?`)
    .bind(id)
    .run();
  if (!result.meta.changes) throw new Error('NOT_FOUND');
}

export async function getActiveTimer(
  db: D1Database,
  userId: string
): Promise<ActiveTimer | null> {
  const row = await db
    .prepare(
      `SELECT a.user_id, a.description, a.project_id, a.rate, a.started_at, p.name AS project_name
       FROM active_timers a
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.user_id = ?`
    )
    .bind(userId)
    .first<{
      user_id: string;
      description: string;
      project_id: string | null;
      rate: number;
      started_at: string;
      project_name: string | null;
    }>();

  if (!row) return null;
  return {
    userId: row.user_id,
    description: row.description,
    projectId: row.project_id,
    rate: row.rate,
    startedAt: row.started_at,
    projectName: row.project_name,
  };
}

export async function startTimer(
  db: D1Database,
  userId: string,
  input: {description?: string; projectId?: string | null; rate?: number}
): Promise<ActiveTimer> {
  const existing = await getActiveTimer(db, userId);
  if (existing) {
    const err = new Error('TIMER_ALREADY_RUNNING');
    throw err;
  }

  const startedAt = nowIso();
  await db
    .prepare(
      `INSERT INTO active_timers (user_id, description, project_id, rate, started_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      input.description ?? '',
      input.projectId ?? null,
      input.rate ?? DEFAULT_RATE,
      startedAt
    )
    .run();

  const timer = await getActiveTimer(db, userId);
  if (!timer) throw new Error('Failed to start timer');
  return timer;
}

export async function stopTimer(
  db: D1Database,
  userId: string,
  opts: {description?: string; endAt?: string} = {}
): Promise<TimeEntry> {
  const active = await getActiveTimer(db, userId);
  if (!active) throw new Error('NO_ACTIVE_TIMER');

  const endAt = opts.endAt ?? nowIso();
  const description =
    opts.description !== undefined ? opts.description : active.description;

  const entry = await createTimeEntry(
    db,
    {
      description,
      startAt: active.startedAt,
      endAt,
      rate: active.rate,
      projectId: active.projectId,
      source: 'timer',
    },
    {userId}
  );

  await db.prepare(`DELETE FROM active_timers WHERE user_id = ?`).bind(userId).run();
  return entry;
}

