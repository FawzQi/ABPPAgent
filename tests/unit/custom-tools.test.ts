import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { CustomToolsService } from '../../src/main/services/tools/custom-tools'

describe('CustomToolsService', () => {
  const pkgPath = path.resolve(__dirname, '../../package.json')

  it('reads full file content without pagination using readFileFull', () => {
    const res = CustomToolsService.readFileFull('test_call_1', pkgPath)
    expect(res.isError).toBe(false)
    expect(res.output).toContain('"name": "ABPPAgent"')
  })

  it('handles missing file gracefully in readFileFull', () => {
    const res = CustomToolsService.readFileFull('test_call_2', '/non/existent/file.txt')
    expect(res.isError).toBe(true)
    expect(res.output).toContain('File not found')
  })

  it('formats full file with start and end markers in copyFileToChat', () => {
    const res = CustomToolsService.copyFileToChat('test_call_3', pkgPath)
    expect(res.isError).toBe(false)
    expect(res.output).toContain('=== FILE START:')
    expect(res.output).toContain('"name": "ABPPAgent"')
    expect(res.output).toContain('=== FILE END:')
  })

  it('performs grep_search on repository', async () => {
    const repoRoot = path.resolve(__dirname, '../..')
    const res = await CustomToolsService.grepSearch('test_call_4', repoRoot, 'ABPPAgent', 'package.json')
    expect(res.isError).toBe(false)
    expect(res.output).toContain('package.json')
  })
})
