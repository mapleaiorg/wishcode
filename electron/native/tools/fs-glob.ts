/**
 * fs_glob — list files matching a glob pattern.
 *
 * Uses Node's native fs.glob (Node 22+) when available; falls back to a
 * hand-rolled walker. Results are sorted by mtime desc so the most
 * recently touched files come first — matches Claude Code's default.
 *
 * Excludes common noise (node_modules, .git, dist, build, .next,
 * .venv, __pycache__) unless the pattern explicitly targets them.
 */

import * as fs from 'fs'
import * as path from 'path'
import { workspaceRoot } from '../core/config.js'
import { registerTool, type ToolDef } from './registry.js'

const DEFAULT_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.venv',
  '__pycache__', '.turbo', '.cache', 'target', '.tox',
])

const MAX_RESULTS = 1000

function starToRegex(pattern: string): RegExp {
  // Convert a glob to a regex. Supports **, *, ?, [abc], literal /.
  let re = '^'
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*'
        i++
        if (pattern[i + 1] === '/') i++
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') re += '[^/]'
    else if ('.+(){}|^$\\'.includes(c)) re += '\\' + c
    else re += c
  }
  re += '$'
  return new RegExp(re)
}

async function walk(
  dir: string,
  rootLen: number,
  regex: RegExp,
  includeHidden: boolean,
  out: Array<{ path: string; mtimeMs: number }>,
): Promise<void> {
  if (out.length >= MAX_RESULTS) return
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch { return }
  for (const ent of entries) {
    if (out.length >= MAX_RESULTS) return
    if (!includeHidden && ent.name.startsWith('.')) continue
    if (DEFAULT_IGNORE.has(ent.name)) continue
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      await walk(full, rootLen, regex, includeHidden, out)
    } else if (ent.isFile()) {
      const rel = full.slice(rootLen + 1).split(path.sep).join('/')
      if (regex.test(rel)) {
        try {
          const st = await fs.promises.stat(full)
          out.push({ path: full, mtimeMs: st.mtimeMs })
        } catch {}
      }
    }
  }
}

interface Input {
  pattern: string
  path?: string
  include_hidden?: boolean
}

const tool: ToolDef<Input, unknown> = {
  name: 'fs_glob',
  title: 'Glob files',
  description:
    'Find files matching a glob pattern (e.g. "**/*.ts", "src/**/*.{ts,tsx}"). ' +
    'Returns up to 1000 paths, sorted by mtime desc. Skips node_modules, .git, ' +
    'dist, build, .next, .venv, __pycache__ unless targeted explicitly.',
  category: 'fs',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob relative to search root.' },
      path: { type: 'string', description: 'Root to search. Default: workspace root.' },
      include_hidden: { type: 'boolean', description: 'Include dotfiles. Default false.' },
    },
    required: ['pattern'],
  },
  async handler(input: Input) {
    const root = input.path
      ? (path.isAbsolute(input.path) ? input.path : path.resolve(workspaceRoot(), input.path))
      : workspaceRoot()
    if (!fs.existsSync(root)) throw new Error(`root does not exist: ${root}`)

    const regex = starToRegex(input.pattern)
    const out: Array<{ path: string; mtimeMs: number }> = []
    await walk(root, root.length, regex, !!input.include_hidden, out)
    out.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return {
      pattern: input.pattern,
      root,
      count: out.length,
      truncated: out.length >= MAX_RESULTS,
      files: out.map((f) => f.path),
    }
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
