/**
 * shell_bash — run a shell command.
 *
 * Commands run in the workspace root by default. stdout and stderr are
 * captured as strings; the combined output is truncated to 30_000 chars
 * so long builds don't blow the LLM context window.
 *
 * Permission is "ask" by default — this tool is destructive-by-design
 * (it can rm, push, uninstall, etc.). The renderer confirms before
 * execution; in non-interactive flows (e.g. Task sub-agents) the parent
 * tool's permission mode governs.
 */

import { spawn } from 'child_process'
import * as path from 'path'
import { workspaceRoot } from '../core/config.js'
import { registerTool, type ToolDef } from './registry.js'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000
const MAX_OUTPUT = 30_000

interface Input {
  command: string
  cwd?: string
  timeout?: number
  description?: string
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_OUTPUT) return { text, truncated: false }
  const keep = Math.floor(MAX_OUTPUT * 0.8)
  return {
    text: text.slice(0, keep) + '\n\n…[output truncated]…\n\n' + text.slice(-Math.floor(MAX_OUTPUT * 0.2)),
    truncated: true,
  }
}

const tool: ToolDef<Input, unknown> = {
  name: 'shell_bash',
  title: 'Run shell command',
  description:
    'Run a shell command in the workspace. Returns stdout, stderr, exit code. ' +
    'Default timeout 120s (max 600s). Output truncated to 30kB. ' +
    'Prefer dedicated tools when available: fs_read/fs_glob/fs_grep/fs_edit over cat/find/grep/sed.',
  category: 'shell',
  permission: 'ask',
  dangerous: true,
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute.' },
      cwd: { type: 'string', description: 'Working dir. Default: workspace root.' },
      timeout: { type: 'integer', minimum: 100, maximum: MAX_TIMEOUT_MS, description: 'Timeout in ms.' },
      description: { type: 'string', description: 'Short human-readable description of what the command does.' },
    },
    required: ['command'],
  },
  async handler(input: Input, ctx) {
    const cwd = input.cwd
      ? (path.isAbsolute(input.cwd) ? input.cwd : path.resolve(workspaceRoot(), input.cwd))
      : workspaceRoot()
    const timeoutMs = Math.max(100, Math.min(MAX_TIMEOUT_MS, Number(input.timeout ?? DEFAULT_TIMEOUT_MS)))
    const signal = ctx?.signal

    return new Promise((resolve) => {
      const ps = spawn(input.command, {
        shell: true,
        cwd,
        env: process.env,
      })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      let aborted = false

      const timer = setTimeout(() => {
        timedOut = true
        ps.kill('SIGTERM')
        setTimeout(() => ps.kill('SIGKILL'), 2000).unref()
      }, timeoutMs)

      const onAbort = () => {
        aborted = true
        ps.kill('SIGTERM')
      }
      if (signal) {
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }

      ps.stdout.on('data', (b) => {
        stdout += b.toString('utf8')
        if (stdout.length > MAX_OUTPUT * 2) stdout = stdout.slice(-MAX_OUTPUT * 2)
      })
      ps.stderr.on('data', (b) => {
        stderr += b.toString('utf8')
        if (stderr.length > MAX_OUTPUT * 2) stderr = stderr.slice(-MAX_OUTPUT * 2)
      })

      ps.once('error', (err) => {
        clearTimeout(timer)
        resolve({
          command: input.command,
          cwd,
          exitCode: -1,
          error: err.message,
          stdout: truncate(stdout).text,
          stderr: truncate(stderr).text,
        })
      })

      ps.once('exit', (code, sig) => {
        clearTimeout(timer)
        signal?.removeEventListener?.('abort', onAbort)
        const o = truncate(stdout)
        const e = truncate(stderr)
        resolve({
          command: input.command,
          cwd,
          exitCode: code,
          signal: sig ?? null,
          timedOut,
          aborted,
          stdout: o.text,
          stderr: e.text,
          stdoutTruncated: o.truncated,
          stderrTruncated: e.truncated,
        })
      })
    })
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
