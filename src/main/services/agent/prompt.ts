import type { CustomToolsConfig } from '@shared/types'
import { DEFAULT_CUSTOM_TOOLS_CONFIG } from '@shared/types'

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
  "TargetFile": string,
  "StartLine": number,
  "EndLine": number,
  "TargetContent": string, // exact lines of code to replace
  "ReplacementContent": string // new replacement lines of code
}`)
  }

  // 5. List Directory (Always available)
  tools.push(`${toolIndex++}. list_directory
Lists files and directories respecting .gitignore.
Parameters:
{
  "DirectoryPath": string,
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

export function appendToolJsonFormatRule(prompt: string): string {
  const RULE_HEADER = '### Strict Response Requirement (MANDATORY)'
  if (prompt.includes(RULE_HEADER)) return prompt

  return `${prompt.trim()}

---
${RULE_HEADER}
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
\`\`\`
`
}

export function buildToolFormatWarningPrompt(
  customTools: CustomToolsConfig = DEFAULT_CUSTOM_TOOLS_CONFIG,
  details?: string,
): string {
  const toolsFormatted = formatAvailableTools(customTools)

  return `# WARNING: Response Must Be in Tools JSON Format!

Your previous response did NOT include a valid JSON tool call. You must reply strictly in the tools JSON format. Do not send conversational commentary without a tool call.
${details ? `\nDetails: ${details}\n` : ''}
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
${toolsFormatted}

Please provide your response now in the required tool JSON format.`
}

export function buildSystemPrompt(
  workspacePath: string,
  projectContext?: string,
  customTools: CustomToolsConfig = DEFAULT_CUSTOM_TOOLS_CONFIG,
): string {
  const toolsText = formatAvailableTools(customTools)

  return `# Autonomous Software Engineering Agent
You are an expert autonomous software engineering agent running inside the user's workspace.
You interact with the workspace and user using structured tool calls.

## Workspace Directory
${workspacePath}

${projectContext ? `${projectContext}\n` : ''}
## Available Tools
${toolsText}


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
}
