/**
 * enter_plan_mode / exit_plan_mode — toggle plan mode.
 *
 * In plan mode the model may propose, but write/shell tools must ask for
 * confirmation before executing. The turn-loop reads `cfg.planMode` when
 * assembling the system prompt (see modelFetch/modelFetch.ts:buildSystemPrompt).
 *
 * enter_plan_mode takes a `plan` argument — the high-level proposal shown
 * to the user before they accept. exit_plan_mode confirms they accepted
 * and clears the flag so the agent can proceed with writes.
 */

import { readConfig, writeConfig } from '../core/config.js'
import { registerTool, type ToolDef } from './registry.js'

interface EnterInput {
  plan: string
}

registerTool({
  name: 'enter_plan_mode',
  title: 'Enter plan mode',
  description:
    'Enter plan mode and present a high-level plan to the user. Only call this when the user ' +
    'EXPLICITLY asks for a plan, says "think before acting", or for multi-file risky work. ' +
    'Do NOT call for greetings, trivial questions, or single-file reads. Requires a real ' +
    'markdown plan body (not a placeholder). While plan mode is on, write/shell tools ' +
    'require confirmation.',
  category: 'agent',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      plan: {
        type: 'string',
        minLength: 40,
        description: 'Markdown-formatted plan to present to the user. Minimum 40 characters — ' +
          'include the concrete steps, files, and trade-offs.',
      },
    },
    required: ['plan'],
  },
  async handler(input: EnterInput) {
    // Defensive validation — small open models sometimes call this with
    // an empty args object just to see what happens. Reject those firmly
    // so we don't flip the project into plan mode on a "hi".
    const plan = typeof input?.plan === 'string' ? input.plan.trim() : ''
    if (plan.length < 40) {
      return {
        error: 'enter_plan_mode rejected: `plan` must be a real markdown plan (≥40 chars). ' +
          'If you did not intend to enter plan mode, do not call this tool.',
        planMode: !!readConfig().planMode,
      }
    }
    writeConfig((cfg) => { cfg.planMode = true; return cfg })
    return { planMode: true, plan }
  },
} as ToolDef<EnterInput, unknown> as ToolDef<unknown, unknown>)

registerTool({
  name: 'exit_plan_mode',
  title: 'Exit plan mode',
  description:
    'Exit plan mode. Call this after the user has approved your plan so subsequent ' +
    'write/shell tools can run without asking.',
  category: 'agent',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    const prev = !!readConfig().planMode
    writeConfig((cfg) => { cfg.planMode = false; return cfg })
    return { planMode: false, wasActive: prev }
  },
} as ToolDef<unknown, unknown>)
