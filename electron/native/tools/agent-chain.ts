/**
 * agent_chain — declarative multi-stage pipeline of persona-scoped sub-agents.
 *
 * Where `agent_task` runs ONE sub-agent end-to-end, `agent_chain` runs a
 * sequence of stages — each one a sub-agent wearing a specific persona hat,
 * sharing structured state through the session blackboard so downstream
 * stages consume upstream output without re-reading the transcript.
 *
 * Typical flow: architect → coder → reviewer → tester → evaluator.
 *
 * Each stage definition:
 *   { persona: "coder", goal: "implement X", writeKey?: "impl.result",
 *     readKeys?: ["arch.design"] }
 *
 * Before a stage runs, the orchestrator injects any `readKeys` values from
 * the blackboard into that stage's prompt. After the stage returns, its
 * text report is written to `writeKey` (defaults to `chain.<stageIndex>`)
 * so the next stage — and any later turn — can pick it up.
 *
 * Chains abort on the first stage failure unless `continueOnError: true`.
 */

import { streamChat } from '../llm/chat.js'
import { currentModel } from '../llm/model.js'
import { anthropicTools, registerTool, type ToolContext, type ToolDef } from './registry.js'
import { getPersona, personaSystemBlock } from '../personas/registry.js'
import { bbGet, bbPut } from '../blackboard/blackboard.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('agent_chain')

interface Stage {
  persona: string
  goal: string
  /** Blackboard keys this stage should see in its prompt (values inlined as context). */
  readKeys?: string[]
  /** Where to write this stage's report. Default: `chain.<index>`. */
  writeKey?: string
  /** Override the chain's continueOnError for just this stage. */
  optional?: boolean
}

interface Input {
  description: string
  /** Global context every stage sees — the user's original ask, constraints, etc. */
  context?: string
  stages: Stage[]
  continueOnError?: boolean
}

interface StageResult {
  index: number
  persona: string
  goal: string
  writeKey: string
  durationMs: number
  report: string
  error?: string
}

function buildStagePrompt(
  stage: Stage,
  index: number,
  total: number,
  context: string | undefined,
  priorResults: StageResult[],
  readSnippets: Array<{ key: string; value: string }>,
): string {
  const lines: string[] = []
  lines.push(`# Stage ${index + 1} of ${total} — Persona: ${stage.persona}`)
  lines.push('')
  lines.push(`**Your goal:** ${stage.goal}`)
  if (context) {
    lines.push('')
    lines.push('## Shared context')
    lines.push(context)
  }
  if (readSnippets.length > 0) {
    lines.push('')
    lines.push('## Inputs from the blackboard')
    for (const s of readSnippets) {
      lines.push(`### \`${s.key}\``)
      lines.push('```')
      lines.push(s.value.length > 4000 ? s.value.slice(0, 4000) + '\n…[truncated]' : s.value)
      lines.push('```')
    }
  }
  if (priorResults.length > 0) {
    lines.push('')
    lines.push('## Prior stages in this chain')
    for (const p of priorResults) {
      const head = p.report.length > 600 ? p.report.slice(0, 600) + '…' : p.report
      lines.push(`- **${p.persona}** (${p.goal}) → ${head}`)
    }
  }
  lines.push('')
  lines.push(
    'Produce a concise, self-contained report for the next stage (and the user). ' +
    'You can call tools. When you have a structured result the next stage will need, ' +
    'write it to the blackboard with `bb_put`.',
  )
  return lines.join('\n')
}

