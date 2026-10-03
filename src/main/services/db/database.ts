import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import Database, { type Database as DatabaseType } from 'better-sqlite3'

let dbInstance: DatabaseType | null = null

export function getDatabase(): DatabaseType {
  if (dbInstance) return dbInstance

  let dbDir: string
  try {
    dbDir = app ? app.getPath('userData') : path.join(process.cwd(), '.agent-data')
  } catch {
    dbDir = path.join(process.cwd(), '.agent-data')
  }

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = path.join(dbDir, 'agent-sessions.sqlite')
  dbInstance = new Database(dbPath)
  dbInstance.pragma('journal_mode = WAL')

  initSchema(dbInstance)
  return dbInstance
}

function initSchema(db: DatabaseType) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      target_id TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      auto_approve INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'idle'
    );

    CREATE TABLE IF NOT EXISTS timeline_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      data_json TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_session ON timeline_items(session_id, timestamp);

    CREATE TABLE IF NOT EXISTS modified_files (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      status TEXT NOT NULL,
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      old_content TEXT,
      new_content TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_modified_session ON modified_files(session_id);
  `)
}
