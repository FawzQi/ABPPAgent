import type { ToolCall, CustomToolsConfig } from '@shared/types'
import { DEFAULT_CUSTOM_TOOLS_CONFIG } from '@shared/types'

export interface PermissionCheckResult {
  requiresApproval: boolean
  isDangerous: boolean
  isDisabled?: boolean
  reason?: string
}

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\s+-[rf]{1,2}\s+(\/|~|\$HOME|\.\.)/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\b:(){:|:&};:\b/, // fork bomb
  /\bgit\s+reset\s+--hard\b/i,
]

export class PermissionGateway {
  /**
   * Check if a tool call requires user confirmation before execution or if it's disabled.
   */
  static evaluate(
    toolCall: ToolCall,
    autoApproveMode: boolean = false,
    customTools: CustomToolsConfig = DEFAULT_CUSTOM_TOOLS_CONFIG
  ): PermissionCheckResult {
    const { name, arguments: args } = toolCall

    // 1. Tool enablement checks
    if (name === 'run_command' && !customTools.enableRunCommand) {
      return { requiresApproval: false, isDangerous: false, isDisabled: true, reason: 'Terminal command execution is disabled.' }
    }
    if ((name === 'write_file' || name === 'replace_file_content') && !customTools.enableFileMutation) {
      return { requiresApproval: false, isDangerous: false, isDisabled: true, reason: 'File mutation tools are disabled.' }
    }
    if ((name === 'read_file_full' || name === 'copy_file_to_chat') && !customTools.enableFullFile) {
      return { requiresApproval: false, isDangerous: false, isDisabled: true, reason: 'Full file inspection tools are disabled.' }
    }
    if ((name === 'gitnexus_query' || name === 'gitnexus_context') && !customTools.enableGitnexus) {
      return { requiresApproval: false, isDangerous: false, isDisabled: true, reason: 'GitNexus tools are disabled.' }
    }
    if (name === 'grep_search' && !customTools.enableGrep) {
      return { requiresApproval: false, isDangerous: false, isDisabled: true, reason: 'Grep search tool is disabled.' }
    }

    // 2. Safe read-only operations
    if (
      name === 'read_file' ||
      name === 'read_file_full' ||
      name === 'copy_file_to_chat' ||
      name === 'list_directory' ||
      name === 'gitnexus_query' ||
      name === 'gitnexus_context' ||
      name === 'grep_search'
    ) {
      return { requiresApproval: false, isDangerous: false }
    }

    // 3. Interactive user inputs
    if (name === 'ask_user') {
      return { requiresApproval: false, isDangerous: false }
    }

    // 4. Command execution checks
    if (name === 'run_command') {
      const command = (args.CommandLine || '').trim()
      const isDangerous = DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command))

      if (isDangerous) {
        return {
          requiresApproval: true,
          isDangerous: true,
          reason: 'Command matches potentially catastrophic pattern and must be confirmed.',
        }
      }

      if (autoApproveMode) {
        return { requiresApproval: false, isDangerous: false }
      }

      return {
        requiresApproval: true,
        isDangerous: false,
        reason: 'Shell commands require approval by default in interactive mode.',
      }
    }

    // 5. File mutation operations
    if (name === 'write_file' || name === 'replace_file_content') {
      if (autoApproveMode) {
        return { requiresApproval: false, isDangerous: false }
      }
      return {
        requiresApproval: true,
        isDangerous: false,
        reason: 'File modifications require approval before applying to disk.',
      }
    }

    // Default: require confirmation for unknown tools
    return {
      requiresApproval: !autoApproveMode,
      isDangerous: false,
      reason: `Tool '${name}' requires approval.`,
    }
  }
}
