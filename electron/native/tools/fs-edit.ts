/**
 * fs_edit — replace one or more exact substrings in a file.
 *
 * Claude-Code-style semantics: each edit is a literal (old_string, new_string)
 * pair. old_string MUST be unique in the file unless `replace_all: true`.
 * This keeps edits precise and prevents unintended cascading changes.
 *
 * Edits apply atomically — we build the full new content, then rename
 * over the original so a mid-write crash does not leave a half-edited file.
 */

import * as fs from 'fs'
import * as path from 'path'
import { workspaceRoot } from '../core/config.js'
import { registerTool, type ToolDef } from './registry.js'

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(workspaceRoot(), p)
}

interface SingleEdit {
  old_string: string
  new_string: string
  replace_all?: boolean
}

interface Input {
  path: string
  old_string?: string
  new_string?: string
  replace_all?: boolean
  edits?: SingleEdit[]
}

function applyEdit(text: string, edit: SingleEdit): string {
  if (!edit.old_string) {
    throw new Error('old_string must not be empty — use fs_write to create a new file')
  }
  if (edit.old_string === edit.new_string) {
    throw new Error('old_string and new_string are identical — no-op edit')
  }
  if (edit.replace_all) {
    if (!text.includes(edit.old_string)) {
      throw new Error('old_string not found in file')
    }
    return text.split(edit.old_string).join(edit.new_string)
  }
  const first = text.indexOf(edit.old_string)
  if (first < 0) throw new Error('old_string not found in file')
  const second = text.indexOf(edit.old_string, first + edit.old_string.length)
  if (second >= 0) {
    throw new Error(
      'old_string appears more than once. Provide more surrounding context to make it unique, ' +
      'or set replace_all: true.',
    )
  }
  return text.slice(0, first) + edit.new_string + text.slice(first + edit.old_string.length)
}

const tool: ToolDef<Input, unknown> = {
  name: 'fs_edit',
  title: 'Edit file',
  description:
    'Apply exact-string edits to a file. Use `old_string` + `new_string` for a single edit, ' +
    'or `edits: [...]` for a batch. Each old_string must be unique (or pass replace_all: true). ' +
    'Prefer edits over rewriting whole files.',
  category: 'fs',
  permission: 'ask',
  dangerous: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      old_string: { type: 'string' },
      new_string: { type: 'string' },
      replace_all: { type: 'boolean' },
      edits: {
        type: 'array',
        description: 'Alternative to old_string/new_string — a list of edits applied in order.',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string' },
            new_string: { type: 'string' },
            replace_all: { type: 'boolean' },
          },
          required: ['old_string', 'new_string'],
        },
      },
    },
    required: ['path'],
  },
  async handler(input: Input) {
    const abs = resolvePath(input.path)
    if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`)

    const edits: SingleEdit[] = input.edits && input.edits.length > 0
      ? input.edits
      : input.old_string !== undefined
        ? [{
            old_string: input.old_string,
            new_string: input.new_string ?? '',
            replace_all: !!input.replace_all,
          }]
        : []
    if (edits.length === 0) {
      throw new Error('no edits supplied — pass old_string/new_string or edits: [...]')
    }

    const orig = await fs.promises.readFile(abs, 'utf8')
    let text = orig
    for (const e of edits) text = applyEdit(text, e)

    const tmp = `${abs}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
    await fs.promises.writeFile(tmp, text, 'utf8')
    await fs.promises.rename(tmp, abs)

    return {
      path: abs,
      appliedEdits: edits.length,
      bytesBefore: Buffer.byteLength(orig, 'utf8'),
      bytesAfter: Buffer.byteLength(text, 'utf8'),
      linesAfter: text.split('\n').length,
    }
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
