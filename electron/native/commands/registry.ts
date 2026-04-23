/**
 * Slash command registry.
 *
 * A slash command is either:
 *   - a terminal action (the CLI never hands the input to the LLM — the command
 *     produces its own rendered output and that's it), or
 *   - a prompt transform (the command rewrites the message, then it is sent to
 *     the LLM as a normal turn).
 *
 * Each command returns a CommandResult.  The Chat layer is responsible for
 * inserting the `display` lines into the transcript and, for prompt
 * transforms, forwarding `prompt` into the QueryEngine as the next user turn.
 */

import type { BuiltinCommand } from './builtins'

export interface CommandContext {
  sessionId: string
  argv: string[]          // tokens after the command name
  raw: string             // the full message (including the slash)
}

export type CommandResult =
  | { kind: 'display'; text: string }
  | { kind: 'display-md'; markdown: string }
  | { kind: 'prompt'; prompt: string; tag?: string }
  | { kind: 'error'; message: string }
  | { kind: 'noop' }

export interface CommandDef {
  name: string                // primary name, no leading slash
  aliases?: string[]
  summary: string
  usage?: string
  category: 'core' | 'memory' | 'session' | 'model' | 'developer' | 'coding' | 'tasks' | 'mcp'
  handler: (ctx: CommandContext) => Promise<CommandResult>
}

const registry = new Map<string, CommandDef>()
let bootstrapped = false

export function registerCommand(def: CommandDef): void {
  registry.set(def.name, def)
  for (const alias of def.aliases ?? []) {
    registry.set(alias, def)
  }
}

export function unregisterCommand(name: string): void {
  registry.delete(name)
}

export function allCommands(): CommandDef[] {
  const unique = new Set<CommandDef>()
  for (const def of registry.values()) unique.add(def)
  return [...unique].sort((a, b) => a.name.localeCompare(b.name))
}

export function findCommand(name: string): CommandDef | undefined {
  return registry.get(name.replace(/^\//, '').toLowerCase())
}

export function parseSlash(input: string): { name: string; argv: string[] } | null {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('/')) return null
  // split on whitespace, keep quoted segments
  const m = trimmed.slice(1).match(/(?:"[^"]*"|\S+)/g) ?? []
  if (m.length === 0) return null
  const [head, ...rest] = m
  if (!head) return null
  return {
    name: head.toLowerCase(),
    argv: rest.map((s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s)),
  }
}

export async function runSlash(sessionId: string, input: string): Promise<CommandResult> {
  ensureBootstrap()
  const parsed = parseSlash(input)
  if (!parsed) return { kind: 'error', message: 'not a slash command' }
  const def = findCommand(parsed.name)
  if (!def) return { kind: 'error', message: `unknown command: /${parsed.name}` }
  try {
    return await def.handler({ sessionId, argv: parsed.argv, raw: input })
  } catch (err) {
    return { kind: 'error', message: (err as Error).message }
  }
}

let _builtins: BuiltinCommand[] | null = null
function ensureBootstrap(): void {
  if (bootstrapped) return
  bootstrapped = true
  // Lazy import to avoid circular at module-load time
  //   (commands/builtins imports other native modules which import events)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BUILTINS } = require('./builtins') as { BUILTINS: BuiltinCommand[] }
  _builtins = BUILTINS
  for (const b of BUILTINS) registerCommand(b)
}
