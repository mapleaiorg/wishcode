/**
 * Hooks runner.
 *
 * A hook is a shell command the user registers at ~/.wishcode/hooks.json to
 * run on well-known lifecycle events. The hook receives the event payload
 * as JSON on stdin; its stdout/exit-code can suppress the downstream action
 * or inject a side-channel message into the next turn.
 *
 * Event kinds:
 *   user_prompt_submit     — before a user message is handed to the model
 *   pre_tool_use           — before a tool handler runs
 *   post_tool_use          — after a tool handler returns
 *   stop                   — turn finished (end_turn / tool_error / aborted)
 *
 * Hook contract (matches Claude Code):
 *   - exit 0          → allow; stdout (if any) injected as system note
 *   - exit 2          → block; stderr shown to user as the reason
 *   - exit other      → log the error, but continue (treat as allow)
 *
 * hooks.json shape (subset of Claude Code):
 *   {
 *     "PreToolUse": [
 *       { "matcher": "shell_bash", "hooks": [{ "type": "command", "command": "…" }] }
 *     ],
 *     "PostToolUse": [ … ],
 *     "UserPromptSubmit": [ … ],
 *     "Stop": [ … ]
 *   }
 *
 * `matcher` is a regex against the relevant string (tool name for PreToolUse /
 * PostToolUse; any matcher for other events). Omit or empty = match all.
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { paths, workspaceRoot } from '../core/config.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('hooks')

export type HookEvent = 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop'

export interface HookResult {
  /** Stdout text the runner should inject as a system note. */
  systemMessage?: string
  /** True if this hook asked to block (exit 2). */
  blocked?: boolean
  /** Reason shown to the user when blocked. */
  reason?: string
}

interface HookEntry {
  matcher?: string
  hooks: Array<{ type: 'command'; command: string; timeout?: number }>
}

interface HookConfig {
  UserPromptSubmit?: HookEntry[]
  PreToolUse?: HookEntry[]
  PostToolUse?: HookEntry[]
  Stop?: HookEntry[]
}

const DEFAULT_TIMEOUT = 10_000

function hooksFile(): string {
  return path.join(paths().configDir, 'hooks.json')
}

function readHookConfig(): HookConfig {
  try {
    const file = hooksFile()
    if (!fs.existsSync(file)) return {}
    return JSON.parse(fs.readFileSync(file, 'utf8')) as HookConfig
  } catch (e) {
    log.warn('hooks.json parse failed', { err: (e as Error).message })
    return {}
  }
}

function matchTarget(entry: HookEntry, target: string): boolean {
  if (!entry.matcher || entry.matcher === '*' || entry.matcher === '') return true
  try { return new RegExp(entry.matcher).test(target) }
  catch { return entry.matcher === target }
}

function runCommand(
  command: string,
  payload: unknown,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const ps = spawn(command, { shell: true, cwd: workspaceRoot(), env: process.env })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try { ps.kill('SIGTERM') } catch {}
      setTimeout(() => { try { ps.kill('SIGKILL') } catch {} }, 2000).unref()
    }, timeoutMs)

    ps.stdout.on('data', (b) => { stdout += b.toString('utf8') })
    ps.stderr.on('data', (b) => { stderr += b.toString('utf8') })
    ps.once('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr + '\n' + err.message })
    })
    ps.once('exit', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })

    // Write payload to stdin, then close.
    try {
      ps.stdin.write(JSON.stringify(payload))
      ps.stdin.end()
    } catch {}
  })
}

/**
 * Run every hook registered for `event` against the given matcher target,
 * aggregating their effects. A single blocking hook stops the cascade.
 */
export async function runHooks(
  event: HookEvent,
  target: string,
  payload: unknown,
): Promise<HookResult> {
  const cfg = readHookConfig()
  const entries: HookEntry[] = cfg[event] ?? []
  if (entries.length === 0) return {}

  const messages: string[] = []
  for (const entry of entries) {
    if (!matchTarget(entry, target)) continue
    for (const hook of entry.hooks ?? []) {
      if (hook.type !== 'command' || !hook.command) continue
      const timeout = Math.max(500, Math.min(120_000, hook.timeout ?? DEFAULT_TIMEOUT))
      const { code, stdout, stderr } = await runCommand(hook.command, { event, target, payload }, timeout)
      if (code === 2) {
        return { blocked: true, reason: stderr.trim() || stdout.trim() || `hook "${hook.command}" blocked ${event}` }
      }
      if (code !== 0) {
        log.warn('hook non-zero exit', { event, target, command: hook.command.slice(0, 80), code, stderr: stderr.slice(0, 200) })
        continue
      }
      const out = stdout.trim()
      if (out) messages.push(out)
    }
  }
  return messages.length > 0 ? { systemMessage: messages.join('\n') } : {}
}
