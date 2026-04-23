/**
 * Model capability tiers + per-model adaptation.
 *
 * Different LLMs have dramatically different abilities to follow the
 * tool-calling protocol and navigate complex JSON schemas. The same tool
 * list that Claude Sonnet 4.6 handles flawlessly will cause llama3.2:3b
 * to emit garbage, hallucinate, or 400 out with a parse error.
 *
 * We classify every reachable model into one of four tiers and adapt
 * three things per tier:
 *
 *   1. Which tools we expose. Tiny models get zero tools (pure chat,
 *      because their tool-calling is unreliable and derails the turn
 *      loop). Small models get only the fs/shell core. Medium gets most.
 *      Large gets everything including the nested agent_chain pipeline.
 *
 *   2. How we shape the tool schemas. Small / medium models choke on
 *      deep enum lists, minItems/maxItems constraints, and nested
 *      array-of-object required fields. We prune those out while
 *      preserving the top-level contract (`type: object`, `properties`,
 *      `required`) that every provider must see to route the call.
 *
 *   3. What system-prompt guidance we add. Weaker models need firmer
 *      anti-hallucination rules + explicit "use the function-calling
 *      API, not text" reminders. Frontier models don't — the extra
 *      hammering wastes tokens and sometimes confuses them.
 *
 * Model protocol handling (Claude / OpenAI / Gemini / Ollama / Qwen
 * text formats / DeepSeek / Hermes) lives in llm/chat.ts +
 * modelFetch.ts `extractInlineToolCalls`. This module is strictly
 * about *capability*, not *protocol*.
 */

import type { Provider } from '../auth/auth.js'
import type { ToolSchema as RegistryToolSchema } from '../tools/registry.js'

export type CapabilityTier = 'tiny' | 'small' | 'medium' | 'large'

export interface ModelCapability {
  tier: CapabilityTier
  /** Approximate parameter count in billions, when we can guess from the name. */
  paramsB?: number
  /**
   * Family label used for protocol-aware quirks. Many of these overlap with
   * `Provider` but a provider can host multiple families (Ollama can serve
   * qwen, llama, mistral, gemma, phi, deepseek — each with its own text-form
   * tool-call convention).
   */
  family:
    | 'claude'
    | 'gpt'
    | 'o-series'        // o1/o3/o4 reasoning models
    | 'grok'
    | 'gemini'
    | 'qwen'
    | 'llama'
    | 'mistral'
    | 'gemma'
    | 'phi'
    | 'deepseek'
    | 'codestral'
    | 'hermes'
    | 'unknown'
  /**
   * Whether the model reliably speaks the provider's native function-calling
   * protocol. If false, we still send tools but lean harder on the text-form
   * rescue parser and warn the user that long multi-tool turns may drift.
   */
  reliableToolCalling: boolean
  /**
   * Max depth of nested JSON schemas we should send. Tiny/small models often
   * 400 on schemas deeper than 2 levels.
   */
  maxSchemaDepth: number
}

// ── Family classification ─────────────────────────────────────────────

/**
 * Pick the model family from a (provider, modelId) pair. The provider is
 * authoritative for cloud models; for Ollama we read the model name tag
 * since one provider hosts everything.
 */
export function inferFamily(provider: Provider, model: string): ModelCapability['family'] {
  const m = model.toLowerCase()
  if (provider === 'anthropic') return 'claude'
  if (provider === 'xai') return 'grok'
  if (provider === 'gemini') return 'gemini'
  if (provider === 'openai') {
    if (/^o[134]/.test(m)) return 'o-series'
    return 'gpt'
  }
  // Ollama + local: read the base model tag. Order matters — qwen2.5-coder
  // has "coder" in the name but should still classify as qwen.
  if (m.startsWith('qwen')) return 'qwen'
  if (m.startsWith('deepseek')) return 'deepseek'
  if (m.startsWith('codestral') || m.startsWith('codellama')) return 'codestral'
  if (m.startsWith('mistral') || m.startsWith('mixtral') || m.startsWith('mistral-nemo')) return 'mistral'
  if (m.startsWith('llama') || m.startsWith('llama3') || m.startsWith('llama2')) return 'llama'
  if (m.startsWith('gemma')) return 'gemma'
  if (m.startsWith('phi')) return 'phi'
  if (m.includes('hermes') || m.includes('openhermes')) return 'hermes'
  return 'unknown'
}

