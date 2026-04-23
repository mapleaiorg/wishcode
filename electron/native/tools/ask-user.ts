/**
 * ask_user_question — ask the user a structured question mid-turn.
 *
 * The tool emits `tool.askUser` on the event bus with the question,
 * optional suggested answers, and a `requestId`. The renderer opens a
 * prompt modal and posts back via `ipcMain.handle('wish:askUser:answer')`
 * which resolves the pending promise here.
 *
 * Until the IPC round-trip is wired up, this tool returns immediately with
 * `{ skipped: true }` so the agent can proceed without blocking. Phase 3
 * replaces that fallback with a real renderer modal.
 */

import { emit } from '../core/events.js'
import { registerTool, type ToolDef } from './registry.js'

const pending = new Map<string, (answer: { choice: string; text?: string }) => void>()

/**
 * Called from the IPC layer when the renderer posts an answer.
 * Exported so `electron/main.ts` can import and wire it.
 */
export function resolveAsk(requestId: string, answer: { choice: string; text?: string }): boolean {
  const resolver = pending.get(requestId)
  if (!resolver) return false
  pending.delete(requestId)
  resolver(answer)
  return true
}

interface Input {
  question: string
  options?: string[]
  allow_free_text?: boolean
  timeout_ms?: number
}

const DEFAULT_TIMEOUT = 5 * 60_000

const tool: ToolDef<Input, unknown> = {
  name: 'ask_user_question',
  title: 'Ask the user',
  description:
    'Ask the user a clarifying question mid-turn. Use sparingly — only when the task truly ' +
    'cannot proceed without the user\'s input. Provide 2–5 suggested answers when possible.',
  category: 'agent',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      options: { type: 'array', items: { type: 'string' }, description: 'Suggested answers.' },
      allow_free_text: { type: 'boolean', description: 'Allow a free-text answer in addition to options.' },
      timeout_ms: { type: 'integer', description: 'Auto-skip if the user doesn\'t answer. Default 5 min.' },
    },
    required: ['question'],
  },
  async handler(input: Input, ctx) {
    const requestId = `ask_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    emit('tool.askUser', {
      requestId,
      sessionId: ctx.sessionId,
      question: input.question,
      options: input.options ?? [],
      allowFreeText: !!input.allow_free_text,
    })

    const timeoutMs = Math.max(5_000, Number(input.timeout_ms ?? DEFAULT_TIMEOUT))
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (pending.delete(requestId)) {
          resolve({ skipped: true, reason: 'timeout' })
        }
      }, timeoutMs)

      pending.set(requestId, (answer) => {
        clearTimeout(timer)
        resolve({ question: input.question, ...answer })
      })

      ctx.signal?.addEventListener?.('abort', () => {
        if (pending.delete(requestId)) {
          clearTimeout(timer)
          resolve({ skipped: true, reason: 'aborted' })
        }
      }, { once: true })
    })
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
