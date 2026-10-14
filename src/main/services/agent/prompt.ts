import type { CustomToolsConfig } from '@shared/types'
import { DEFAULT_CUSTOM_TOOLS_CONFIG } from '@shared/types'
import {
  DEFAULT_BASE_PROMPT_TEMPLATE,
  DEFAULT_PER_TURN_SUFFIX_TEMPLATE,
  DEFAULT_RECOVERY_PROMPT_TEMPLATE,
} from './base-prompt'

export function getAvailableToolsList(
  customTools: CustomToolsConfig = DEFAULT_CUSTOM_TOOLS_CONFIG,
): string[] {
  const tools: string[] = []
  let toolIndex = 1

  // 1. Terminal Command
  if (customTools.enableRunCommand) {
    tools.push(`${toolIndex++}. run_command
Executes a terminal command in the workspace shell.
Parameters:
{
  "CommandLine": string, // command to execute
  "Cwd"?: string // optional working directory relative or absolute
}`)
  }

  // 2. Read File (Paginated)
  tools.push(`${toolIndex++}. read_file
Reads file contents with 1-indexed line numbers.
Parameters:
{
  "AbsolutePath": string, // path to file
  "StartLine"?: number, // 1-indexed starting line
  "EndLine"?: number // 1-indexed ending line
}`)

  // 3. Whole-file tools
  if (customTools.enableFullFile) {
    tools.push(`${toolIndex++}. read_file_full
Reads an entire file without pagination or line numbers. Useful for reading complete small/medium files.
Parameters:
{
  "AbsolutePath": string // path to file
}`)

    tools.push(`${toolIndex++}. copy_file_to_chat
Copies an entire file to the conversation context and clipboard so you and the user can see and work with the full unabridged file.
Parameters:
{
  "AbsolutePath": string // path to file
}`)
  }

  // 4. File Mutation tools
  if (customTools.enableFileMutation) {
    tools.push(`${toolIndex++}. write_file
Writes full content to a file (creates parent directories automatically).
Parameters:
{
  "TargetFile": string, // path to file
  "CodeContent": string, // complete file content
  "Overwrite"?: boolean // default true
}`)

    tools.push(`${toolIndex++}. replace_file_content
Surgically replaces a specific block of text in an existing file.
Parameters:
{
  "TargetFile": string, // path to file
  "TargetContent": string, // exact lines of code to replace
  "ReplacementContent": string // new replacement lines of code
}`)
  }

  // 5. List Directory (Always available)
  tools.push(`${toolIndex++}. list_directory
Lists files and directories respecting .gitignore.
Parameters:
{
  "DirectoryPath"?: string, // optional path to directory (defaults to workspace root)
  "Recursive"?: boolean, // default false
  "Depth"?: number // max depth when recursive
}`)

  // 6. Ask User (Always available)
  tools.push(`${toolIndex++}. ask_user
Asks the user a clarifying question or offers multiple choices when stuck or requiring architectural decisions.
Parameters:
{
  "Question": string,
  "Options"?: string[] // optional array of choice buttons
}`)

  // 7. GitNexus CLI tools
  if (customTools.enableGitnexus) {
    tools.push(`${toolIndex++}. gitnexus_query
Performs semantic/symbol search using gitnexus indexing over the repository code graph.
Parameters:
{
  "Query": string // Search phrase, symbol name, or query
}`)

    tools.push(`${toolIndex++}. gitnexus_context
Retrieves code context and symbol relationships using gitnexus for a specific file or symbol.
Parameters:
{
  "Target": string // Symbol name or relative file path
}`)
  }

  // 8. Grep Search tool
  if (customTools.enableGrep) {
    tools.push(`${toolIndex++}. grep_search
Runs fast regex search (grep -rnE) across the repository or a specified subfolder.
Parameters:
{
  "Query": string, // Regular expression or search string
  "Path"?: string // Optional relative subfolder or file to search in (defaults to workspace root)
}`)
  }

  // 9. Finish tool
  tools.push(`${toolIndex++}. finish
Declares the engineering task complete and verified. This is the ONLY way to complete a task.
Parameters:
{
  "summary"?: string // concise summary of what was implemented and verified
}`)

  return tools
}

export function formatAvailableTools(
  customTools: CustomToolsConfig = DEFAULT_CUSTOM_TOOLS_CONFIG,
): string {
  return getAvailableToolsList(customTools).join('\n\n')
}

export function appendToolJsonFormatRule(prompt: string, customSuffix?: string): string {
  const suffix = customSuffix && customSuffix.trim().length > 0 ? customSuffix : DEFAULT_PER_TURN_SUFFIX_TEMPLATE
  const RULE_HEADER = '### Strict Response Requirement (MANDATORY)'

  if (suffix.includes('{{prompt}}')) {
    return suffix.replaceAll('{{prompt}}', prompt.trim()).trim()
  }

  if (suffix.includes(RULE_HEADER) && prompt.includes(RULE_HEADER)) {
    return prompt
  }

  if (prompt.includes(suffix.trim())) {
    return prompt
  }

  return `${prompt.trim()}\n\n${suffix.trim()}`
}

export function buildToolFormatWarningPrompt(
  customTools: CustomToolsConfig = DEFAULT_CUSTOM_TOOLS_CONFIG,
  details?: string,
  customTemplate?: string,
): string {
  const toolsFormatted = formatAvailableTools(customTools)
  const template =
    customTemplate && customTemplate.trim().length > 0
      ? customTemplate
      : DEFAULT_RECOVERY_PROMPT_TEMPLATE

  let prompt = template

  const detailsFormatted = details ? `\nDetails: ${details}\n` : ''
  if (prompt.includes('{{details}}')) {
    prompt = prompt.replaceAll('{{details}}', detailsFormatted)
  } else if (details && !prompt.includes(details)) {
    prompt = `${prompt}\n\nDetails: ${details}`
  }

  if (prompt.includes('{{availableTools}}')) {
    prompt = prompt.replaceAll('{{availableTools}}', toolsFormatted)
  } else if (!prompt.includes(toolsFormatted)) {
    prompt = `${prompt}\n\n## Complete Available Tools & Parameter Schemas:\n${toolsFormatted}`
  }

  return prompt.trim()
}

export function buildSystemPrompt(
  workspacePath: string,
  projectContext?: string,
  customTools: CustomToolsConfig = DEFAULT_CUSTOM_TOOLS_CONFIG,
  customTemplate?: string,
): string {
  const toolsText = formatAvailableTools(customTools)
  const template =
    customTemplate && customTemplate.trim().length > 0
      ? customTemplate
      : DEFAULT_BASE_PROMPT_TEMPLATE

  let prompt = template
  if (prompt.includes('{{workspacePath}}')) {
    prompt = prompt.replaceAll('{{workspacePath}}', workspacePath)
  } else if (!prompt.includes(workspacePath)) {
    prompt = `${prompt}\n\n## Workspace Directory\n${workspacePath}`
  }

  if (prompt.includes('{{projectContext}}')) {
    prompt = prompt.replaceAll('{{projectContext}}', projectContext ? `${projectContext}\n` : '')
  } else if (projectContext) {
    prompt = `${prompt}\n\n${projectContext}`
  }

  if (prompt.includes('{{availableTools}}')) {
    prompt = prompt.replaceAll('{{availableTools}}', toolsText)
  } else {
    prompt = `${prompt}\n\n## Available Tools\n${toolsText}`
  }

  return prompt.trim()
}
