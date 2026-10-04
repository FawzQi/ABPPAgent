import path from 'node:path'
import fs from 'node:fs'

const MAX_SIGNATURES = 24
const MAX_PREVIEW_LINES = 20

function takeSignature(text: string, start: number): string | null {
  let i = start
  let depth = 0
  while (i < text.length && i - start < 400) {
    const ch = text[i]
    if (ch === undefined) break
    if (ch === '(' || ch === '<' || ch === '[') depth++
    else if (ch === ')' || ch === '>' || ch === ']') depth--
    else if (depth === 0 && ch === '{') break
    else if (depth === 0 && ch === ';') {
      i += 1
      break
    } else if (depth === 0 && ch === '=' && text[i + 1] === '>') {
      i += 2
      break
    }
    i += 1
  }
  const raw = text.slice(start, i)
  return raw.replace(/\s+/g, ' ').trim().replace(/\s*\{$/, '') || null
}

export function extractDeclarations(filePath: string, text: string): { deps: string[]; signatures: string[] } {
  const ext = path.extname(filePath).toLowerCase()
  const deps = new Set<string>()
  const signatures: string[] = []

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    for (const m of text.matchAll(/^\s*import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
      if (m[1]) deps.add(m[1])
    }
    const exportRe =
      /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm
    for (const m of text.matchAll(exportRe)) {
      const start = m.index ?? 0
      const sig = takeSignature(text, start)
      if (sig) signatures.push(sig)
      if (signatures.length >= MAX_SIGNATURES) break
    }
  } else if (ext === '.py') {
    for (const m of text.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
      const spec = m[1] ?? m[2]
      if (spec) deps.add(spec)
    }
    for (const m of text.matchAll(/^(?:async\s+)?def\s+\w+\s*\([^)]*\)[^:]*:/gm)) {
      signatures.push(m[0].replace(/\s+/g, ' ').trim())
      if (signatures.length >= MAX_SIGNATURES) break
    }
  } else {
    const lines = text.split(/\r?\n/).slice(0, MAX_PREVIEW_LINES)
    signatures.push(...lines.filter((l) => l.trim().length > 0).slice(0, 10))
  }

  return { deps: [...deps], signatures }
}

export function buildSkeleton(filePath: string, content: string): string {
  const { deps, signatures } = extractDeclarations(filePath, content)
  const lines: string[] = [`File: ${filePath}`]
  if (deps.length > 0) {
    lines.push(`Imports: ${deps.slice(0, 15).join(', ')}`)
  }
  if (signatures.length > 0) {
    lines.push('Declarations:')
    for (const sig of signatures) {
      lines.push(`  ${sig}`)
    }
  }
  return lines.join('\n')
}

export async function buildImportGraph(
  projectRoot: string,
  filePaths: string[],
): Promise<Map<string, Set<string>>> {
  const graph = new Map<string, Set<string>>()
  const known = new Set(filePaths)

  for (const relPath of filePaths) {
    const ext = path.extname(relPath).toLowerCase()
    if (!['.ts', '.tsx', '.js', '.jsx', '.py'].includes(ext)) continue

    try {
      const fullPath = path.join(projectRoot, relPath)
      if (!fs.existsSync(fullPath)) continue
      const content = fs.readFileSync(fullPath, 'utf8')
      const { deps } = extractDeclarations(relPath, content)
      const resolved = new Set<string>()

      for (const dep of deps) {
        if (dep.startsWith('.')) {
          const dir = path.dirname(relPath)
          const targetBase = path.normalize(path.join(dir, dep))
          const candidates = [
            targetBase,
            `${targetBase}.ts`,
            `${targetBase}.tsx`,
            `${targetBase}.js`,
            `${targetBase}.jsx`,
            path.join(targetBase, 'index.ts'),
            path.join(targetBase, 'index.tsx'),
            path.join(targetBase, 'index.js'),
          ]
          for (const cand of candidates) {
            if (known.has(cand)) {
              resolved.add(cand)
              break
            }
          }
        }
      }

      if (resolved.size > 0) {
        graph.set(relPath, resolved)
      }
    } catch {}
  }

  return graph
}
