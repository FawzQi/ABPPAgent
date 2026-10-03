import type { Session, TimelineItem, WorkspaceFileChange } from '@shared/types'
import { getDatabase } from './database'

export class SessionRepository {
  static getSessions(): Session[] {
    const db = getDatabase()
    const rows = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as any[]
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      targetId: r.target_id,
      workspacePath: r.workspace_path,
      autoApprove: Boolean(r.auto_approve),
      status: r.status,
    }))
  }

  static getSessionById(id: string): Session | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
    if (!row) return null
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      targetId: row.target_id,
      workspacePath: row.workspace_path,
      autoApprove: Boolean(row.auto_approve),
      status: row.status,
    }
  }

  static saveSession(session: Session): void {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO sessions (id, title, created_at, updated_at, target_id, workspace_path, auto_approve, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at,
        target_id = excluded.target_id,
        workspace_path = excluded.workspace_path,
        auto_approve = excluded.auto_approve,
        status = excluded.status
    `).run(
      session.id,
      session.title,
      session.createdAt,
      session.updatedAt,
      session.targetId,
      session.workspacePath,
      session.autoApprove ? 1 : 0,
      session.status,
    )
  }

  static deleteSession(id: string): boolean {
    const db = getDatabase()
    const res = db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    return res.changes > 0
  }

  static getTimeline(sessionId: string): TimelineItem[] {
    const db = getDatabase()
    const rows = db.prepare('SELECT * FROM timeline_items WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId) as any[]
    return rows.map((r) => {
      const extra = r.data_json ? JSON.parse(r.data_json) : {}
      return {
        id: r.id,
        sessionId: r.session_id,
        role: r.role,
        content: r.content,
        timestamp: r.timestamp,
        ...extra,
      }
    })
  }

  static saveTimelineItem(item: TimelineItem): void {
    const db = getDatabase()
    const { id, sessionId, role, content, timestamp, ...extra } = item
    const dataJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null

    db.prepare(`
      INSERT INTO timeline_items (id, session_id, role, content, data_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        data_json = excluded.data_json
    `).run(id, sessionId, role, content ?? null, dataJson, timestamp)
  }

  static getModifiedFiles(sessionId: string): WorkspaceFileChange[] {
    const db = getDatabase()
    const rows = db.prepare('SELECT * FROM modified_files WHERE session_id = ? ORDER BY updated_at DESC').all(sessionId) as any[]
    return rows.map((r) => ({
      path: r.file_path,
      status: r.status,
      additions: r.additions,
      deletions: r.deletions,
      oldContent: r.old_content ?? undefined,
      newContent: r.new_content ?? undefined,
    }))
  }

  static recordModifiedFile(sessionId: string, change: WorkspaceFileChange): void {
    const db = getDatabase()
    const id = `${sessionId}_${change.path}`
    db.prepare(`
      INSERT INTO modified_files (id, session_id, file_path, status, additions, deletions, old_content, new_content, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        additions = excluded.additions,
        deletions = excluded.deletions,
        old_content = excluded.old_content,
        new_content = excluded.new_content,
        updated_at = excluded.updated_at
    `).run(
      id,
      sessionId,
      change.path,
      change.status,
      change.additions,
      change.deletions,
      change.oldContent ?? null,
      change.newContent ?? null,
      Date.now(),
    )
  }
}
