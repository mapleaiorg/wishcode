/**
 * MCP tools — bridge the LLM to Model Context Protocol servers.
 *
 * Rather than dynamically registering one proxy tool per MCP tool (which
 * can explode tool count and desync on reconnect), we expose a stable
 * 4-tool surface:
 *
 *   mcp_server_list    — enumerate connected MCP servers
 *   mcp_tool_list      — enumerate tools exposed by those servers
 *   mcp_tool_call      — call a specific MCP tool by (server, tool)
 *   mcp_resource_list  — enumerate resources
 *   mcp_resource_read  — read a resource by URI
 *
 * Config lives at ~/.wishcode/mcp.json.
 */

import { registerTool, type ToolDef } from './registry.js'
import {
  callMcpTool,
  listAllResources,
  listAllTools,
  listServers,
  readMcpResource,
} from '../mcp/manager.js'

registerTool({
  name: 'mcp_server_list',
  title: 'List MCP servers',
  description:
    'List connected MCP servers and their status. Reads ~/.wishcode/mcp.json on first call.',
  category: 'mcp',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    const servers = await listServers()
    return {
      count: servers.length,
      servers: servers.map((s) => ({
        id: s.id,
        status: s.status,
        error: s.error,
        serverInfo: s.serverInfo,
        protocolVersion: s.protocolVersion,
        toolCount: s.tools.length,
        resourceCount: s.resources.length,
      })),
    }
  },
} as ToolDef<unknown, unknown>)

registerTool({
  name: 'mcp_tool_list',
  title: 'List MCP tools',
  description: 'List tools exposed by every connected MCP server, with their input schemas.',
  category: 'mcp',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      server: { type: 'string', description: 'Filter to one server id.' },
    },
  },
  async handler(input: { server?: string }) {
    const all = await listAllTools()
    const filtered = input.server ? all.filter((t) => t.server === input.server) : all
    return { count: filtered.length, tools: filtered }
  },
} as ToolDef<{ server?: string }, unknown> as ToolDef<unknown, unknown>)

interface CallInput {
  server: string
  tool: string
  arguments?: Record<string, unknown>
}

registerTool({
  name: 'mcp_tool_call',
  title: 'Call MCP tool',
  description:
    'Invoke a tool on a connected MCP server. Use `mcp_tool_list` first to discover ' +
    'what is available and what arguments the tool expects.',
  category: 'mcp',
  permission: 'ask',
  inputSchema: {
    type: 'object',
    properties: {
      server: { type: 'string', description: 'Server id from mcp.json.' },
      tool: { type: 'string', description: 'Tool name as reported by mcp_tool_list.' },
      arguments: { type: 'object', description: 'JSON arguments for the tool.' },
    },
    required: ['server', 'tool'],
  },
  async handler(input: CallInput) {
    const result = await callMcpTool(input.server, input.tool, input.arguments ?? {})
    return { server: input.server, tool: input.tool, result }
  },
} as ToolDef<CallInput, unknown> as ToolDef<unknown, unknown>)

registerTool({
  name: 'mcp_resource_list',
  title: 'List MCP resources',
  description: 'List resources exposed by every connected MCP server.',
  category: 'mcp',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { server: { type: 'string', description: 'Filter to one server id.' } },
  },
  async handler(input: { server?: string }) {
    const all = await listAllResources()
    const filtered = input.server ? all.filter((r) => r.server === input.server) : all
    return { count: filtered.length, resources: filtered }
  },
} as ToolDef<{ server?: string }, unknown> as ToolDef<unknown, unknown>)

interface ReadResourceInput {
  server: string
  uri: string
}

registerTool({
  name: 'mcp_resource_read',
  title: 'Read MCP resource',
  description: 'Read an MCP resource by (server, uri). URIs come from `mcp_resource_list`.',
  category: 'mcp',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      server: { type: 'string' },
      uri: { type: 'string' },
    },
    required: ['server', 'uri'],
  },
  async handler(input: ReadResourceInput) {
    const result = await readMcpResource(input.server, input.uri)
    return { server: input.server, uri: input.uri, result }
  },
} as ToolDef<ReadResourceInput, unknown> as ToolDef<unknown, unknown>)
