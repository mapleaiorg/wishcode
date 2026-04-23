/**
 * fs_write — create or overwrite a file.
 *
 * Creates parent directories as needed. Writes atomically via
 * tempfile+rename so a crash mid-write does not corrupt the target.
 *
 * Refuses to overwrite an existing file unless `overwrite: true`. This
 * protects against the classic "LLM hallucinated a filename" failure.
 */

import * as fs from 'fs'
import * as path from 'path'
import { workspaceRoot } from '../core/config.js'
import { registerTool, type ToolDef } from './registry.js'

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(workspaceRoot(), p)
}

interface Input {
  path: string
  content: string
  overwrite?: boolean
}

const tool: ToolDef<Input, unknown> = {
  name: 'fs_write',
  title: 'Write file',
  description:
    'Create or overwrite a file. Parent directories are created automatically. ' +
    'Writes are atomic. Pass `overwrite: true` to replace an existing file — otherwise the call fails.',
  category: 'fs',
  permission: 'ask',
  dangerous: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or workspace-relative file path.' },
      content: { type: 'string', description: 'Full file content.' },
      overwrite: { type: 'boolean', description: 'Permit overwriting an existing file.' },
    },
    required: ['path', 'content'],
  },
  async handler(input: Input) {
    const abs = resolvePath(input.path)
    const exists = fs.existsSync(abs)
    if (exists && !input.overwrite) {
      throw new Error(`file already exists (pass overwrite: true to replace): ${abs}`)
    }
    await fs.promises.mkdir(path.dirname(abs), { recursive: true })
    const tmp = `${abs}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
    await fs.promises.writeFile(tmp, input.content, 'utf8')
    await fs.promises.rename(tmp, abs)
    const bytes = Buffer.byteLength(input.content, 'utf8')
    const lines = input.content.split('\n').length
    return { path: abs, bytes, lines, created: !exists, overwritten: exists }
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
