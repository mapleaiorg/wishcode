/**
 * SSE / NDJSON line-reader shared by every adapter.
 *
 * Mirrors the helper in `electron/native/llm/chat.ts` (deliberately —
 * A-1 doesn't yet delete that file; A-2/A-3 swap consumers later).
 * This version returns an async iterator so adapters compose cleanly
 * with `for await`.
 */

export async function* readLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const reader = body.getReader()
  const dec = new TextDecoder('utf-8')
  let buf = ''
  try {
    while (true) {
      if (signal?.aborted) return
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        yield line
      }
    }
    if (buf.trim()) yield buf
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* already released */
    }
  }
}

/**
 * Build a ReadableStream from a string array — used by tests to feed
 * synthetic provider chunks through the adapter without a real fetch.
 */
export function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (i >= chunks.length) {
        ctrl.close()
        return
      }
      ctrl.enqueue(enc.encode(chunks[i]!))
      i++
    },
  })
}
