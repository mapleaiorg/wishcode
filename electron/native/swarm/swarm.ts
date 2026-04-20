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
 * This is the "n-role" lane from the iBanker design (market analyst +
 * strategist + risk manager + compliance + research), adapted for iBank
 * Desktop where it's invoked only when the user opts in (/swarm …).
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
    name: 'Market Analyst',
    systemPrompt:
      'You are a crypto & equity market analyst. Given a question, you respond with a ' +
      'concise, structured read: trend, momentum, volume, key levels, scenarios. No ' +
      'hedging; no "not financial advice"; no filler.',
  },
  {
    name: 'Risk Manager',
    systemPrompt:
      'You are a risk manager. Given a question, you focus ONLY on what could go wrong: ' +
      'downside scenarios, drawdown estimates, correlation risks, liquidity risks, ' +
      'counterparty risks. Never bullish.',
  },
  {
    name: 'Strategist',
    systemPrompt:
      'You are a strategist. Given a question, you produce a concrete actionable plan: ' +
      'entry, invalidation, targets, size, management. Every plan must be specific and ' +
      'falsifiable.',
  },
  {
    name: 'Research Editor',
    systemPrompt:
      'You are a research editor. Given the specialists\' answers, you synthesize one ' +
      'integrated brief: the shared conclusions, the disagreements, and a final ' +
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
