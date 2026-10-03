import fs from 'node:fs'
import path from 'node:path'
import type { DiffInfo, ToolResult } from '@shared/types'

export class FilesystemTools {
  /**
   * Read file content with optional startLine and endLine (1-indexed).
   */
  static readFile(toolCallId: string, filePath: string, startLine?: number, endLine?: number): ToolResult {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          toolCallId,
          name: 'read_file',
          output: `Error: File not found: ${filePath}`,
          isError: true,
        }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      let start = 1
      let end = lines.length

      if (startLine && startLine > 0) start = Math.min(startLine, lines.length)
      if (endLine && endLine >= start) end = Math.min(endLine, lines.length)

      const outputLines: string[] = []
      for (let i = start; i <= end; i++) {
        outputLines.push(`${i}: ${lines[i - 1]}`)
      }

      return {
        toolCallId,
        name: 'read_file',
        output: outputLines.join('\n'),
        isError: false,
      }
    } catch (err: any) {
      return {
        toolCallId,
        name: 'read_file',
        output: `Error reading file: ${err.message}`,
        isError: true,
      }
    }
  }

  /**
   * Compute additions and deletions between two strings.
   */
  static computeDiff(filePath: string, oldContent: string, newContent: string): DiffInfo {
    const oldLines = oldContent ? oldContent.split('\n') : []
    const newLines = newContent ? newContent.split('\n') : []

    let additions = 0
    let deletions = 0

    // Simple diff count: additions = max(0, newLines - oldLines)
    // For more accurate preview:
    const oldSet = new Set(oldLines)
    const newSet = new Set(newLines)

    for (const line of newLines) {
      if (!oldSet.has(line)) additions++
    }
    for (const line of oldLines) {
      if (!newSet.has(line)) deletions++
    }

    if (additions === 0 && deletions === 0 && oldContent !== newContent) {
      additions = newLines.length
      deletions = oldLines.length
    }

    return {
      filePath,
      oldContent,
      newContent,
      additions,
      deletions,
    }
  }

  /**
   * Preview a write_file action without modifying disk.
   */
  static previewWriteFile(filePath: string, newContent: string): DiffInfo {
    let oldContent = ''
    if (fs.existsSync(filePath)) {
      try {
        oldContent = fs.readFileSync(filePath, 'utf-8')
      } catch {
        // file unreadable
      }
    }
    return this.computeDiff(filePath, oldContent, newContent)
  }

  private static shadowBackups = new Map<string, string>()

  static getShadowBackup(filePath: string): string | undefined {
    return this.shadowBackups.get(filePath)
  }

  static restoreShadowBackup(filePath: string): boolean {
    const backup = this.shadowBackups.get(filePath)
    if (backup !== undefined) {
      fs.writeFileSync(filePath, backup, 'utf-8')
      return true
    }
    return false
  }

  /**
   * Apply write_file to disk with safety guardrails against catastrophic truncation.
   */
  static writeFile(toolCallId: string, filePath: string, codeContent: string, overwrite: boolean = true): ToolResult {
    try {
      if (fs.existsSync(filePath) && !overwrite) {
        return {
          toolCallId,
          name: 'write_file',
          output: `Error: File already exists and overwrite is false: ${filePath}`,
          isError: true,
        }
      }

      // Safety Guardrail: Prevent silent file corruption/truncation
      if (fs.existsSync(filePath)) {
        try {
          const stats = fs.statSync(filePath)
          // If existing file is substantial (> 400 bytes) and incoming content is suspiciously small (< 100 bytes and < 15% of existing size)
          if (stats.size > 400 && codeContent.length < 100 && codeContent.length < stats.size * 0.15) {
            return {
              toolCallId,
              name: 'write_file',
              output: `Safety Guardrail: Overwrite rejected! Target file '${filePath}' is ${stats.size} bytes, but incoming CodeContent is only ${codeContent.length} bytes (likely truncated due to unescaped quotes in JSON). The existing file was NOT modified. Please re-send your complete code or use replace_file_content.`,
              isError: true,
            }
          }

          // Save shadow backup of previous version before overwriting
          const oldContent = fs.readFileSync(filePath, 'utf-8')
          this.shadowBackups.set(filePath, oldContent)
        } catch {
          // ignore stat error
        }
      }

      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(filePath, codeContent, 'utf-8')
      return {
        toolCallId,
        name: 'write_file',
        output: `Successfully wrote ${codeContent.length} bytes to ${filePath}`,
        isError: false,
      }
    } catch (err: any) {
      return {
        toolCallId,
        name: 'write_file',
        output: `Error writing file: ${err.message}`,
        isError: true,
      }
    }
  }

  /**
   * Preview replace_file_content without modifying disk.
   */
  static previewReplaceFileContent(
    filePath: string,
    targetContent: string,
    replacementContent: string,
  ): { diff?: DiffInfo; error?: string } {
    if (!fs.existsSync(filePath)) {
      return { error: `File not found: ${filePath}` }
    }
    try {
      const oldContent = fs.readFileSync(filePath, 'utf-8')
      if (!oldContent.includes(targetContent)) {
        return { error: `Target content not found in ${filePath}` }
      }
      const newContent = oldContent.replace(targetContent, replacementContent)
      return { diff: this.computeDiff(filePath, oldContent, newContent) }
    } catch (err: any) {
      return { error: err.message }
    }
  }

  /**
   * Apply replace_file_content to disk.
   */
  static replaceFileContent(
    toolCallId: string,
    filePath: string,
    targetContent: string,
    replacementContent: string,
  ): ToolResult {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          toolCallId,
          name: 'replace_file_content',
          output: `Error: File not found: ${filePath}`,
          isError: true,
        }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      if (!content.includes(targetContent)) {
        return {
          toolCallId,
          name: 'replace_file_content',
          output: `Error: Target content was not found in ${filePath}. Check whitespace and line content.`,
          isError: true,
        }
      }

      const newContent = content.replace(targetContent, replacementContent)
      fs.writeFileSync(filePath, newContent, 'utf-8')

      return {
        toolCallId,
        name: 'replace_file_content',
        output: `Successfully replaced content in ${filePath}`,
        isError: false,
      }
    } catch (err: any) {
      return {
        toolCallId,
        name: 'replace_file_content',
        output: `Error replacing file content: ${err.message}`,
        isError: true,
      }
    }
  }
}