/**
 * Parse a parameter-count hint from an Ollama tag like `llama3.2:3b`,
 * `qwen2.5-coder:32b`, or `sorc/qwen3:9b`. Returns undefined if we can't
 * tell — most cloud model ids don't encode size this way.
 */
function parseParamsB(model: string): number | undefined {
  // `:3b`, `:7b`, `:32b`, `:70b`, `:405b` — the canonical Ollama tag shape.
  const tagMatch = model.match(/[:\-](\d+(?:\.\d+)?)b(?:[^a-z]|$)/i)
  if (tagMatch) return parseFloat(tagMatch[1])
  // Some models encode size in the name itself (llama3.2-1b, phi3-mini = 3.8b).
  const nameMatch = model.match(/(\d+(?:\.\d+)?)b(?:[^a-z0-9]|$)/i)
  if (nameMatch) return parseFloat(nameMatch[1])
  // Known keyword shortcuts.
  const m = model.toLowerCase()
  if (m.includes('mini') && (m.includes('phi3') || m.includes('phi-3'))) return 3.8
  if (m.includes('nemo')) return 12
  return undefined
}

// ── Capability resolution ─────────────────────────────────────────────

/**
 * Resolve (provider, model) → capability tier and protocol family.
 *
 * Rules of thumb:
 *   - All frontier cloud models (claude-sonnet/opus/haiku, gpt-4*, o1/o3,
 *     gemini-pro, grok-3, grok-code) → `large`.
 *   - gpt-4o-mini, gemini-flash, haiku, grok-mini → `medium`. They do tool
 *     calling natively but choke on 8-level nested schemas.
 *   - Ollama ≥20B → `medium`. 8–20B → `small`. <8B → `tiny`.
 *   - Code-specialist ≤7B models (qwen2.5-coder:7b, deepseek-coder:6.7b)
 *     get bumped from tiny to small — they're surprisingly good at tools
 *     despite the size.
 */
export function getCapability(provider: Provider, model: string): ModelCapability {
  const family = inferFamily(provider, model)
  const paramsB = parseParamsB(model)

  // Cloud frontier — treat as large regardless of parsed params.
  if (family === 'claude') {
    const m = model.toLowerCase()
    // Haiku is smaller and cheaper but still a frontier model on schemas;
    // bump it one tier down only on paper, keep capabilities "large".
    return { tier: 'large', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 8 }
  }
  if (family === 'o-series') {
    // o1/o3/o4 are reasoning-first; they do call tools but slower and via
    // a slightly different internal format. Treat as medium for safety.
    return { tier: 'medium', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 6 }
  }
  if (family === 'gpt') {
    const m = model.toLowerCase()
    if (m.includes('mini') || m.includes('3.5')) {
      return { tier: 'medium', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 4 }
    }
    return { tier: 'large', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 8 }
  }
  if (family === 'grok') {
    const m = model.toLowerCase()
    if (m.includes('mini')) {
      return { tier: 'medium', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 5 }
    }
    return { tier: 'large', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 8 }
  }
  if (family === 'gemini') {
    const m = model.toLowerCase()
    if (m.includes('flash')) {
      return { tier: 'medium', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 5 }
    }
    return { tier: 'large', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 8 }
  }

  // Ollama / local. Lean on the parsed parameter count first, then on
  // known-weak family baselines.
  const codeSpecialist =
    family === 'qwen' && model.toLowerCase().includes('coder') ||
    family === 'deepseek' ||
    family === 'codestral'

  if (paramsB !== undefined) {
    if (paramsB >= 30) return { tier: 'large', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 6 }
    if (paramsB >= 14) return { tier: 'medium', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 4 }
    if (paramsB >= 7 || codeSpecialist) {
      return { tier: 'small', family, paramsB, reliableToolCalling: family !== 'gemma' && family !== 'phi', maxSchemaDepth: 3 }
    }
    return { tier: 'tiny', family, paramsB, reliableToolCalling: false, maxSchemaDepth: 2 }
  }

  // No size hint — use family baselines.
  switch (family) {
    case 'qwen':
    case 'mistral':
    case 'llama':
      return { tier: 'small', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 3 }
    case 'deepseek':
    case 'codestral':
      return { tier: 'medium', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 4 }
    case 'gemma':
    case 'phi':
      return { tier: 'tiny', family, paramsB, reliableToolCalling: false, maxSchemaDepth: 2 }
    case 'hermes':
      return { tier: 'small', family, paramsB, reliableToolCalling: true, maxSchemaDepth: 3 }
    default:
      return { tier: 'small', family, paramsB, reliableToolCalling: false, maxSchemaDepth: 3 }
  }
}

