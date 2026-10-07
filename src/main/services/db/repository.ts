import path from 'node:path'
import fs from 'node:fs'
import type { Session, TimelineItem, WorkspaceFileChange, AgentDelaysConfig, CustomToolsConfig } from '@shared/types'
import { DEFAULT_AGENT_DELAYS_CONFIG, DEFAULT_CUSTOM_TOOLS_CONFIG } from '@shared/types'
import { getStorageDir, readJsonSafe, writeJsonAtomic } from './database'

export interface SessionDefaults {
  autoApprove: boolean
  delays: AgentDelaysConfig
  customTools: CustomToolsConfig
}

export class SessionRepository {
  private static getSessionsFilePath(): string {
    return path.join(getStorageDir(), 'sessions.json')
  }

  private static getSessionDefaultsFilePath(): string {
    return path.join(getStorageDir(), 'session-defaults.json')
  }

  static getSessionDefaults(): SessionDefaults {
    return readJsonSafe<SessionDefaults>(this.getSessionDefaultsFilePath(), {
      autoApprove: false,
      delays: { ...DEFAULT_AGENT_DELAYS_CONFIG },
      customTools: { ...DEFAULT_CUSTOM_TOOLS_CONFIG },
    })
  }

  static saveSessionDefaults(defaults: Partial<SessionDefaults>): SessionDefaults {
    const current = this.getSessionDefaults()
    const updated: SessionDefaults = {
      autoApprove: defaults.autoApprove !== undefined ? defaults.autoApprove : current.autoApprove,
      delays: defaults.delays ? { ...current.delays, ...defaults.delays } : current.delays,
      customTools: defaults.customTools ? { ...current.customTools, ...defaults.customTools } : current.customTools,
    }
    writeJsonAtomic(this.getSessionDefaultsFilePath(), updated)
    return updated
  }

  static updateAllSessions(updates: Partial<Session>): void {
    const list = this.getSessions()
    if (list.length === 0) return
    const updatedList = list.map((session) => ({
      ...session,
      ...updates,
      updatedAt: Date.now(),
    }))
    writeJsonAtomic(this.getSessionsFilePath(), updatedList)
  }

  private static getTimelineFilePath(sessionId: string): string {
    return path.join(getStorageDir(), `timeline_${sessionId}.json`)
  }

  private static getModifiedFilesPath(sessionId: string): string {
    return path.join(getStorageDir(), `modified_${sessionId}.json`)
  }

  static getSessions(): Session[] {
    const list = readJsonSafe<Session[]>(this.getSessionsFilePath(), [])
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  static getSessionById(id: string): Session | null {
    const list = this.getSessions()
    return list.find((s) => s.id === id) ?? null
  }

  static saveSession(session: Session): void {
    const list = this.getSessions()
    const index = list.findIndex((s) => s.id === session.id)
    if (index >= 0) {
      list[index] = session
    } else {
      list.unshift(session)
    }
    writeJsonAtomic(this.getSessionsFilePath(), list)
  }

  static deleteSession(id: string): boolean {
    const list = this.getSessions()
    const filtered = list.filter((s) => s.id !== id)
    writeJsonAtomic(this.getSessionsFilePath(), filtered)

    try {
      const tl = this.getTimelineFilePath(id)
      if (fs.existsSync(tl)) fs.unlinkSync(tl)
      const mf = this.getModifiedFilesPath(id)
      if (fs.existsSync(mf)) fs.unlinkSync(mf)
    } catch {
      // ignore unlink error
    }

    return filtered.length < list.length
  }

  static getTimeline(sessionId: string): TimelineItem[] {
    const list = readJsonSafe<TimelineItem[]>(this.getTimelineFilePath(sessionId), [])
    return list.sort((a, b) => a.timestamp - b.timestamp)
  }

  static saveTimelineItem(item: TimelineItem): void {
    const list = this.getTimeline(item.sessionId)
    const index = list.findIndex((t) => t.id === item.id)
    if (index >= 0) {
      list[index] = item
    } else {
      list.push(item)
    }
    writeJsonAtomic(this.getTimelineFilePath(item.sessionId), list)
  }

  static getModifiedFiles(sessionId: string): WorkspaceFileChange[] {
    return readJsonSafe<WorkspaceFileChange[]>(this.getModifiedFilesPath(sessionId), [])
  }

  static recordModifiedFile(sessionId: string, change: WorkspaceFileChange): void {
    const list = this.getModifiedFiles(sessionId)
    const index = list.findIndex((f) => f.path === change.path)
    if (index >= 0) {
      list[index] = change
    } else {
      list.push(change)
    }
    writeJsonAtomic(this.getModifiedFilesPath(sessionId), list)
  }
}
