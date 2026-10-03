import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

let storageDir: string | null = null

export function getStorageDir(): string {
  if (storageDir) return storageDir

  try {
    storageDir = app ? path.join(app.getPath('userData'), 'agent_data') : path.join(process.cwd(), '.agent-data')
  } catch {
    storageDir = path.join(process.cwd(), '.agent-data')
  }

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true })
  }

  return storageDir
}

/**
 * Write file atomically via temporary file and rename to prevent corrupted writes.
 */
export function writeJsonAtomic(filePath: string, data: any): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

export function readJsonSafe<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) return defaultValue
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return defaultValue
  }
}
