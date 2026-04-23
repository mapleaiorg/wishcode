/**
 * fs_grep — search file contents with a regex.
 *
 * Shells out to `rg` (ripgrep) when available — fastest and respects
 * .gitignore by default. Falls back to a pure-Node walker when rg is
 * missing so the tool still works on stock machines.
 *
 * Three output modes:
 *   - "files_with_matches" (default): list paths only
 *   - "content":            matching lines with optional ±context
 *   - "count":              per-file match counts
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { workspaceRoot } from '../core/config.js'
import { registerTool, type ToolDef } from './registry.js'

const HEAD_LIMIT = 500

interface Input {
  pattern: string
  path?: string
  glob?: string
  type?: string
  output_mode?: 'files_with_matches' | 'content' | 'count'
  context?: number
  case_insensitive?: boolean
  multiline?: boolean
  head_limit?: number
}

async function hasRipgrep(): Promise<boolean> {
  return new Promise((resolve) => {
    const ps = spawn('rg', ['--version'], { stdio: 'ignore' })
    ps.once('error', () => resolve(false))
    ps.once('exit', (code) => resolve(code === 0))
  })
}

function runRg(args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const ps = spawn('rg', args, { cwd })
    let stdout = ''
    let stderr = ''
    ps.stdout.on('data', (b) => { stdout += b.toString('utf8') })
    ps.stderr.on('data', (b) => { stderr += b.toString('utf8') })
    ps.once('error', (err) => reject(err))
    ps.once('exit', (code) => {
      if (code === 0 || code === 1) resolve({ stdout, code: code ?? 1 })
      else reject(new Error(stderr.trim() || `rg exited ${code}`))
    })
  })
}

const DEFAULT_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.venv',
  '__pycache__', '.turbo', '.cache', 'target', '.tox',
])

async function fallbackGrep(
  root: string,
  re: RegExp,
  mode: Input['output_mode'],
  context: number,
  headLimit: number,
): Promise<{ files: string[]; lines: string[]; counts: Record<string, number> }> {
  const files: string[] = []
  const lines: string[] = []
  const counts: Record<string, number> = {}

  async function walk(dir: string): Promise<void> {
    if (files.length >= headLimit && lines.length >= headLimit) return
    let entries: fs.Dirent[]
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) }
    catch { return }
    for (const ent of entries) {
      if (DEFAULT_IGNORE.has(ent.name)) continue
      if (ent.name.startsWith('.') && ent.name !== '.github') continue
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) { await walk(full); continue }
      if (!ent.isFile()) continue
      let content: string
      try { content = await fs.promises.readFile(full, 'utf8') } catch { continue }
      const fileLines = content.split('\n')
      let matchCount = 0
      for (let i = 0; i < fileLines.length; i++) {
        if (re.test(fileLines[i])) {
          matchCount++
          if (mode === 'content' && lines.length < headLimit) {
            const from = Math.max(0, i - context)
            const to = Math.min(fileLines.length - 1, i + context)
            for (let k = from; k <= to; k++) {
              lines.push(`${full}:${k + 1}:${fileLines[k]}`)
            }
            if (context > 0) lines.push('--')
          }
        }
      }
      if (matchCount > 0) {
        files.push(full)
        counts[full] = matchCount
        if (mode === 'files_with_matches' && files.length >= headLimit) return
      }
    }
  }
  await walk(root)
  return { files, lines, counts }
}

const tool: ToolDef<Input, unknown> = {
  name: 'fs_grep',
  title: 'Grep',
  description:
    'Search file contents with a regex. Uses ripgrep when available, falls back to a pure-Node walker. ' +
    'Output modes: "files_with_matches" (default), "content" (show lines with optional ±context), "count".',
  category: 'fs',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern.' },
      path: { type: 'string', description: 'Root to search. Default: workspace root.' },
      glob: { type: 'string', description: 'Glob filter (e.g. "*.ts").' },
      type: { type: 'string', description: 'ripgrep file type (e.g. "js", "py").' },
      output_mode: {
        type: 'string',
        enum: ['files_with_matches', 'content', 'count'],
        description: 'Output mode. Default files_with_matches.',
      },
      context: { type: 'integer', minimum: 0, maximum: 20, description: 'Lines of context (content mode). Default 0.' },
      case_insensitive: { type: 'boolean' },
      multiline: { type: 'boolean' },
      head_limit: { type: 'integer', minimum: 1, maximum: 5000, description: 'Max results (default 500).' },
    },
    required: ['pattern'],
  },
  async handler(input: Input) {
    const root = input.path
      ? (path.isAbsolute(input.path) ? input.path : path.resolve(workspaceRoot(), input.path))
      : workspaceRoot()
    if (!fs.existsSync(root)) throw new Error(`root does not exist: ${root}`)

    const mode = input.output_mode ?? 'files_with_matches'
    const context = Math.max(0, Math.min(20, Number(input.context ?? 0)))
    const headLimit = Math.max(1, Math.min(5000, Number(input.head_limit ?? HEAD_LIMIT)))

    if (await hasRipgrep()) {
      const args: string[] = []
      if (input.case_insensitive) args.push('-i')
      if (input.multiline) args.push('-U', '--multiline-dotall')
      if (input.glob) args.push('--glob', input.glob)
      if (input.type) args.push('--type', input.type)
      if (mode === 'files_with_matches') args.push('-l')
      else if (mode === 'count') args.push('-c')
      else {
        args.push('-n', '--heading')
        if (context > 0) args.push('-C', String(context))
      }
      args.push('-m', String(headLimit))
      args.push('--', input.pattern)
      args.push(root)
      const { stdout } = await runRg(args, root)
      return {
        pattern: input.pattern,
        mode,
        root,
        output: stdout.trim(),
        used: 'ripgrep',
      }
    }

    const flags = input.case_insensitive ? 'i' : ''
    const re = new RegExp(input.pattern, flags)
    const res = await fallbackGrep(root, re, mode, context, headLimit)
    if (mode === 'files_with_matches') {
      return { pattern: input.pattern, mode, root, files: res.files.slice(0, headLimit), used: 'node' }
    }
    if (mode === 'count') {
      return { pattern: input.pattern, mode, root, counts: res.counts, used: 'node' }
    }
    return { pattern: input.pattern, mode, root, lines: res.lines.slice(0, headLimit), used: 'node' }
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
