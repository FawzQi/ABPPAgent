import fs from 'node:fs'
import path from 'node:path'
import ignore from 'ignore'
import type { ToolResult } from '@shared/types'

export class DirectoryExplorer {
  /**
   * List directory contents respecting .gitignore up to max depth.
   */
  static listDirectory(
    toolCallId: string,
    dirPath: string,
    recursive: boolean = false,
    maxDepth: number = 3,
  ): ToolResult {
    try {
      if (!fs.existsSync(dirPath)) {
        return {
          toolCallId,
          name: 'list_directory',
          output: `Error: Directory not found: ${dirPath}`,
          isError: true,
        }
      }

      // Load .gitignore if present in dirPath or root
      const ig = ignore()
      ig.add(['.git', 'node_modules', 'dist', 'out', 'release', '.DS_Store'])

      const gitignorePath = path.join(dirPath, '.gitignore')
      if (fs.existsSync(gitignorePath)) {
        try {
          const rules = fs.readFileSync(gitignorePath, 'utf-8')
          ig.add(rules)
        } catch {
          // ignore read error
        }
      }

      const results: string[] = []

      const walk = (currentDir: string, currentDepth: number) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name)
          const relPath = path.relative(dirPath, fullPath)

          if (ig.ignores(relPath) || ig.ignores(`${relPath}/`)) {
            continue
          }

          if (entry.isDirectory()) {
            results.push(`${relPath}/`)
            if (recursive && currentDepth < maxDepth) {
              walk(fullPath, currentDepth + 1)
            }
          } else {
            results.push(relPath)
          }
        }
      }

      walk(dirPath, 1)

      return {
        toolCallId,
        name: 'list_directory',
        output: results.join('\n') || '(empty directory)',
        isError: false,
      }
    } catch (err: any) {
      return {
        toolCallId,
        name: 'list_directory',
        output: `Error listing directory: ${err.message}`,
        isError: true,
      }
    }
  }

  /**
   * Get basic flat file tree for the UI file explorer.
   */
  static getDirectoryTree(dirPath: string): { path: string; name: string; isDir: boolean }[] {
    if (!fs.existsSync(dirPath)) return []
    try {
      const ig = ignore().add(['.git', 'node_modules', 'dist', 'out', 'release'])
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      const tree: { path: string; name: string; isDir: boolean }[] = []

      for (const entry of entries) {
        if (ig.ignores(entry.name)) continue
        tree.push({
          path: path.join(dirPath, entry.name),
          name: entry.name,
          isDir: entry.isDirectory(),
        })
      }
      return tree.sort((a, b) => {
        if (a.isDir === b.isDir) return a.name.localeCompare(b.name)
        return a.isDir ? -1 : 1
      })
    } catch {
      return []
    }
  }
}
