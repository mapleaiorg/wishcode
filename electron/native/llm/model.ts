/**
 * Model registry and selection.
 *
 * Exposes the list of available models across providers, infers the
 * provider from a model name, persists the user's choice.
 */

import { readConfig, writeConfig } from '../core/config.js'
import { emit } from '../core/events.js'
import type { Provider } from '../auth/auth.js'

export interface ModelInfo {
  provider: Provider
  model: string
  label: string
  rateNote?: string
}

export const DEFAULT_MODEL_BY_PROVIDER: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o-mini',
  xai:       'grok-3-mini',
  gemini:    'gemini-2.0-flash-exp',
  ollama:    'llama3.2',
  hermon: 'hermon-default',
}

export function inferProvider(model: string): Provider {
  // Ollama model tags commonly contain "/" or ":" (e.g. "sorc/qwen3.5-claude-4.6-opus:9b").
  // The "claude" substring in an Ollama tag must not trick us into calling Anthropic.
  // Anthropic official IDs never contain "/" or ":", so treat those separators as an
  // unambiguous Ollama signal and short-circuit before the keyword matches below.
  if (model.includes('/') || model.includes(':')) return 'ollama'
  if (/^claude(-|$)/i.test(model)) return 'anthropic'
  if (/^(gpt-|o1|o3)/i.test(model)) return 'openai'
  if (/^grok/i.test(model)) return 'xai'
  if (/^gemini/i.test(model)) return 'gemini'
  if (/^(llama|mistral|phi|qwen|gemma|deepseek)/i.test(model)) return 'ollama'
  return 'anthropic'
}

export async function modelList(): Promise<{ current: string; available: ModelInfo[] }> {
  const cfg = readConfig()
  const env = cfg.env ?? {}
  const current = cfg.mainLoopModel || cfg.lastAnthropicModel || 'claude-sonnet-4-6'
  const available: ModelInfo[] = []

  if (env.ANTHROPIC_API_KEY || cfg.claudeAiOauth) {
    const isOAuth = !!cfg.claudeAiOauth && !env.ANTHROPIC_API_KEY
    // Only list currently-supported model IDs. Legacy `-latest` aliases
    // (claude-3-7-sonnet-latest, claude-3-5-sonnet-latest) have been retired
    // by Anthropic and return 404s — we no longer expose those.
    available.push(
      { provider: 'anthropic', model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — best all-rounder', rateNote: isOAuth ? 'Pro/Max subscription pool' : undefined },
      { provider: 'anthropic', model: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5 — fastest, cheapest',  rateNote: isOAuth ? 'Highest per-minute cap on Pro' : undefined },
      { provider: 'anthropic', model: 'claude-opus-4-1',   label: 'Claude Opus 4.1 — deepest reasoning',    rateNote: isOAuth ? 'Strictest per-minute cap on Pro' : undefined },
    )
  }
  if (env.OPENAI_API_KEY) {
    available.push(
      { provider: 'openai', model: 'gpt-4o',       label: 'GPT-4o' },
      { provider: 'openai', model: 'gpt-4o-mini',  label: 'GPT-4o mini' },
      { provider: 'openai', model: 'o3-mini',      label: 'o3-mini' },
      { provider: 'openai', model: 'o1',           label: 'o1' },
    )
  }
  if (env.XAI_API_KEY) {
    available.push(
      { provider: 'xai', model: 'grok-3',      label: 'Grok 3' },
      { provider: 'xai', model: 'grok-3-mini', label: 'Grok 3 mini' },
    )
  }
  if (env.GEMINI_API_KEY) {
    available.push(
      { provider: 'gemini', model: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
      { provider: 'gemini', model: 'gemini-1.5-pro',       label: 'Gemini 1.5 Pro' },
      { provider: 'gemini', model: 'gemini-1.5-flash',     label: 'Gemini 1.5 Flash' },
    )
  }
  // Ollama — ask the server for what's installed.
  const ollamaUrl = (env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
  try {
    const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(500) })
    if (r.ok) {
      const data = await r.json() as { models?: { name: string }[] }
      for (const m of data.models ?? []) {
        available.push({ provider: 'ollama', model: m.name, label: `🦙 ${m.name}` })
      }
    }
  } catch { /* ollama not running — fine */ }

  return { current, available }
}

export async function modelSet(model: string, provider?: Provider): Promise<{ model: string; provider: Provider }> {
  const resolvedProvider = provider ?? inferProvider(model)
  const before = currentModel()
  writeConfig(cfg => {
    cfg.mainLoopModel = model
    cfg.mainLoopModelProvider = resolvedProvider
    if (resolvedProvider === 'anthropic') cfg.lastAnthropicModel = model
    return cfg
  })
  const changed =
    before.model !== model || before.provider !== resolvedProvider
  if (changed) {
    // Fan out so renderer can surface a toast, write a transcript marker,
    // or offer to start a fresh chat. The turn-loop also consults this
    // to know whether to prepend a "[model switched]" system note so the
    // new model isn't blindsided by prior tool-use blocks it can't reuse.
    emit('model.changed', {
      from: before,
      to: { model, provider: resolvedProvider },
      ts: Date.now(),
    })
  }
  return { model, provider: resolvedProvider }
}

export function currentModel(): { model: string; provider: Provider } {
  const cfg = readConfig()
  const env = cfg.env ?? {}
  const hasAnyKey =
    env.ANTHROPIC_API_KEY || cfg.claudeAiOauth ||
    env.OPENAI_API_KEY || env.XAI_API_KEY || env.GEMINI_API_KEY
  if (cfg.mainLoopModel) {
    const provider = (cfg.mainLoopModelProvider as Provider) || inferProvider(cfg.mainLoopModel)
    return { model: cfg.mainLoopModel, provider }
  }
  // Default fallback: Ollama if the user has no cloud keys (local-first).
  // Otherwise keep anthropic as the canonical cloud default.
  if (!hasAnyKey) return { model: DEFAULT_MODEL_BY_PROVIDER.ollama, provider: 'ollama' }
  const model = cfg.lastAnthropicModel || 'claude-sonnet-4-6'
  return { model, provider: 'anthropic' }
}

/**
 * Auto-pick a live model when the user hasn't chosen one. Probes Ollama
 * first (local, no key), then falls back to whichever provider has a key.
 * Persists the selection so the chat loop can start the very first turn
 * without asking the user.
 */
export async function autoPickDefaultModel(): Promise<{ model: string; provider: Provider } | null> {
  const cfg = readConfig()
  if (cfg.mainLoopModel) return currentModel()
  const { available } = await modelList()
  if (available.length === 0) return null
  // Prefer Ollama (local) if present — matches local-first default.
  const ollama = available.find(m => m.provider === 'ollama')
  const pick = ollama ?? available[0]
  await modelSet(pick.model, pick.provider)
  return { model: pick.model, provider: pick.provider }
}
