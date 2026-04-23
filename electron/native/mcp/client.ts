/**
 * Minimal stdio MCP client.
 *
 * Speaks JSON-RPC 2.0 over newline-delimited JSON on stdin/stdout of a
 * child process. Implements just enough of Anthropic's Model Context
 * Protocol to cover tools and resources: `initialize`, `tools/list`,
 * `tools/call`, `resources/list`, `resources/read`, plus notification
 * handling for `notifications/*` (ignored for now).
 *
 * Written from scratch — no `@modelcontextprotocol/sdk` dep. The wire
 * format is stable and well-documented enough that pulling in ~20
 * transitive deps was not worth it.
 *
 * Not implemented: HTTP transport, prompts/sampling, progress tokens,
 * elicitation, OAuth headers. Phase 1 supports local stdio servers
 * (git, filesystem, sqlite, fetch, postgres, etc.).
 */

import { spawn, type ChildProcess } from 'child_process'
import { createLogger } from '../core/logger.js'

const log = createLogger('mcp/client')

export interface McpToolDesc {
  name: string
  description?: string
  inputSchema?: Record<string, any>
}

export interface McpResourceDesc {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export interface McpConnectOptions {
  /** Unique identifier (used as prefix in exposed tool names). */
  id: string
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  /** Init timeout — servers that don't respond are killed. */
  initTimeoutMs?: number
}

export interface McpServer {
  id: string
  status: 'connecting' | 'ready' | 'error' | 'closed'
  error?: string
  tools: McpToolDesc[]
  resources: McpResourceDesc[]
  serverInfo?: { name?: string; version?: string }
  protocolVersion?: string
}

const DEFAULT_INIT_TIMEOUT = 15_000
const JSONRPC_PROTOCOL = '2024-11-05'

type JsonRpcRequest = { jsonrpc: '2.0'; id: number; method: string; params?: any }
type JsonRpcNotification = { jsonrpc: '2.0'; method: string; params?: any }
type JsonRpcResponse = { jsonrpc: '2.0'; id: number; result?: any; error?: { code: number; message: string; data?: any } }

interface Pending {
  resolve: (v: any) => void
  reject: (e: Error) => void
  method: string
}

export class McpClient {
  public status: McpServer['status'] = 'connecting'
  public error?: string
  public tools: McpToolDesc[] = []
  public resources: McpResourceDesc[] = []
  public serverInfo?: McpServer['serverInfo']
  public protocolVersion?: string

  private child?: ChildProcess
  private buf = ''
  private nextId = 1
  private pending = new Map<number, Pending>()
  private initTimer?: NodeJS.Timeout
  private readonly opts: McpConnectOptions

  constructor(opts: McpConnectOptions) {
    this.opts = opts
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        if (this.initTimer) clearTimeout(this.initTimer)
        err ? reject(err) : resolve()
      }

      try {
        this.child = spawn(this.opts.command, this.opts.args ?? [], {
          cwd: this.opts.cwd,
          env: { ...process.env, ...(this.opts.env ?? {}) },
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
        return done(e as Error)
      }

      this.child.stdout?.setEncoding('utf8')
      this.child.stderr?.setEncoding('utf8')

      this.child.stdout?.on('data', (chunk: string) => this.onChunk(chunk))
      this.child.stderr?.on('data', (chunk: string) => {
        log.debug(`mcp[${this.opts.id}] stderr`, chunk.trim())
      })
      this.child.on('exit', (code, sig) => {
        this.status = this.status === 'ready' ? 'closed' : 'error'
        if (this.status === 'error' && !this.error) this.error = `exited code=${code} sig=${sig}`
        for (const p of this.pending.values()) p.reject(new Error(`mcp server exited: ${this.error ?? 'closed'}`))
        this.pending.clear()
        done(this.status === 'error' ? new Error(this.error!) : undefined)
      })
      this.child.on('error', (err) => {
        this.status = 'error'
        this.error = err.message
        done(err)
      })

      this.initTimer = setTimeout(() => {
        if (this.status !== 'ready') {
          this.status = 'error'
          this.error = 'init timeout'
          try { this.child?.kill('SIGTERM') } catch {}
          done(new Error('init timeout'))
        }
      }, this.opts.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT)

      // Handshake.
      this.initialize()
        .then(async (res) => {
          this.serverInfo = res.serverInfo
          this.protocolVersion = res.protocolVersion
          this.notify('notifications/initialized')
          const [t, r] = await Promise.all([
            this.call('tools/list').catch(() => ({ tools: [] as McpToolDesc[] })),
            this.call('resources/list').catch(() => ({ resources: [] as McpResourceDesc[] })),
          ])
          this.tools = t.tools ?? []
          this.resources = r.resources ?? []
          this.status = 'ready'
          done()
        })
        .catch(done)
    })
  }

  async initialize(): Promise<{ protocolVersion: string; serverInfo?: any }> {
    const res = await this.call('initialize', {
      protocolVersion: JSONRPC_PROTOCOL,
      capabilities: {},
      clientInfo: { name: 'Wish Code', version: '0.1.0' },
    })
    return res
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.call('tools/call', { name, arguments: args ?? {} })
  }

  async readResource(uri: string): Promise<any> {
    return this.call('resources/read', { uri })
  }

  private call(method: string, params?: any): Promise<any> {
    const id = this.nextId++
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
      this.send(msg)
    })
  }

  private notify(method: string, params?: any): void {
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    this.send(msg)
  }

  private send(msg: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.child?.stdin?.writable) return
    this.child.stdin.write(JSON.stringify(msg) + '\n')
  }

  private onChunk(chunk: string): void {
    this.buf += chunk
    let i: number
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim()
      this.buf = this.buf.slice(i + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        this.handleMessage(msg)
      } catch (err) {
        log.warn(`mcp[${this.opts.id}] malformed`, { line: line.slice(0, 200), err: (err as Error).message })
      }
    }
  }

  private handleMessage(msg: JsonRpcResponse | JsonRpcNotification): void {
    if ('id' in msg && typeof msg.id === 'number') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`))
      else p.resolve(msg.result ?? {})
      return
    }
    // Notification from server — ignore for now. Future: progress, list changes.
  }

  close(): void {
    if (!this.child) return
    try { this.child.kill('SIGTERM') } catch {}
    this.child = undefined
  }

  snapshot(): McpServer {
    return {
      id: this.opts.id,
      status: this.status,
      error: this.error,
      tools: this.tools,
      resources: this.resources,
      serverInfo: this.serverInfo,
      protocolVersion: this.protocolVersion,
    }
  }
}
