/**
 * fs_read — read a file from the workspace.
 *
 * Relative paths resolve against `workspaceRoot()`. Absolute paths are
 * honored as-is. Returns:
 *   - for text: `{ path, content, lineCount, truncated }`
 *   - for images: `{ path, mimeType, base64, size }`  (PNG/JPEG/WEBP/GIF)
 *   - for unsupported binaries: error
 *
 * Large text files are paginated by line: `offset` + `limit` give a
 * window. Default is first 2000 lines; content is cat -n prefixed so the
 * model sees absolute line numbers (essential for FileEdit).
 */

import * as fs from 'fs'
import * as path from 'path'
import { workspaceRoot } from '../core/config.js'
import { registerTool, type ToolDef } from './registry.js'

const DEFAULT_LINE_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(workspaceRoot(), p)
}

interface Input {
  path: string
  offset?: number
  limit?: number
}

const tool: ToolDef<Input, unknown> = {
  name: 'fs_read',
  title: 'Read file',
  description:
    'Read a file from the workspace. Returns text with 1-indexed line numbers (cat -n style). ' +
    'For images returns base64. Default reads first 2000 lines; use offset/limit to page.',
  category: 'fs',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path or path relative to the workspace root.' },
      offset: { type: 'integer', minimum: 0, description: '0-indexed starting line. Default 0.' },
      limit: { type: 'integer', minimum: 1, maximum: 10000, description: 'Max lines to read. Default 2000.' },
    },
    required: ['path'],
  },
  async handler(input: Input) {
    const abs = resolvePath(input.path)
    if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`)
    const st = await fs.promises.stat(abs)
    if (st.isDirectory()) throw new Error(`path is a directory, not a file: ${abs}`)

    const ext = path.extname(abs).toLowerCase()
    const mime = IMAGE_MIME[ext]
    if (mime) {
      if (st.size > MAX_IMAGE_BYTES) throw new Error(`image too large (${st.size} bytes)`)
      const buf = await fs.promises.readFile(abs)
      return {
        path: abs,
        mimeType: mime,
        base64: buf.toString('base64'),
        size: st.size,
      }
    }

    const offset = Math.max(0, Math.floor(Number(input.offset ?? 0)))
    const limit = Math.max(1, Math.floor(Number(input.limit ?? DEFAULT_LINE_LIMIT)))
    const text = await fs.promises.readFile(abs, 'utf8')
    const allLines = text.split('\n')
    const slice = allLines.slice(offset, offset + limit)
    const truncated = offset + limit < allLines.length
    const numbered = slice
      .map((line, i) => {
        const n = offset + i + 1
        const truncatedLine = line.length > MAX_LINE_LENGTH
          ? line.slice(0, MAX_LINE_LENGTH) + ` … [truncated, line has ${line.length} chars]`
          : line
        return `${String(n).padStart(6)}\t${truncatedLine}`
      })
      .join('\n')

    return {
      path: abs,
      content: numbered,
      lineCount: allLines.length,
      shownLines: slice.length,
      offset,
      truncated,
    }
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
