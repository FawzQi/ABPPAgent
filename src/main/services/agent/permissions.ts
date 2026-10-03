import type { ToolCall } from '@shared/types'

export interface PermissionCheckResult {
  requiresApproval: boolean
  isDangerous: boolean
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
   * Check if a tool call requires user confirmation before execution.
   */
  static evaluate(toolCall: ToolCall, autoApproveMode: boolean = false): PermissionCheckResult {
    const { name, arguments: args } = toolCall

    // 1. Safe read-only operations
    if (name === 'read_file' || name === 'list_directory') {
      return { requiresApproval: false, isDangerous: false }
    }

    // 2. Interactive user inputs
    if (name === 'ask_user') {
      return { requiresApproval: false, isDangerous: false }
    }

    // 3. Command execution checks
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

    // 4. File mutation operations
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
