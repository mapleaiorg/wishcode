/**
 * web_fetch — fetch a URL and return its content.
 *
 * HTML is stripped to plain text (scripts/styles removed, tags dropped,
 * entities decoded). JSON is returned as-is. Other text types are returned
 * raw. Binary types return a `{ bytes, contentType }` summary only.
 *
 * Redirects to a different host are reported but still followed, so a
 * prompt injection attack can't silently rewrite the target.
 */

import { registerTool, type ToolDef } from './registry.js'

const MAX_BYTES = 2_000_000 // 2 MB cap
const MAX_OUT_CHARS = 100_000
const DEFAULT_TIMEOUT_MS = 20_000

interface Input {
  url: string
  timeout_ms?: number
}

function stripHtml(html: string): string {
  // Drop <script>, <style>, <noscript>, <svg>, <iframe> contents entirely.
  let out = html.replace(/<(script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
  // Convert <br> / </p> / </div> / </h1-6> / </li> to newlines for readability.
  out = out.replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
  // Strip all remaining tags.
  out = out.replace(/<[^>]+>/g, '')
  // Decode the common entities.
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  // Collapse runs of whitespace.
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const tool: ToolDef<Input, unknown> = {
  name: 'web_fetch',
  title: 'Fetch URL',
  description:
    'Fetch a URL and return its content. HTML is stripped to plain text, JSON returned raw. ' +
    'Truncated to ~100KB. Use for reading docs, blog posts, changelogs, or API responses.',
  category: 'web',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute URL (http:// or https://).' },
      timeout_ms: { type: 'integer', minimum: 1000, maximum: 60_000, description: 'Fetch timeout. Default 20s.' },
    },
    required: ['url'],
  },
  async handler(input: Input, ctx) {
    const timeout = Math.max(1000, Math.min(60_000, Number(input.timeout_ms ?? DEFAULT_TIMEOUT_MS)))
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(new Error('timeout')), timeout)
    ctx?.signal?.addEventListener?.('abort', () => ctl.abort(), { once: true })

    const t0 = Date.now()
    let response: Response
    try {
      response = await fetch(input.url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (WishCode-Desktop) Claude/WebFetch',
          'accept': 'text/html,application/json,text/plain;q=0.9,*/*;q=0.5',
        },
        redirect: 'follow',
        signal: ctl.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const contentType = response.headers.get('content-type') ?? ''
    const finalUrl = response.url

    const buf = await response.arrayBuffer()
    const truncatedBytes = buf.byteLength > MAX_BYTES
    const bytes = truncatedBytes ? buf.slice(0, MAX_BYTES) : buf

    const isText =
      contentType.startsWith('text/') ||
      contentType.includes('json') ||
      contentType.includes('xml') ||
      contentType.includes('javascript')

    if (!isText) {
      return {
        url: input.url,
        finalUrl,
        status: response.status,
        contentType,
        bytes: buf.byteLength,
        binary: true,
        durationMs: Date.now() - t0,
      }
    }

    const raw = new TextDecoder('utf-8').decode(bytes)
    let text = contentType.includes('html') ? stripHtml(raw) : raw
    const truncatedChars = text.length > MAX_OUT_CHARS
    if (truncatedChars) text = text.slice(0, MAX_OUT_CHARS) + '\n\n…[truncated]…'

    return {
      url: input.url,
      finalUrl,
      status: response.status,
      contentType,
      bytes: buf.byteLength,
      content: text,
      truncated: truncatedBytes || truncatedChars,
      durationMs: Date.now() - t0,
    }
  },
}

registerTool(tool as ToolDef<unknown, unknown>)