// ── Tool filtering ────────────────────────────────────────────────────

/**
 * Tools that are safe to expose at each tier. Names must match what
 * `registry.ts` registers. Order is roughly "most useful first" in case
 * some future provider caps the tool-list length.
 *
 * Tiny tier intentionally gets NOTHING — we send an empty tools array so
 * the model doesn't attempt tool calls at all. The UX is pure chat, which
 * is what sub-4B models can actually do reliably.
 */
const TIER_TOOL_ALLOWLIST: Record<CapabilityTier, string[] | null> = {
  tiny: [],  // empty = no tools (chat-only)
  small: [
    'fs_read', 'fs_glob', 'fs_grep', 'fs_edit', 'fs_write',
    'shell_bash', 'web_search', 'web_fetch',
  ],
  medium: [
    'fs_read', 'fs_glob', 'fs_grep', 'fs_edit', 'fs_write',
    'shell_bash', 'web_search', 'web_fetch',
    'memory_add', 'memory_recall', 'memory_list',
    'bb_put', 'bb_get', 'bb_list',
    'wiki_read', 'wiki_update',
    'todo_write', 'ask_user_question',
    'enter_plan_mode', 'exit_plan_mode',
    'mcp_tool_list', 'mcp_tool_call',
  ],
  large: null,  // null = all registered tools
}

export interface ToolForLlm {
  name: string
  description: string
  input_schema: RegistryToolSchema
}

/**
 * Filter + simplify the tool list for a given model.
 *
 * Returns a new array; never mutates the registry's schemas. If the tier
 * is `tiny`, returns [] and the caller should skip sending `tools` at all.
 */
export function adaptToolsForModel(
  allTools: ToolForLlm[],
  cap: ModelCapability,
): ToolForLlm[] {
  const allowlist = TIER_TOOL_ALLOWLIST[cap.tier]
  const allowed = allowlist === null
    ? allTools
    : allTools.filter((t) => allowlist.includes(t.name))

  return allowed.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: simplifyToolSchema(t.input_schema, cap),
  }))
}

/**
 * Prune a tool's JSON schema to what a given capability tier can handle.
 *
 * What we strip per tier:
 *
 *   tiny   — ∅ (we never ship tools to tiny models)
 *   small  — `enum` lists >4 items (keep first 4 so the model still sees
 *            valid values), `minItems`/`maxItems`, `default`, `examples`,
 *            and any property deeper than `maxSchemaDepth`.
 *   medium — same but keep `enum` up to 16 items, no depth prune.
 *   large  — pass through unchanged.
 *
 * We deliberately preserve: `type`, `properties`, `required`,
 * `description`, and the nested `items` of arrays — these are the
 * fields every provider (OpenAI / Anthropic / Gemini / Ollama) requires
 * to route a call.
 */
export function simplifyToolSchema(
  schema: RegistryToolSchema,
  cap: ModelCapability,
): RegistryToolSchema {
  if (cap.tier === 'large') return schema
  const enumCap = cap.tier === 'small' ? 4 : 16
  return pruneSchema(schema, cap.maxSchemaDepth, enumCap, 0) as RegistryToolSchema
}

