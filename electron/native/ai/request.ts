/**
 * Canonical → provider-shape translators, and tool-definition helpers.
 *
 * Adapters import only what they need. The helpers stay narrow on
 * purpose: each provider has subtle contract quirks (OpenAI requires
 * tool_call_id pairing, Ollama wants `arguments` as object not
 * string, Anthropic wants a top-level `system` field separate from
 * `messages`, Gemini wants `contents`/`parts` and uses `model` instead
 * of `assistant`). Trying to express all of that as one shared shim
 * was the path that produced the 600-line `chat.ts` we're replacing.
 */

import type {
  AIContentBlock,
  AIMessage,
  AIRequest,
  AIToolDefinition,
} from '../../shared/ai/canonical.js'

// -- text flattening ------------------------------------------------

export function flattenBlocksToText(blocks: AIContentBlock[]): string {
  const parts: string[] = []
  for (const b of blocks) {
    if (b.kind === 'text') parts.push(b.text)
    else if (b.kind === 'reasoning') parts.push(`[thinking] ${b.text}`)
    else if (b.kind === 'tool_use') {
      parts.push(`[tool_use: ${b.name}(${JSON.stringify(b.input ?? {})})]`)
    } else if (b.kind === 'tool_result') {
      const out = typeof b.output === 'string' ? b.output : JSON.stringify(b.output)
      parts.push(`[tool_result] ${out}`)
    }
  }
  return parts.join('\n')
}

// -- system prompt extraction --------------------------------------

export function extractSystemPrompt(req: AIRequest): string | undefined {
  const sysMessages = req.messages.filter(m => m.role === 'system')
  if (sysMessages.length === 0) return undefined
  return sysMessages
    .map(m => flattenBlocksToText(m.blocks))
    .filter(Boolean)
    .join('\n\n') || undefined
}

export function nonSystemMessages(req: AIRequest): AIMessage[] {
  return req.messages.filter(m => m.role !== 'system')
}

// -- OpenAI / xAI shape -------------------------------------------

export function toOpenAIMessages(messages: AIMessage[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const m of messages) {
    if (m.role === 'tool') {
      // Canonical doesn't model role:tool directly — by convention,
      // tool messages are surfaced as user-role with a tool_result
      // block. But if a caller authors an explicit tool message, we
      // accept it: extract the first tool_result.
      const tr = m.blocks.find(b => b.kind === 'tool_result')
      if (tr && tr.kind === 'tool_result') {
        out.push({
          role: 'tool',
          tool_call_id: tr.toolUseId,
          content: typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output),
        })
      }
      continue
    }

    const textParts: string[] = []
    const toolCalls: Array<{ id: string; name: string; input: unknown }> = []
    const toolResults: Array<{ id: string; content: string }> = []
    for (const b of m.blocks) {
      if (b.kind === 'text') textParts.push(b.text)
      else if (b.kind === 'tool_use') {
        toolCalls.push({ id: b.id, name: b.name, input: b.input })
      } else if (b.kind === 'tool_result') {
        toolResults.push({
          id: b.toolUseId,
          content: typeof b.output === 'string' ? b.output : JSON.stringify(b.output),
        })
      }
    }

    if (m.role === 'assistant') {
      const msg: Record<string, unknown> = {
        role: 'assistant',
        content: textParts.join('\n') || (toolCalls.length ? null : ''),
      }
      if (toolCalls.length) {
        msg.tool_calls = toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
        }))
      }
      out.push(msg)
      continue
    }

    // user role
    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        out.push({ role: 'tool', tool_call_id: tr.id, content: tr.content })
      }
      if (textParts.length > 0) {
        out.push({ role: 'user', content: textParts.join('\n') })
      }
      continue
    }
    out.push({ role: 'user', content: textParts.join('\n') || flattenBlocksToText(m.blocks) })
  }
  return out
}

// -- Ollama shape -------------------------------------------------

