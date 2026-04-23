/**
 * Swarm — parallel sub-agents.
 *
 * Fans a single user-provided brief out to N specialist agents (each with
 * a distinct system prompt / model), collects their answers, and then runs
 * a synthesizer pass that merges/ranks them.
 *
 * Wired on top of the QueryEngine: each specialist runs in its own sub-
 * session (transcript isolated) so they don't contaminate the user's main
 * thread. Specialists can call tools just like the main engine.
 *
 * For WishCode we default to coding roles (code analyst, architect, tester,
 * editor), invoked only when the user opts in (/swarm …).
 */

import { createLogger } from '../core/logger.js'
import { streamChat } from '../llm/chat.js'
import { currentModel } from '../llm/model.js'
import { anthropicTools } from '../tools/registry.js'
import { emit } from '../core/events.js'

const log = createLogger('swarm')

export interface SwarmRole {
  name: string
  systemPrompt: string
}

export const DEFAULT_ROLES: SwarmRole[] = [
  {
    name: 'Code Analyst',
    systemPrompt:
      'You are a senior software engineer doing static analysis. Given a question about a ' +
      'codebase, you respond with a structured read: control flow, data flow, dependencies, ' +
      'invariants, edge cases. No filler; cite files/lines where you can.',
  },
  {
    name: 'Architect',
    systemPrompt:
      'You are a software architect. Given a question, you produce a concrete design: ' +
      'module boundaries, data contracts, failure modes, trade-offs. Every decision must ' +
      'be specific and reversible — or explicitly flagged if it is not.',
  },
  {
    name: 'Tester',
    systemPrompt:
      'You are a senior test engineer. Given a question, you focus ONLY on what could ' +
      'break: race conditions, boundary cases, bad inputs, missing assertions, flaky ' +
      'tests, coverage gaps. Propose falsifying test cases.',
  },
  {
    name: 'Editor',
    systemPrompt:
      'You are a staff engineer acting as editor. Given the specialists\' answers, you ' +
      'synthesize one integrated plan: shared conclusions, disagreements, and a final ' +
      'recommendation with its confidence level.',
  },
]

export interface SwarmResult {
  brief: string
  answers: Array<{ role: string; text: string; ms: number }>
  synthesis: string
  totalMs: number
}

// ---------------------------------------------------------------------------

export async function runSwarm(brief: string, opts: { roles?: SwarmRole[] } = {}): Promise<SwarmResult> {
  const roles = opts.roles ?? DEFAULT_ROLES
  const specialists = roles.slice(0, roles.length - 1)
  const editor = roles[roles.length - 1]
  const started = Date.now()
  const model = currentModel()

  emit('query.status', { phase: 'swarm-fanout', count: specialists.length })

  const answers = await Promise.all(
    specialists.map(async (role) => {
      const t0 = Date.now()
      const text = await runSingle(role, brief, model.model, model.provider === 'anthropic')
      log.info('specialist done', { role: role.name, ms: Date.now() - t0 })
      return { role: role.name, text, ms: Date.now() - t0 }
    }),
  )

  // Synthesis pass.
  emit('query.status', { phase: 'swarm-synthesize' })
  const synthPrompt =
    `Original question:\n${brief}\n\n` +
    specialists
      .map((r, i) => `## ${r.name}'s answer\n\n${answers[i].text}`)
      .join('\n\n') +
    '\n\n## Your job\n\nProduce a unified brief that integrates the above. Call out ' +
    'disagreements explicitly. End with a single Confidence Level (low/medium/high).'

  const synthesis = await runSingle(editor, synthPrompt, model.model, model.provider === 'anthropic')

  return {
    brief,
    answers,
    synthesis,
    totalMs: Date.now() - started,
  }
}

async function runSingle(
  role: SwarmRole,
  userText: string,
  modelName: string,
  useTools: boolean,
): Promise<string> {
  let out = ''
  await streamChat({
    model: modelName,
    systemPrompt: role.systemPrompt,
    messages: [{ role: 'user', content: userText }],
    tools: useTools ? anthropicTools() : undefined,
    onDelta(t) { out += t },
    onThinking() {},
    onToolUse() { /* specialists use tools but we don't fan their tool calls to UI */ },
  })
  return out
}