function pruneSchema(
  node: unknown,
  maxDepth: number,
  enumCap: number,
  depth: number,
): unknown {
  if (node == null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((n) => pruneSchema(n, maxDepth, enumCap, depth))
  const out: Record<string, unknown> = {}
  const src = node as Record<string, unknown>
  for (const [k, v] of Object.entries(src)) {
    // Strip purely cosmetic / size-constraint fields that confuse small models.
    if (k === 'minItems' || k === 'maxItems' || k === 'default' || k === 'examples' ||
        k === 'minimum' || k === 'maximum' || k === 'minLength' || k === 'maxLength' ||
        k === 'pattern' || k === 'format') {
      continue
    }
    if (k === 'enum' && Array.isArray(v) && v.length > enumCap) {
      out[k] = v.slice(0, enumCap)
      continue
    }
    // Depth cap: beyond maxDepth, replace nested schemas with a permissive
    // stub so the top-level contract remains valid JSON-schema but the
    // model isn't asked to reason about deep nesting.
    if ((k === 'properties' || k === 'items') && depth >= maxDepth) {
      if (k === 'properties') out[k] = {}
      else out[k] = { type: 'object' }
      continue
    }
    if (k === 'properties' && typeof v === 'object' && v !== null) {
      const props: Record<string, unknown> = {}
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        props[pk] = pruneSchema(pv, maxDepth, enumCap, depth + 1)
      }
      out[k] = props
      continue
    }
    out[k] = pruneSchema(v, maxDepth, enumCap, depth)
  }
  return out
}

// ── System-prompt adaptation ──────────────────────────────────────────

/**
 * Extra system-prompt stanza tailored to the active model's tier.
 *
 * Tiny: no tools at all, so we frame as a pure-chat assistant and warn
 *       the user explicitly not to expect file edits. We also disclose
 *       the model so they can switch if needed.
 *
 * Small: hammer on "use the function-calling API, NOT text" because
 *        these models parrot the tool-call syntax as prose half the time.
 *
 * Medium: lighter touch — just the anti-parrot reminder.
 *
 * Large: empty — the global grounding rules already cover frontier
 *        models and extra hammering wastes tokens.
 */
export function capabilityPromptAddendum(cap: ModelCapability, modelLabel: string): string {
  if (cap.tier === 'tiny') {
    return (
      '\n## Model capability notice\n' +
      `You are running on **${modelLabel}**, a small local model. Tool calling is disabled ` +
      'on this tier because sub-4B-parameter models cannot reliably emit the function-calling ' +
      'protocol. Answer from general knowledge and what the user tells you directly. ' +
      'If the user asks you to read, edit, or execute files, politely explain that this model ' +
      'is too small to drive tools safely and suggest switching to a larger model ' +
      '(e.g. qwen2.5-coder:14b+, llama3.1:8b+, or any cloud model).'
    )
  }
  if (cap.tier === 'small') {
    return (
      '\n## Model capability notice\n' +
      `You are running on **${modelLabel}**, a smaller local model. You have access to a ` +
      'reduced tool set (filesystem + shell + web only). IMPORTANT:\n' +
      '- Use the **native function-calling API** to invoke tools. Do NOT write the call as text ' +
      '(no `[tool_use: …]`, no `<tool_call>…</tool_call>`, no ```tool_code fences). ' +
      'The harness only executes calls that come through the function-calling channel.\n' +
      '- Prefer ONE tool call per turn on simple requests. Chaining many calls in one turn is ' +
      'unreliable at your size.\n' +
      '- If a tool returns an error or empty output, STOP and tell the user — do not retry blindly.'
    )
  }
  if (cap.tier === 'medium') {
    return (
      '\n## Model capability notice\n' +
      'Use the native function-calling API to invoke tools. Do not emit tool calls as text ' +
      '(`[tool_use:…]`, `<tool_call>…</tool_call>`, ```tool_code fences) — those are not executed.'
    )
  }
  return ''
}

/**
 * Short one-line description the UI can show next to the current-model
 * indicator: "⚡ chat-only (tiny)" / "🔧 core tools (small)" / etc.
 */
export function capabilitySummary(cap: ModelCapability): string {
  switch (cap.tier) {
    case 'tiny':   return 'chat-only (tools disabled at this size)'
    case 'small':  return 'core tools (fs + shell + web)'
    case 'medium': return 'most tools'
    case 'large':  return 'all tools'
  }
}