export function toOllamaMessages(messages: AIMessage[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const m of messages) {
    if (m.role === 'tool') {
      const tr = m.blocks.find(b => b.kind === 'tool_result')
      if (tr && tr.kind === 'tool_result') {
        out.push({
          role: 'tool',
          tool_call_id: tr.toolUseId,
          content: typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output),
        })
      }
      continue
    }

    const textParts: string[] = []
    const toolCalls: Array<{ name: string; input: unknown }> = []
    const toolResults: Array<{ id: string; content: string }> = []
    for (const b of m.blocks) {
      if (b.kind === 'text') textParts.push(b.text)
      else if (b.kind === 'tool_use') toolCalls.push({ name: b.name, input: b.input ?? {} })
      else if (b.kind === 'tool_result') {
        toolResults.push({
          id: b.toolUseId,
          content: typeof b.output === 'string' ? b.output : JSON.stringify(b.output),
        })
      }
    }

    if (m.role === 'assistant') {
      const msg: Record<string, unknown> = { role: 'assistant', content: textParts.join('\n') || '' }
      if (toolCalls.length) {
        msg.tool_calls = toolCalls.map(tc => ({
          function: { name: tc.name, arguments: tc.input },
        }))
      }
      out.push(msg)
      continue
    }

    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        out.push({ role: 'tool', tool_call_id: tr.id, content: tr.content })
      }
      if (textParts.length > 0) out.push({ role: 'user', content: textParts.join('\n') })
      continue
    }
    out.push({ role: 'user', content: textParts.join('\n') || flattenBlocksToText(m.blocks) })
  }
  return out
}

// -- Anthropic shape ---------------------------------------------

/**
 * Convert canonical messages to Anthropic message format. Anthropic
 * carries content-block arrays natively, so we just remap kinds.
 */
export function toAnthropicMessages(
  messages: AIMessage[],
): Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }> {
  const out: Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }> = []
  for (const m of messages) {
    if (m.role === 'tool') {
      // Surface as a user message containing tool_result blocks
      const blocks: Array<Record<string, unknown>> = []
      for (const b of m.blocks) {
        if (b.kind === 'tool_result') {
          blocks.push({
            type: 'tool_result',
            tool_use_id: b.toolUseId,
            content:
              typeof b.output === 'string' ? b.output : JSON.stringify(b.output),
          })
        }
      }
      if (blocks.length) out.push({ role: 'user', content: blocks })
      continue
    }
    if (m.role === 'system') continue
    const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user'
    const blocks: Array<Record<string, unknown>> = []
    for (const b of m.blocks) {
      if (b.kind === 'text') blocks.push({ type: 'text', text: b.text })
      else if (b.kind === 'tool_use') {
        blocks.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} })
      } else if (b.kind === 'tool_result') {
        blocks.push({
          type: 'tool_result',
          tool_use_id: b.toolUseId,
          content: typeof b.output === 'string' ? b.output : JSON.stringify(b.output),
        })
      }
    }
    if (blocks.length === 0) blocks.push({ type: 'text', text: '' })
    out.push({ role, content: blocks })
  }
  return out
}

// -- Gemini shape -------------------------------------------------

export function toGeminiContents(
  messages: AIMessage[],
): Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> {
  const out: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = []
  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'tool') {
      for (const b of m.blocks) {
        if (b.kind === 'tool_result') {
          out.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'tool',
                  response: {
                    result:
                      typeof b.output === 'string' ? b.output : JSON.stringify(b.output),
                  },
                },
              },
            ],
          })
        }
      }
      continue
    }
    const parts: Array<Record<string, unknown>> = []
    const trailingResults: typeof out = []
    for (const b of m.blocks) {
      if (b.kind === 'text') parts.push({ text: b.text })
      else if (b.kind === 'tool_use') {
        parts.push({ functionCall: { name: b.name, args: b.input ?? {} } })
      } else if (b.kind === 'tool_result') {
        trailingResults.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'tool',
                response: {
                  result:
                    typeof b.output === 'string' ? b.output : JSON.stringify(b.output),
                },
              },
            },
          ],
        })
      }
    }
    if (parts.length) {
      out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts })
    }
    for (const tr of trailingResults) out.push(tr)
  }
  return out
}

// -- tool definitions ---------------------------------------------

export function toOpenAITools(tools: AIToolDefinition[] | undefined): unknown[] | undefined {
  if (!tools?.length) return undefined
  return tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }))
}

export function toAnthropicTools(tools: AIToolDefinition[] | undefined): unknown[] | undefined {
  if (!tools?.length) return undefined
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }))
}

export function toGeminiTools(tools: AIToolDefinition[] | undefined): unknown[] | undefined {
  if (!tools?.length) return undefined
  return [
    {
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
    },
  ]
}
