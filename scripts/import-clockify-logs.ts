#!/usr/bin/env tsx
/**
 * Import Clockify JSON dumps into D1 (unique by Clockify `_id`).
 *
 * Overlapping export ranges in old_works_logs/ are merged: last file wins per `_id`.
 *
 * Usage:
 *   npx tsx scripts/import-clockify-logs.ts --local --reset
 *   npx tsx scripts/import-clockify-logs.ts --remote --reset --project-name=ERP
 *   npx tsx scripts/import-clockify-logs.ts --remote --reset --project-id=67eab4aa9a4ad44495b34454
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

const listLogFiles = (): string[] => {
  const preferred = [
    'clockify-report-2025-1-200.json',
    'clockify-report-2025-200-400.json',
    'clockify-report-2025-400-540.json',
    'clockify-report-2026.json',
  ];
  const onDisk = fs
    .readdirSync(LOGS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const ordered = preferred.filter((f) => onDisk.includes(f));
  for (const f of onDisk) {
    if (!ordered.includes(f)) ordered.push(f);
  }
  return ordered;
};

const loadEntries = (): {
  entries: ClockifyEntry[];
  rawCount: number;
  duplicateIdSkips: number;
  files: string[];
} => {
  const files = listLogFiles();
  const byId = new Map<string, ClockifyEntry>();
  let rawCount = 0;
  let duplicateIdSkips = 0;

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, file), 'utf8'));
    const list: ClockifyEntry[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.timeentries)
        ? raw.timeentries
        : [];

    for (const entry of list) {
      if (!entry?._id || !entry.timeInterval?.start) continue;
      rawCount += 1;
      if (byId.has(entry._id)) duplicateIdSkips += 1;
      // Last occurrence wins (later overlapping export range).
      byId.set(entry._id, entry);
    }
  }

  return {
    entries: [...byId.values()],
    rawCount,
    duplicateIdSkips,
    files,
  };
};

const buildResetSql = (): string =>
  [
    // Children first (even with CASCADE, explicit order is safest for D1 batches).
    `DELETE FROM time_entry_tags;`,
    `DELETE FROM active_timers;`,
    `DELETE FROM time_entries;`,
    `DELETE FROM tags;`,
    `DELETE FROM projects;`,
  ].join('\n');

const buildSql = (entries: ClockifyEntry[]): string => {
  const projects = new Map<
    string,
    {name: string; color: string | null; clientId: string | null; clientName: string | null}
  >();
  const tags = new Map<string, string>();
  const entryTagPairs = new Map<string, {entryId: string; tagId: string}>();

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
        entryTagPairs.set(`${entry._id}|${tag._id}`, {
          entryId: entry._id,
          tagId: tag._id,
        });
      }
    } else if (Array.isArray(entry.tagIds)) {
      for (const tagId of entry.tagIds) {
        if (!tagId) continue;
        if (!tags.has(tagId)) tags.set(tagId, tagId);
        entryTagPairs.set(`${entry._id}|${tagId}`, {entryId: entry._id, tagId});
      }
    }
  }

  // D1 remote execute rejects BEGIN/COMMIT/SAVEPOINT — wrangler batches statements.
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
        user_id = excluded.user_id,
        user_name = excluded.user_name,
        user_email = excluded.user_email,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        duration_seconds = excluded.duration_seconds,
        time_zone = excluded.time_zone,
        project_id = excluded.project_id,
        billable = excluded.billable,
        currency = excluded.currency,
        rate = excluded.rate,
        amount = excluded.amount,
        earned_amount = excluded.earned_amount,
        source = excluded.source,
        updated_at = excluded.updated_at;`
    );
  }

  for (const pair of entryTagPairs.values()) {
    lines.push(
      `INSERT OR IGNORE INTO time_entry_tags (time_entry_id, tag_id)
       VALUES (${sqlString(pair.entryId)}, ${sqlString(pair.tagId)});`
    );
  }

  return lines.join('\n');
};

const runSqlFile = (filePath: string, flag: '--local' | '--remote') => {
  const wranglerPkg = process.env.WRANGLER_PKG || 'wrangler';
  execFileSync(
    'npx',
    ['-y', wranglerPkg, 'd1', 'execute', 'arzi-time-db', flag, `--file=${filePath}`, '-y'],
    {stdio: 'inherit', cwd: ROOT}
  );
};

const argValue = (argv: string[], name: string): string | undefined => {
  const prefix = `${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

const main = () => {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const sqlOnly = args.has('--sql-only');
  const remote = args.has('--remote');
  const reset = args.has('--reset');
  const flag = remote ? '--remote' : '--local';
  const projectIdFilter = argValue(argv, '--project-id');
  const projectNameFilter = argValue(argv, '--project-name');

  const loaded = loadEntries();
  let {entries} = loaded;
  const {rawCount, duplicateIdSkips, files} = loaded;

  console.error(`Files: ${files.join(', ')}`);
  console.error(
    `Clockify rows: raw=${rawCount}, unique_by_id=${entries.length}, skipped_duplicate_ids=${duplicateIdSkips}`
  );

  if (projectIdFilter || projectNameFilter) {
    const before = entries.length;
    entries = entries.filter((entry) => {
      if (projectIdFilter && entry.projectId === projectIdFilter) return true;
      if (
        projectNameFilter &&
        (entry.projectName || '').toLowerCase() === projectNameFilter.toLowerCase()
      ) {
        return true;
      }
      return false;
    });
    console.error(
      `Project filter: id=${projectIdFilter ?? '-'} name=${projectNameFilter ?? '-'} → ${entries.length}/${before} entries`
    );
  }

  const hours = entries.reduce(
    (sum, e) => sum + Math.max(0, e.timeInterval.duration || 0) / 3600,
    0
  );
  console.error(`Importing ${entries.length} entries (~${hours.toFixed(2)} hours)`);

  const sql = buildSql(entries);

  if (sqlOnly) {
    if (reset) process.stdout.write(`${buildResetSql()}\n`);
    process.stdout.write(sql);
    return;
  }

  const outDir = path.join(ROOT, '.wrangler');
  fs.mkdirSync(outDir, {recursive: true});

  if (reset) {
    const resetFile = path.join(outDir, 'reset-clockify.sql');
    fs.writeFileSync(resetFile, buildResetSql(), 'utf8');
    console.error(`Resetting tables via wrangler d1 execute ${flag} ...`);
    runSqlFile(resetFile, flag);
  }

  const outFile = path.join(outDir, 'import-clockify.sql');
  fs.writeFileSync(outFile, sql, 'utf8');

  const wranglerPkg = process.env.WRANGLER_PKG || 'wrangler';
  console.error(`Applying unique import via ${wranglerPkg} d1 execute ${flag} ...`);
  runSqlFile(outFile, flag);
  console.error(
    `Import complete (${entries.length} unique time_entries by Clockify _id).`
  );
};

main();
