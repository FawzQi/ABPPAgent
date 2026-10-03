import type { CustomToolsConfig } from '@shared/types'
import { DEFAULT_CUSTOM_TOOLS_CONFIG } from '@shared/types'

export function buildSystemPrompt(
  workspacePath: string,
  projectContext?: string,
  customTools: CustomToolsConfig = DEFAULT_CUSTOM_TOOLS_CONFIG
): string {
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

  return `You are an expert autonomous software engineering agent running inside the user's workspace.
You interact with the workspace and user using structured tool calls.

WORKSPACE DIRECTORY:
${workspacePath}

${projectContext ? `PROJECT CONTEXT:\n${projectContext}\n` : ''}
AVAILABLE TOOLS:
${tools.join('\n\n')}

CRITICAL INTERACTION PROTOCOL:
1. STRICT XML FORMAT:
To execute a tool, you MUST emit an XML tag strictly in this format:
<tool_call name="tool_name">
{
  "parameter_name": "parameter_value"
}
</tool_call>
Arguments inside <tool_call> MUST be a valid JSON object.

Example turn:
<thought>
I will list files to understand the project structure.
</thought>
<tool_call name="list_directory">
{
  "DirectoryPath": "."
}
</tool_call>

2. DO NOT USE PROPRIETARY TOOL-CALLING SYNTAX:
You are interacting through a plain text chat interface. Internal model function-calling tokens or proprietary syntax cannot be executed by the local runner. Always output tool calls exclusively as raw XML \`<tool_call name="...">\` tags.

3. REPETITION & DUPLICATE CALL PREVENTION:
Never repeat the exact same tool call or search with identical parameters if it just failed, was already run, or returned no matches (such as '(No matches found)'). If a search or command yields no results, do not re-run it; try alternative terms, inspect different directories, or read the target files directly.

4. NO CONVERSATIONAL NARRATION WITHOUT TOOL CALLS:
NEVER output conversational sentences announcing what you plan to do (e.g. "Let me read...", "Now I will explore...", "I'll start by...") in free text without immediately executing the <tool_call> in the SAME turn.
All planning, exploration thoughts, and reasoning MUST be enclosed strictly inside <thought>...</thought> tags.

5. TOOL BATCHING & STACKING RULES:
* You may stack/batch multiple tool calls in a SINGLE response turn ONLY for simple CLI commands or searches that produce short, concise output (e.g. \`list_directory\`, \`grep_search\`, \`gitnexus_query\`, or non-verbose \`run_command\` status checks).
* NEVER stack/batch \`read_file_full\`, \`copy_file_to_chat\`, or large file reading commands. Stacking multiple full file reads produces massive output that overflows web-chat context limits, degrades reasoning, and causes browser freezes.
* Always read files individually, one file per turn.

6. TASK COMPLETION ONLY:
Tool outputs will be provided in subsequent turns inside <tool_result name="tool_name">...</tool_result>.
When and ONLY when your entire task is completely finished and verified, respond directly to the user with a concise summary WITHOUT any <tool_call> tags. Never reply with unfinished promises or vague statements.
- Follow the simplicity rule: touch only what you must, do not add unnecessary abstractions or speculative code.`
}
