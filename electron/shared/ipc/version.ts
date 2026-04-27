/**
 * Wish Code IPC Protocol — version constant.
 *
 * Bump on any breaking change to channel inputs, outputs, or error shapes.
 * Renderer and main negotiate via `wish:proto:version` on connect; mismatch
 * surfaces a banner in the shell rather than crashing the renderer.
 */

export const IPC_PROTOCOL_VERSION = 1 as const
export type IpcProtocolVersion = typeof IPC_PROTOCOL_VERSION

/** Reserved internal channel for the version handshake. */
export const PROTO_VERSION_CHANNEL = 'wish:proto:version' as const
