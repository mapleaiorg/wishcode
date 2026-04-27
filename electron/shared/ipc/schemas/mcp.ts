/**
 * Domain: mcp (Model Context Protocol)
 * Channels: wish:mcp:servers, wish:mcp:tools, wish:mcp:resources,
 *           wish:mcp:callTool, wish:mcp:readResource, wish:mcp:shutdown
 */

import { z } from 'zod'
import { channel } from '../channel'
import { EmptyInputSchema } from '../types/common'

export const McpServerSchema = z.object({
  id: z.string(),
  status: z.enum(['idle', 'connecting', 'ready', 'error', 'closed']).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
}).passthrough()

export const McpToolSchema = z.object({
  server: z.string(),
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.unknown().optional(),
}).passthrough()

export const McpResourceSchema = z.object({
  server: z.string(),
  uri: z.string(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
}).passthrough()

export const McpServersInput = EmptyInputSchema
export const McpServersOutput = z.array(McpServerSchema)

export const McpToolsInput = EmptyInputSchema
export const McpToolsOutput = z.array(McpToolSchema)

export const McpResourcesInput = EmptyInputSchema
export const McpResourcesOutput = z.array(McpResourceSchema)

export const McpCallToolInput = z.object({
  server: z.string().min(1),
  tool: z.string().min(1),
  args: z.unknown().optional(),
})
export const McpCallToolOutput = z.object({
  ok: z.boolean(),
  output: z.unknown().optional(),
  isError: z.boolean().optional(),
}).passthrough()

export const McpReadResourceInput = z.object({
  server: z.string().min(1),
  uri: z.string().min(1),
})
export const McpReadResourceOutput = z.object({
  contents: z.array(z.unknown()).optional(),
}).passthrough()

export const McpShutdownInput = EmptyInputSchema
export const McpShutdownOutput = z.void()

export const McpChannels = {
  servers: channel('mcp', 'servers'),
  tools: channel('mcp', 'tools'),
  resources: channel('mcp', 'resources'),
  callTool: channel('mcp', 'callTool'),
  readResource: channel('mcp', 'readResource'),
  shutdown: channel('mcp', 'shutdown'),
} as const
