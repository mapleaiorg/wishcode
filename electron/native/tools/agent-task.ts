/**
 * agent_task — spawn a single-purpose sub-agent.
 *
 * Unlike `swarm` (parallel specialists), `agent_task` runs ONE focused
 * agent end-to-end in an isolated sub-session: it can read files, edit
 * code, run commands — and returns a final text answer to the parent.
 *
 * Useful when the main thread wants to keep its context small: "Explore
 * the repo and tell me how auth works" can run as a sub-agent that
 * consumes its own tool calls rather than polluting the user's chat.
 */

import { streamChat } from '../llm/chat.js'
import { currentModel } from '../llm/model.js'
import { anthropicTools, registerTool, type ToolDef } from './registry.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('agent_task')

interface Input {
  description: string
  prompt: string
  subagent_type?: 'explore' | 'general' | 'plan'
}

const SUBAGENT_PRESETS: Record<string, string> = {
  explore:
    'You are a fast exploration agent. Your job is to answer a question about a codebase ' +
    'by running fs_glob / fs_grep / fs_read and summarizing what you found. Do NOT edit files. ' +
    'Return a concise report (under 400 words) with file_path:line references.',
  general:
    'You are a focused sub-agent. Given the prompt below, do the work end-to-end using the ' +
    'tools available. Return a short report of what you did and what you found. Do not ask ' +
    'the parent for clarification — make reasonable choices and note them in the report.',
  plan:
    'You are a software architect. Do NOT edit code. Read relevant files, then return a ' +
    'numbered implementation plan: critical files, step-by-step changes, and trade-offs. ' +
    'End with a single-sentence recommendation.',
}

const tool: ToolDef<Input, unknown> = {
  name: 'agent_task',
  title: 'Spawn sub-agent',
  description:
    'Launch a single-purpose sub-agent to handle a well-defined task. The sub-agent can use all ' +
    'filesystem/shell/web tools and returns a final text report. Use for broad code exploration, ' +
    'multi-step research, or isolating work that would bloat the main thread\'s context. ' +
    'Prompt must be self-contained — the sub-agent has no memory of this conversation.',
  category: 'agent',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: '3-5 word task summary.' },
      prompt: { type: 'string', description: 'Self-contained instructions for the sub-agent.' },
      subagent_type: {
        type: 'string',
        enum: ['explore', 'general', 'plan'],
        description: 'Preset system prompt. Default "general".',
      },
    },
    required: ['description', 'prompt'],
  },
  async handler(input: Input) {
    const preset = SUBAGENT_PRESETS[input.subagent_type ?? 'general']
    const model = currentModel()
    const t0 = Date.now()

    let text = ''
    await streamChat({
      model: model.model,
      systemPrompt: preset,
      messages: [{ role: 'user', content: input.prompt }],
      tools: model.provider === 'anthropic' ? anthropicTools() : undefined,
      onDelta(chunk) { text += chunk },
      onThinking() {},
      onToolUse() {},
    })

    const ms = Date.now() - t0
    log.info('agent_task done', { description: input.description, ms, chars: text.length })
    return {
      description: input.description,
      subagentType: input.subagent_type ?? 'general',
      durationMs: ms,
      report: text.trim(),
    }
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
