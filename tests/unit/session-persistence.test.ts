import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { SessionRepository } from '../../src/main/services/db/repository'
import { getStorageDir } from '../../src/main/services/db/database'
import type { Session } from '../../src/shared/types'
import { DEFAULT_AGENT_DELAYS_CONFIG, DEFAULT_CUSTOM_TOOLS_CONFIG } from '../../src/shared/types'

describe('Session Persistence and Defaults', () => {
  const storageDir = getStorageDir()
  const sessionsFile = path.join(storageDir, 'sessions.json')
  const defaultsFile = path.join(storageDir, 'session-defaults.json')

  let backupSessions: string | null = null
  let backupDefaults: string | null = null

  beforeEach(() => {
    if (fs.existsSync(sessionsFile)) {
      backupSessions = fs.readFileSync(sessionsFile, 'utf-8')
    }
    if (fs.existsSync(defaultsFile)) {
      backupDefaults = fs.readFileSync(defaultsFile, 'utf-8')
    }
  })

  afterEach(() => {
    if (backupSessions !== null) {
      fs.writeFileSync(sessionsFile, backupSessions, 'utf-8')
    } else if (fs.existsSync(sessionsFile)) {
      fs.unlinkSync(sessionsFile)
    }

    if (backupDefaults !== null) {
      fs.writeFileSync(defaultsFile, backupDefaults, 'utf-8')
    } else if (fs.existsSync(defaultsFile)) {
      fs.unlinkSync(defaultsFile)
    }
  })

  it('retrieves default session settings when no custom defaults are saved', () => {
    if (fs.existsSync(defaultsFile)) fs.unlinkSync(defaultsFile)

    const defaults = SessionRepository.getSessionDefaults()
    expect(defaults.autoApprove).toBe(false)
    expect(defaults.delays.cooldownTimerMs).toBe(DEFAULT_AGENT_DELAYS_CONFIG.cooldownTimerMs)
    expect(defaults.delays.cooldownRandomDelayMinMs).toBe(0)
    expect(defaults.delays.cooldownRandomDelayMaxMs).toBe(1000)
    expect(defaults.delays.sendRandomDelayMinMs).toBe(50)
    expect(defaults.delays.sendRandomDelayMaxMs).toBe(150)
    expect(defaults.customTools.enableRunCommand).toBe(DEFAULT_CUSTOM_TOOLS_CONFIG.enableRunCommand)
  })

  it('saves session defaults and retains them across calls', () => {
    SessionRepository.saveSessionDefaults({
      autoApprove: true,
      delays: {
        cooldownTimerMs: 5000,
        cooldownRandomDelayMinMs: 500,
        cooldownRandomDelayMaxMs: 2500,
        sendDelayMs: 2000,
        sendRandomDelayMinMs: 100,
        sendRandomDelayMaxMs: 400,
        toolExecutionDelayMs: 300,
      },
      customTools: { ...DEFAULT_CUSTOM_TOOLS_CONFIG, enableRunCommand: false },
    })

    const updated = SessionRepository.getSessionDefaults()
    expect(updated.autoApprove).toBe(true)
    expect(updated.delays.cooldownTimerMs).toBe(5000)
    expect(updated.delays.cooldownRandomDelayMinMs).toBe(500)
    expect(updated.delays.cooldownRandomDelayMaxMs).toBe(2500)
    expect(updated.delays.sendRandomDelayMinMs).toBe(100)
    expect(updated.delays.sendRandomDelayMaxMs).toBe(400)
    expect(updated.customTools.enableRunCommand).toBe(false)
  })

  it('updates all existing sessions when updateAllSessions is called', () => {
    const session1: Session = {
      id: 'sess_test_1',
      title: 'Session 1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetId: 'deepseek',
      workspacePath: '/test/path',
      autoApprove: false,
      status: 'idle',
    }
    const session2: Session = {
      id: 'sess_test_2',
      title: 'Session 2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetId: 'chatgpt',
      workspacePath: '/test/path',
      autoApprove: false,
      status: 'idle',
    }

    SessionRepository.saveSession(session1)
    SessionRepository.saveSession(session2)

    SessionRepository.updateAllSessions({
      autoApprove: true,
      delays: { cooldownTimerMs: 4000 },
    })

    const fetched1 = SessionRepository.getSessionById('sess_test_1')
    const fetched2 = SessionRepository.getSessionById('sess_test_2')

    expect(fetched1?.autoApprove).toBe(true)
    expect(fetched1?.delays?.cooldownTimerMs).toBe(4000)
    expect(fetched2?.autoApprove).toBe(true)
    expect(fetched2?.delays?.cooldownTimerMs).toBe(4000)
  })
})
