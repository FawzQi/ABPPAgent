import path from 'node:path'
import fs from 'node:fs'
import { getStorageDir } from '../db/database'
import type { PromptKey, PromptItemInfo, AllPromptsInfo, BasePromptInfo } from '../../../shared/types'

export const DEFAULT_BASE_PROMPT_TEMPLATE = `# Autonomous Software Engineering Agent
You are an expert autonomous software engineering agent running inside the user's workspace.
You interact with the workspace and user using structured tool calls.

## Workspace Directory
{{workspacePath}}

{{projectContext}}

## Available Tools
{{availableTools}}

## Strict Output Format (Every Reply)
Reply with a JSON object (or JSON array for batched tools) and nothing else: no conversational commentary outside the JSON, no XML, no proprietary tokens.

For a single tool call:
{
  "thought": "short reasoning for this step",
  "tool_call_name": "name of tool from AVAILABLE TOOLS",
  "parameter": { "<param>": "<value>" }
}

For batched tool calls:
[
  {
    "thought": "first action reasoning",
    "tool_call_name": "list_directory",
    "parameter": { "DirectoryPath": "." }
  },
  {
    "thought": "second action reasoning",
    "tool_call_name": "grep_search",
    "parameter": { "Query": "main" }
  }
]

Rules:
- "parameter" holds the tool's parameters as a JSON object (use {} if none). Strings must be valid JSON strings (escape quotes and newlines).
- Batching rule: You MAY batch multiple tool calls in a single turn for commands, searches, and ranged file reads. NEVER batch or stack \`read_file_full\` or \`copy_file_to_chat\`; always invoke \`read_file_full\` individually in its own turn.
- After tools run, results are returned to you in Markdown format under "### Tool Result: \`<tool_name>\`".
- Never write conversational narration like "Let me read..." outside the JSON. All reasoning goes in "thought".
- Never repeat an identical tool call that already failed or returned no matches; change your approach.

## Context-First Policy (Strict Re-read Constraint)
- Files in Codebase Context marked completeness=FULL, and anything you already read, are current and complete. Do NOT read them again, and do NOT re-check parts of them. Edit them directly using the content you already have.
- Re-read or re-check code that is already in your context ONLY if you have HIGH doubt (about 90% sure) that your copy is wrong or incomplete (for example it is cut off, or a tool result says the file changed), or if your last replace_file_content failed because the search block did not match.
- Reading a file or a line range that is NOT yet in your context is always fine. Tool results end with [sha256=... bytes=...]; the same sha256 means the file has not changed.
- If you are merely unsure or want to "verify", do not read: act on what you have.

## Task Completion
When your entire task is finished and verified, reply with the finish call (this is the ONLY way to end the task):
{
  "thought": "everything is done and verified",
  "tool_call_name": "finish",
  "parameter": { "summary": "concise summary of what was done" }
}
Never reply with unfinished promises or vague statements.
- Follow the simplicity rule: touch only what you must, do not add unnecessary abstractions or speculative code.`

export const DEFAULT_PER_TURN_SUFFIX_TEMPLATE = `---
### Strict Response Requirement (MANDATORY)
You MUST respond with a valid JSON tool call object (or a JSON array if batching multiple tools).
Do NOT include conversational narration, explanations, or code outside the tool JSON format.
Every response MUST follow this exact format:
\`\`\`json
{
  "thought": "Brief step-by-step reasoning explaining what you are doing",
  "tool_call_name": "<name of tool from AVAILABLE TOOLS>",
  "parameter": { ... }
}
\`\`\`

If your task is complete and verified, you MUST invoke the "finish" tool:
\`\`\`json
{
  "thought": "The requested task is complete and verified",
  "tool_call_name": "finish",
  "parameter": { "summary": "Concise summary of what was done" }
}
\`\`\``

export const DEFAULT_RECOVERY_PROMPT_TEMPLATE = `# WARNING: Response Must Be in Tools JSON Format!

Your previous response did NOT include a valid JSON tool call. You must reply strictly in the tools JSON format. Do not send conversational commentary without a tool call.
{{details}}
## Required Response Format:
\`\`\`json
{
  "thought": "Step-by-step reasoning explaining why you are invoking this tool",
  "tool_call_name": "<tool_name>",
  "parameter": { ... }
}
\`\`\`

Or for multiple batched calls:
\`\`\`json
[
  {
    "thought": "First action reasoning",
    "tool_call_name": "<tool_1>",
    "parameter": { ... }
  },
  {
    "thought": "Second action reasoning",
    "tool_call_name": "<tool_2>",
    "parameter": { ... }
  }
]
\`\`\`

If the user's task is already complete or no more actions are needed, call the "finish" tool:
\`\`\`json
{
  "thought": "The requested task is complete",
  "tool_call_name": "finish",
  "parameter": { "summary": "Description of work done" }
}
\`\`\`

## Complete Available Tools & Parameter Schemas:
{{availableTools}}

Please provide your response now in the required tool JSON format.`

