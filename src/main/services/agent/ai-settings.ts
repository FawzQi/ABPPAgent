import { safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type {
  AiProviderId,
  ChatProviderId,
  FileSuggestionSettings,
  FileSuggestionSettingsSaveRequest,
} from '@shared/types'
import { DEFAULT_FILE_SUGGESTION_SETTINGS } from '@shared/types'
import { getStorageDir, writeJsonAtomic, readJsonSafe } from '../db/database'

interface StoredAiSettings {
  enabled: boolean
  method: FileSuggestionSettings['method']
  provider: AiProviderId
  modelByProvider: Partial<Record<AiProviderId, string>>
  encryptedKeys: Partial<Record<AiProviderId, string>>
  enableHyde: boolean
  hydeProvider: ChatProviderId
  hydeModel: string
}

function getSettingsFile(): string {
  return path.join(getStorageDir(), 'ai-settings.json')
}

function readStored(): StoredAiSettings {
  const filePath = getSettingsFile()
  return readJsonSafe<StoredAiSettings>(filePath, {
    enabled: DEFAULT_FILE_SUGGESTION_SETTINGS.enabled,
    method: DEFAULT_FILE_SUGGESTION_SETTINGS.method,
    provider: DEFAULT_FILE_SUGGESTION_SETTINGS.provider,
    modelByProvider: { ...DEFAULT_FILE_SUGGESTION_SETTINGS.modelByProvider },
    encryptedKeys: {},
    enableHyde: DEFAULT_FILE_SUGGESTION_SETTINGS.enableHyde,
    hydeProvider: DEFAULT_FILE_SUGGESTION_SETTINGS.hydeProvider,
    hydeModel: DEFAULT_FILE_SUGGESTION_SETTINGS.hydeModel,
  })
}

function encryptKey(plain: string): string {
  if (!plain) return ''
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plain).toString('base64')
    }
  } catch {}
  return Buffer.from(plain, 'utf8').toString('base64')
}

function decryptKey(cipher: string): string {
  if (!cipher) return ''
  try {
    const buf = Buffer.from(cipher, 'base64')
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf)
    }
    return buf.toString('utf8')
  } catch {
    try {
      return Buffer.from(cipher, 'base64').toString('utf8')
    } catch {
      return ''
    }
  }
}

export async function getFileSuggestionSettings(): Promise<FileSuggestionSettings> {
  const stored = readStored()
  const hasApiKey: Partial<Record<AiProviderId, boolean>> = {}
  for (const [prov, key] of Object.entries(stored.encryptedKeys)) {
    if (key && typeof key === 'string' && key.trim().length > 0) {
      hasApiKey[prov as AiProviderId] = true
    }
  }

  return {
    enabled: stored.enabled ?? DEFAULT_FILE_SUGGESTION_SETTINGS.enabled,
    method: stored.method ?? DEFAULT_FILE_SUGGESTION_SETTINGS.method,
    provider: stored.provider ?? DEFAULT_FILE_SUGGESTION_SETTINGS.provider,
    modelByProvider: { ...DEFAULT_FILE_SUGGESTION_SETTINGS.modelByProvider, ...stored.modelByProvider },
    hasApiKey,
    enableHyde: stored.enableHyde ?? DEFAULT_FILE_SUGGESTION_SETTINGS.enableHyde,
    hydeProvider: stored.hydeProvider ?? DEFAULT_FILE_SUGGESTION_SETTINGS.hydeProvider,
    hydeModel: stored.hydeModel ?? DEFAULT_FILE_SUGGESTION_SETTINGS.hydeModel,
  }
}

export async function saveFileSuggestionSettings(
  request: FileSuggestionSettingsSaveRequest,
): Promise<FileSuggestionSettings> {
  const stored = readStored()

  if (typeof request.enabled === 'boolean') {
    stored.enabled = request.enabled
  }
  if (request.method) {
    stored.method = request.method
  }
  if (request.provider) {
    stored.provider = request.provider
  }
  if (request.model) {
    stored.modelByProvider[request.model.provider] = request.model.model
  }
  if (request.apiKey) {
    const { provider, key } = request.apiKey
    if (key.trim().length === 0) {
      delete stored.encryptedKeys[provider]
    } else {
      stored.encryptedKeys[provider] = encryptKey(key.trim())
    }
  }
  if (typeof request.enableHyde === 'boolean') {
    stored.enableHyde = request.enableHyde
  }
  if (request.hydeProvider) {
    stored.hydeProvider = request.hydeProvider
  }
  if (request.hydeModel) {
    stored.hydeModel = request.hydeModel
  }

  writeJsonAtomic(getSettingsFile(), stored)
  return getFileSuggestionSettings()
}

export async function getApiKey(provider: AiProviderId): Promise<string | null> {
  const stored = readStored()
  const cipher = stored.encryptedKeys[provider]
  if (!cipher) return null
  const plain = decryptKey(cipher)
  return plain.trim().length > 0 ? plain.trim() : null
}
