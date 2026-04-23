/**
 * MCP connection manager.
 *
 * Reads `~/.wishcode/mcp.json` — a JSON object mapping server id → launch
 * spec — and maintains live stdio connections. Connections are lazy: the
 * first time any MCP tool is called, we read the config and open
 * connections for every entry whose `disabled` is not `true`.
 *
 * mcp.json shape (same format as Claude Code):
 *   {
 *     "servers": {
 *       "git":       { "command": "uvx", "args": ["mcp-server-git"] },
 *       "sqlite":    { "command": "uvx", "args": ["mcp-server-sqlite"],
 *                      "env": { "SQLITE_DB": "…" } },
 *       "fetch":     { "command": "uvx", "args": ["mcp-server-fetch"] }
 *     }
 *   }
 */

import * as fs from 'fs'
import * as path from 'path'
import { paths } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import { McpClient, type McpServer } from './client.js'

const log = createLogger('mcp/manager')

interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  disabled?: boolean
}

interface McpConfig {
  servers?: Record<string, McpServerConfig>
}

const clients = new Map<string, McpClient>()
let readyPromise: Promise<void> | null = null

function configFile(): string {
  return path.join(paths().configDir, 'mcp.json')
}

function readMcpConfig(): McpConfig {
  try {
    const file = configFile()
    if (!fs.existsSync(file)) return { servers: {} }
    return JSON.parse(fs.readFileSync(file, 'utf8')) as McpConfig
  } catch (e) {
    log.warn('mcp.json parse failed', { err: (e as Error).message })
    return { servers: {} }
  }
}

export async function ensureConnected(): Promise<void> {
  if (readyPromise) return readyPromise
  readyPromise = (async () => {
    const cfg = readMcpConfig()
    const entries = Object.entries(cfg.servers ?? {}).filter(([, s]) => !s.disabled)
    if (entries.length === 0) return
    await Promise.allSettled(
      entries.map(async ([id, s]) => {
        const client = new McpClient({
          id,
          command: s.command,
          args: s.args,
          env: s.env,
          cwd: s.cwd,
        })
        try {
          await client.connect()
          clients.set(id, client)
          log.info(`mcp[${id}] ready`, { tools: client.tools.length, resources: client.resources.length })
        } catch (e) {
          log.warn(`mcp[${id}] failed`, { err: (e as Error).message })
        }
      }),
    )
  })()
  return readyPromise
}

export async function listServers(): Promise<McpServer[]> {
  await ensureConnected()
  return [...clients.values()].map((c) => c.snapshot())
}

export async function listAllTools(): Promise<Array<{ server: string; tool: string; description?: string; inputSchema?: any }>> {
  await ensureConnected()
  const out: Array<{ server: string; tool: string; description?: string; inputSchema?: any }> = []
  for (const [id, client] of clients) {
    for (const t of client.tools) {
      out.push({ server: id, tool: t.name, description: t.description, inputSchema: t.inputSchema })
    }
  }
  return out
}

export async function listAllResources(): Promise<Array<{ server: string; uri: string; name?: string; mimeType?: string }>> {
  await ensureConnected()
  const out: Array<{ server: string; uri: string; name?: string; mimeType?: string }> = []
  for (const [id, client] of clients) {
    for (const r of client.resources) {
      out.push({ server: id, uri: r.uri, name: r.name, mimeType: r.mimeType })
    }
  }
  return out
}

export async function callMcpTool(server: string, toolName: string, args: any): Promise<any> {
  await ensureConnected()
  const client = clients.get(server)
  if (!client) throw new Error(`mcp server "${server}" not connected`)
  if (client.status !== 'ready') throw new Error(`mcp server "${server}" not ready (${client.status}: ${client.error ?? ''})`)
  return client.callTool(toolName, args)
}

export async function readMcpResource(server: string, uri: string): Promise<any> {
  await ensureConnected()
  const client = clients.get(server)
  if (!client) throw new Error(`mcp server "${server}" not connected`)
  return client.readResource(uri)
}

export function shutdownAll(): void {
  for (const c of clients.values()) c.close()
  clients.clear()
  readyPromise = null
}
