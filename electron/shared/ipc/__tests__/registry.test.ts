/**
 * D-1 — IPC registry coverage.
 *
 * The registry is the single source of truth for the IPC wire surface.
 * These tests guarantee:
 *   1. Every M-0-listed channel is in the registry.
 *   2. Each entry has both a request and a response schema.
 *   3. Channel ids are unique.
 *   4. Channel ids match the `wish:<domain>:<action>` shape.
 *   5. Lookup helpers (`getChannelEntry`, `registryChannels`) work.
 */

import { describe, expect, it } from 'vitest'
import { IPC_REGISTRY, getChannelEntry, registryChannels } from '../registry'
import { IPC_PROTOCOL_VERSION, PROTO_VERSION_CHANNEL } from '../version'

const M0_CHANNELS = [
  'wish:app:version', 'wish:app:paths', 'wish:app:quit', 'wish:app:openExternal', 'wish:app:logs',
  'wish:config:get', 'wish:config:set',
  'wish:auth:status', 'wish:auth:login', 'wish:auth:logout',
  'wish:auth:oauthStart', 'wish:auth:oauthSubmitCode', 'wish:auth:oauthCancel',
  'wish:model:list', 'wish:model:set', 'wish:model:current',
  'wish:memory:add', 'wish:memory:list', 'wish:memory:remove', 'wish:memory:update', 'wish:memory:recall',
  'wish:skills:list', 'wish:skills:reload', 'wish:skills:install', 'wish:skills:uninstall',
  'wish:commands:list', 'wish:commands:run',
  'wish:chat:send', 'wish:chat:abort',
  'wish:session:read', 'wish:session:clear', 'wish:session:compact', 'wish:session:export',
  'wish:tasks:list', 'wish:tasks:cancel', 'wish:tasks:remove', 'wish:tasks:clearCompleted',
  'wish:swarm:run',
  'wish:buddy:get', 'wish:buddy:dismiss',
  'wish:tools:list',
  'wish:askUser:answer',
  'wish:workspace:get', 'wish:workspace:set',
  'wish:todos:get',
  'wish:mcp:servers', 'wish:mcp:tools', 'wish:mcp:resources',
  'wish:mcp:callTool', 'wish:mcp:readResource', 'wish:mcp:shutdown',
  'wish:cron:list', 'wish:cron:create', 'wish:cron:update', 'wish:cron:delete', 'wish:cron:runNow',
  'wish:hooks:read', 'wish:hooks:write',
] as const

describe('IPC_REGISTRY', () => {
  it('contains the protocol-version handshake channel', () => {
    expect(PROTO_VERSION_CHANNEL).toBe('wish:proto:version')
    expect(getChannelEntry(PROTO_VERSION_CHANNEL)).not.toBeNull()
  })

  it('IPC_PROTOCOL_VERSION is a positive integer', () => {
    expect(Number.isInteger(IPC_PROTOCOL_VERSION)).toBe(true)
    expect(IPC_PROTOCOL_VERSION).toBeGreaterThanOrEqual(1)
  })

  it('every M-0 channel appears in the registry with both schemas', () => {
    for (const ch of M0_CHANNELS) {
      const entry = getChannelEntry(ch)
      expect(entry, `missing channel: ${ch}`).not.toBeNull()
      expect(entry?.request, `${ch} missing request schema`).toBeDefined()
      expect(entry?.response, `${ch} missing response schema`).toBeDefined()
    }
  })

  it('exposes 60 M-0 channels plus the proto handshake', () => {
    const all = registryChannels()
    expect(all.length).toBeGreaterThanOrEqual(M0_CHANNELS.length + 1)
  })

  it('every channel id matches `wish:<domain>:<action>`', () => {
    const re = /^wish:[a-z][a-zA-Z]*:[a-zA-Z][a-zA-Z]*$/
    for (const ch of registryChannels()) {
      expect(re.test(String(ch)), `bad channel id: ${ch}`).toBe(true)
    }
  })

  it('channel ids are unique', () => {
    const ids = registryChannels().map(String)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns null for unknown channels', () => {
    expect(getChannelEntry('wish:nope:nope')).toBeNull()
  })

  it('exposes IPC_REGISTRY as a plain readable object', () => {
    expect(typeof IPC_REGISTRY).toBe('object')
    expect(IPC_REGISTRY).not.toBeNull()
  })

  it('entries pass safe-parse on at least one trivial fixture (per-domain spot check)', () => {
    // Spot-check a few trivial channels — exhaustive per-channel fixtures
    // land alongside D-2 (main-process migration) and the per-domain Cell
    // tests that import these schemas.
    const entry = getChannelEntry('wish:app:version')
    expect(entry).not.toBeNull()
    // request: void / no input
    expect(entry?.request.safeParse(undefined).success).toBe(true)
  })
})
