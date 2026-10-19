#!/usr/bin/env tsx
/**
 * One-shot import of Clockify JSON dumps into D1.
 *
 * Usage:
 *   npx tsx scripts/import-clockify-logs.ts --local
 *   npx tsx scripts/import-clockify-logs.ts --remote
 *   npx tsx scripts/import-clockify-logs.ts --sql-only > /tmp/import.sql
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT, 'old_works_logs');
const DEFAULT_RATE = 8.12;

type ClockifyTag = {_id: string; name: string};
type ClockifyEntry = {
  _id: string;
  description?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  timeInterval: {
    start: string;
    end: string;
    duration: number;
    timeZone?: string;
  };
  billable?: boolean;
  projectId?: string | null;
  projectName?: string | null;
  projectColor?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  tagIds?: string[] | null;
  tags?: ClockifyTag[] | null;
  currency?: string;
  rate?: number;
  amount?: number;
  earnedAmount?: number;
};

const sqlString = (value: string | null | undefined) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
};

const sqlNum = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'NULL';
  return String(value);
};

const loadEntries = (): ClockifyEntry[] => {
  const files = [
    'clockify-report-2025-1-200.json',
    'clockify-report-2025-200-400.json',
    'clockify-report-2025-400-540.json',
    'clockify-report-2026.json',
  ];

  const byId = new Map<string, ClockifyEntry>();

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, file), 'utf8'));
    const list: ClockifyEntry[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.timeentries)
        ? raw.timeentries
        : [];

    for (const entry of list) {
      if (!entry?._id || !entry.timeInterval?.start) continue;
      byId.set(entry._id, entry);
    }
  }

  return [...byId.values()];
};

const buildSql = (entries: ClockifyEntry[]): string => {
  const projects = new Map<
    string,
    {name: string; color: string | null; clientId: string | null; clientName: string | null}
  >();
  const tags = new Map<string, string>();
  const entryTagPairs: Array<{entryId: string; tagId: string}> = [];

  for (const entry of entries) {
    if (entry.projectId) {
      projects.set(entry.projectId, {
        name: entry.projectName || 'Untitled',
        color: entry.projectColor ?? null,
        clientId: entry.clientId ?? null,
        clientName: entry.clientName ?? null,
      });
    }

    if (Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        if (!tag?._id) continue;
        tags.set(tag._id, tag.name || tag._id);
        entryTagPairs.push({entryId: entry._id, tagId: tag._id});
      }
    } else if (Array.isArray(entry.tagIds)) {
      for (const tagId of entry.tagIds) {
        if (!tagId) continue;
        if (!tags.has(tagId)) tags.set(tagId, tagId);
        entryTagPairs.push({entryId: entry._id, tagId});
      }
    }
  }

  // D1 remote execute rejects BEGIN/COMMIT/SAVEPOINT — statements are applied as batches by wrangler.
  const lines: string[] = [];

  for (const [id, project] of projects) {
    lines.push(
      `INSERT INTO projects (id, name, color, client_id, client_name)
       VALUES (${sqlString(id)}, ${sqlString(project.name)}, ${sqlString(project.color)}, ${sqlString(project.clientId)}, ${sqlString(project.clientName)})
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         color = excluded.color,
         client_id = excluded.client_id,
         client_name = excluded.client_name;`
    );
  }

  for (const [id, name] of tags) {
    lines.push(
      `INSERT INTO tags (id, name)
       VALUES (${sqlString(id)}, ${sqlString(name)})
       ON CONFLICT(id) DO UPDATE SET name = excluded.name;`
    );
  }

  for (const entry of entries) {
    const rate =
      typeof entry.rate === 'number' && entry.rate > 0 ? entry.rate : DEFAULT_RATE;
    const duration = Math.max(0, Math.floor(entry.timeInterval.duration || 0));
    const amount =
      typeof entry.earnedAmount === 'number'
        ? entry.earnedAmount
        : typeof entry.amount === 'number'
          ? entry.amount
          : (duration / 3600) * rate;

    lines.push(
      `INSERT INTO time_entries (
        id, description, user_id, user_name, user_email,
        start_at, end_at, duration_seconds, time_zone,
        project_id, billable, currency, rate, amount, earned_amount,
        source, created_at, updated_at
      ) VALUES (
        ${sqlString(entry._id)},
        ${sqlString(entry.description || '')},
        ${sqlString(entry.userId ?? null)},
        ${sqlString(entry.userName ?? null)},
        ${sqlString(entry.userEmail ?? null)},
        ${sqlString(entry.timeInterval.start)},
        ${sqlString(entry.timeInterval.end)},
        ${duration},
        ${sqlString(entry.timeInterval.timeZone || 'Asia/Tehran')},
        ${sqlString(entry.projectId ?? null)},
        ${entry.billable === false ? 0 : 1},
        ${sqlString(entry.currency || 'USD')},
        ${rate},
        ${sqlNum(amount)},
        ${sqlNum(amount)},
        'clockify_import',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      ON CONFLICT(id) DO UPDATE SET
        description = excluded.description,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        duration_seconds = excluded.duration_seconds,
        project_id = excluded.project_id,
        rate = excluded.rate,
        amount = excluded.amount,
        earned_amount = excluded.earned_amount,
        updated_at = excluded.updated_at;`
    );
  }

  for (const pair of entryTagPairs) {
    lines.push(
      `INSERT OR IGNORE INTO time_entry_tags (time_entry_id, tag_id)
       VALUES (${sqlString(pair.entryId)}, ${sqlString(pair.tagId)});`
    );
  }

  return lines.join('\n');
};

const main = () => {
  const args = new Set(process.argv.slice(2));
  const sqlOnly = args.has('--sql-only');
  const remote = args.has('--remote');
  const local = args.has('--local') || (!remote && !sqlOnly);

  const entries = loadEntries();
  console.error(`Loaded ${entries.length} unique Clockify entries`);

  const sql = buildSql(entries);

  if (sqlOnly) {
    process.stdout.write(sql);
    return;
  }

  const outFile = path.join(ROOT, '.wrangler', 'import-clockify.sql');
  fs.mkdirSync(path.dirname(outFile), {recursive: true});
  fs.writeFileSync(outFile, sql, 'utf8');

  const flag = remote ? '--remote' : '--local';
  // Prefer local wrangler (v4 on Node 22+); fallback pin for Node 20
  const wranglerPkg = process.env.WRANGLER_PKG || 'wrangler';
  console.error(`Applying import via ${wranglerPkg} d1 execute ${flag} ...`);
  execFileSync(
    'npx',
    ['-y', wranglerPkg, 'd1', 'execute', 'arzi-time-db', flag, `--file=${outFile}`, '-y'],
    {stdio: 'inherit', cwd: ROOT}
  );
  console.error('Import complete.');
};

main();