const tool: ToolDef<Input, unknown> = {
  name: 'agent_chain',
  title: 'Run a multi-persona agent chain',
  description:
    'Execute a declarative pipeline of persona-scoped sub-agents that share state through the ' +
    'session blackboard. Use for work that benefits from role specialization — e.g. architect ' +
    'plans, coder implements, reviewer audits, tester validates. Each stage is a focused ' +
    'sub-agent: its tool calls and intermediate reasoning do NOT pollute the main thread. ' +
    'Returns a combined report of every stage\'s output.',
  category: 'agent',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: '3-5 word chain summary.' },
      context: {
        type: 'string',
        description: 'Shared context every stage sees (original ask, constraints, relevant paths).',
      },
      continueOnError: {
        type: 'boolean',
        description: 'If true, later stages run even when an earlier stage fails. Default false.',
      },
      stages: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            persona: {
              type: 'string',
              enum: ['coder', 'architect', 'reviewer', 'sre', 'security', 'researcher', 'scribe'],
            },
            goal: { type: 'string' },
            readKeys: { type: 'array', items: { type: 'string' } },
            writeKey: { type: 'string' },
            optional: { type: 'boolean' },
          },
          required: ['persona', 'goal'],
        },
      },
    },
    required: ['description', 'stages'],
  },
  async handler(input: Input, ctx: ToolContext) {
    const { description, context, stages } = input
    if (!Array.isArray(stages) || stages.length === 0) {
      throw new Error('agent_chain: stages must be a non-empty array')
    }
    const continueOnError = !!input.continueOnError
    const model = currentModel()
    const results: StageResult[] = []
    const t0 = Date.now()
    log.info('chain start', {
      sessionId: ctx.sessionId,
      description,
      stages: stages.map((s) => `${s.persona}:${s.goal.slice(0, 40)}`),
    })

    for (let i = 0; i < stages.length; i++) {
      if (ctx.signal?.aborted) {
        results.push({
          index: i, persona: stages[i].persona, goal: stages[i].goal,
          writeKey: stages[i].writeKey ?? `chain.${i}`,
          durationMs: 0, report: '', error: 'aborted',
        })
        break
      }

      const stage = stages[i]
      const persona = getPersona(stage.persona)
      if (!persona) {
        const err = `unknown persona: ${stage.persona}`
        results.push({
          index: i, persona: stage.persona, goal: stage.goal,
          writeKey: stage.writeKey ?? `chain.${i}`,
          durationMs: 0, report: '', error: err,
        })
        if (!continueOnError && !stage.optional) break
        continue
      }

      // Resolve blackboard reads.
      const readSnippets: Array<{ key: string; value: string }> = []
      for (const k of stage.readKeys ?? []) {
        const v = bbGet(ctx.sessionId, k)
        if (v == null) continue
        readSnippets.push({ key: k, value: typeof v === 'string' ? v : JSON.stringify(v, null, 2) })
      }

      // Build the stage's system prompt from the persona registry.
      const personaBlock = personaSystemBlock(persona.id)
      const systemPrompt =
        `You are a sub-agent inside a Wish Code agent chain titled "${description}". ` +
        `You are stage ${i + 1}/${stages.length}. Stay in your lane; produce one crisp report.\n\n` +
        personaBlock

      const userPrompt = buildStagePrompt(stage, i, stages.length, context, results, readSnippets)

      const stageT0 = Date.now()
      let text = ''
      let stageErr: string | undefined
      try {
        await streamChat({
          model: model.model,
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          tools: model.provider === 'anthropic' ? anthropicTools() : undefined,
          signal: ctx.signal,
          onDelta(chunk) { text += chunk },
          onThinking() {},
          onToolUse() {},
        })
      } catch (err) {
        stageErr = (err as Error).message
      }

      const writeKey = stage.writeKey ?? `chain.${i}`
      const durationMs = Date.now() - stageT0
      const report = text.trim()

      // Persist this stage to the blackboard so later turns / stages can read it.
      if (report && !stageErr) {
        try {
          bbPut(ctx.sessionId, writeKey, report, {
            writer: `agent_chain.${persona.id}`,
            note: stage.goal.slice(0, 120),
          })
        } catch (e) {
          log.warn('bb_put failed for stage', { key: writeKey, err: (e as Error).message })
        }
      }

      results.push({
        index: i,
        persona: persona.id,
        goal: stage.goal,
        writeKey,
        durationMs,
        report,
        error: stageErr,
      })
      log.info('stage done', {
        i, persona: persona.id, ms: durationMs, chars: report.length, err: stageErr,
      })

      if (stageErr && !continueOnError && !stage.optional) break
    }

    return {
      description,
      totalMs: Date.now() - t0,
      stages: results,
      ok: results.every((r) => !r.error),
    }
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