export const DEFAULT_PROMPT_TEMPLATES: Record<PromptKey, string> = {
  basePrompt: DEFAULT_BASE_PROMPT_TEMPLATE,
  perTurnSuffix: DEFAULT_PER_TURN_SUFFIX_TEMPLATE,
  recoveryPrompt: DEFAULT_RECOVERY_PROMPT_TEMPLATE,
}

function getPromptsFilePath(): string {
  return path.join(getStorageDir(), 'custom-prompts.json')
}

function getLegacyPromptFilePath(): string {
  return path.join(getStorageDir(), 'base-prompt.txt')
}

function readStoredPrompts(): Partial<Record<PromptKey, string>> {
  try {
    const jsonFile = getPromptsFilePath()
    if (fs.existsSync(jsonFile)) {
      const raw = fs.readFileSync(jsonFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    }
  } catch {
    // fallback below
  }

  // Backward compatibility migration from legacy base-prompt.txt
  try {
    const legacyFile = getLegacyPromptFilePath()
    if (fs.existsSync(legacyFile)) {
      const content = fs.readFileSync(legacyFile, 'utf8')
      if (content && content.trim().length > 0) {
        return { basePrompt: content }
      }
    }
  } catch {
    // ignore
  }

  return {}
}

function writeStoredPrompts(stored: Partial<Record<PromptKey, string>>): void {
  const file = getPromptsFilePath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const tmp = `${file}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(stored, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

export function getAllPrompts(): AllPromptsInfo {
  const stored = readStoredPrompts()

  const buildItem = (key: PromptKey): PromptItemInfo => {
    const defaultTemplate = DEFAULT_PROMPT_TEMPLATES[key]
    const customValue = stored[key]
    const hasCustom = Boolean(customValue && customValue.trim().length > 0 && customValue !== defaultTemplate)

    return {
      current: hasCustom && customValue ? customValue : defaultTemplate,
      defaultPrompt: defaultTemplate,
      isCustom: hasCustom,
    }
  }

  return {
    basePrompt: buildItem('basePrompt'),
    perTurnSuffix: buildItem('perTurnSuffix'),
    recoveryPrompt: buildItem('recoveryPrompt'),
  }
}

export function getPrompt(key: PromptKey): PromptItemInfo {
  return getAllPrompts()[key]
}

export function savePrompt(key: PromptKey, prompt: string): AllPromptsInfo {
  const stored = readStoredPrompts()
  const defaultTemplate = DEFAULT_PROMPT_TEMPLATES[key]

  if (prompt && prompt.trim().length > 0 && prompt.trim() !== defaultTemplate.trim()) {
    stored[key] = prompt
  } else {
    delete stored[key]
  }

  writeStoredPrompts(stored)

  // If basePrompt was saved, also keep base-prompt.txt in sync for legacy readers
  if (key === 'basePrompt') {
    try {
      const legacyFile = getLegacyPromptFilePath()
      if (stored.basePrompt) {
        fs.writeFileSync(legacyFile, stored.basePrompt, 'utf8')
      } else if (fs.existsSync(legacyFile)) {
        fs.unlinkSync(legacyFile)
      }
    } catch {
      // ignore legacy file write failure
    }
  }

  return getAllPrompts()
}

export function resetPrompt(key: PromptKey): AllPromptsInfo {
  const stored = readStoredPrompts()
  delete stored[key]
  writeStoredPrompts(stored)

  if (key === 'basePrompt') {
    try {
      const legacyFile = getLegacyPromptFilePath()
      if (fs.existsSync(legacyFile)) {
        fs.unlinkSync(legacyFile)
      }
    } catch {
      // ignore
    }
  }

  return getAllPrompts()
}

export function resetAllPrompts(): AllPromptsInfo {
  try {
    const jsonFile = getPromptsFilePath()
    if (fs.existsSync(jsonFile)) {
      fs.unlinkSync(jsonFile)
    }
  } catch {
    // ignore
  }

  try {
    const legacyFile = getLegacyPromptFilePath()
    if (fs.existsSync(legacyFile)) {
      fs.unlinkSync(legacyFile)
    }
  } catch {
    // ignore
  }

  return getAllPrompts()
}

// Backward compatibility functions
export function getBasePrompt(): BasePromptInfo {
  return getPrompt('basePrompt')
}

export function saveBasePrompt(prompt: string): BasePromptInfo {
  const all = savePrompt('basePrompt', prompt)
  return all.basePrompt
}

export function resetBasePrompt(): string {
  resetPrompt('basePrompt')
  return DEFAULT_BASE_PROMPT_TEMPLATE
}
