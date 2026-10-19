-- Projects (denormalized client fields for Clockify parity)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  client_id TEXT,
  client_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  user_name TEXT,
  user_email TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  time_zone TEXT NOT NULL DEFAULT 'Asia/Tehran',
  project_id TEXT REFERENCES projects(id),
  billable INTEGER NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'USD',
  rate REAL NOT NULL DEFAULT 8.12,
  amount REAL,
  earned_amount REAL,
  source TEXT NOT NULL CHECK (source IN ('clockify_import', 'timer', 'manual')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_time_entries_start_at ON time_entries(start_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_source ON time_entries(source);
CREATE INDEX IF NOT EXISTS idx_time_entries_start_id ON time_entries(start_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS time_entry_tags (
  time_entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (time_entry_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_time_entry_tags_tag ON time_entry_tags(tag_id);

-- At most one active timer per user
CREATE TABLE IF NOT EXISTS active_timers (
  user_id TEXT PRIMARY KEY NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  project_id TEXT REFERENCES projects(id),
  rate REAL NOT NULL DEFAULT 8.12,
  started_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
