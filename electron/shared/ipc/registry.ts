/**
 * Wish Code IPC — channel registry.
 *
 * Single map from every `wish:<domain>:<action>` channel id to its
 * `{ request, response }` Zod schema pair. The preload bridge consumes
 * this to validate every wire response before resolving the renderer
 * promise; tests consume it to assert coverage.
 *
 * Adding a new channel? (1) define request + response schemas in
 * `schemas/<domain>.ts`, (2) add a row here, (3) add a renderer call
 * site or test, (4) bump `IPC_PROTOCOL_VERSION` if the wire shape of
 * an existing channel changes.
 */

import type { ZodTypeAny } from 'zod'

import { PROTO_VERSION_CHANNEL } from './version'

import * as App from './schemas/app'
import * as AskUser from './schemas/askUser'
import * as Auth from './schemas/auth'
import * as Buddy from './schemas/buddy'
import * as Chat from './schemas/chat'
import * as Commands from './schemas/commands'
import * as Config from './schemas/config'
import * as Cron from './schemas/cron'
import * as Hooks from './schemas/hooks'
import * as Mcp from './schemas/mcp'
import * as Memory from './schemas/memory'
import * as Model from './schemas/model'
import * as Proto from './schemas/proto'
import * as Session from './schemas/session'
import * as Skills from './schemas/skills'
import * as Swarm from './schemas/swarm'
import * as Tasks from './schemas/tasks'
import * as Todos from './schemas/todos'
import * as Tools from './schemas/tools'
import * as Workspace from './schemas/workspace'

export interface IpcRegistryEntry {
  request: ZodTypeAny
  response: ZodTypeAny
}

/**
 * Frozen, exhaustive map of every wire channel. Keys are the literal
 * channel ids passed to `ipcRenderer.invoke()` / `ipcMain.handle()`.
 */
export const IPC_REGISTRY = {
  // proto handshake
  [PROTO_VERSION_CHANNEL]: { request: Proto.ProtoVersionInput, response: Proto.ProtoVersionOutput },

  // app (5)
  [App.AppChannels.version]: { request: App.AppVersionInput, response: App.AppVersionOutput },
  [App.AppChannels.paths]: { request: App.AppPathsInput, response: App.AppPathsOutput },
  [App.AppChannels.quit]: { request: App.AppQuitInput, response: App.AppQuitOutput },
  [App.AppChannels.openExternal]: { request: App.AppOpenExternalInput, response: App.AppOpenExternalOutput },
  [App.AppChannels.logs]: { request: App.AppLogsInput, response: App.AppLogsOutput },

  // config (2)
  [Config.ConfigChannels.get]: { request: Config.ConfigGetInput, response: Config.ConfigGetOutput },
  [Config.ConfigChannels.set]: { request: Config.ConfigSetInput, response: Config.ConfigSetOutput },

  // auth (6)
  [Auth.AuthChannels.status]: { request: Auth.AuthStatusInput, response: Auth.AuthStatusOutput },
  [Auth.AuthChannels.login]: { request: Auth.AuthLoginInput, response: Auth.AuthLoginOutput },
  [Auth.AuthChannels.logout]: { request: Auth.AuthLogoutInput, response: Auth.AuthLogoutOutput },
  [Auth.AuthChannels.oauthStart]: { request: Auth.AuthOAuthStartInput, response: Auth.AuthOAuthStartOutput },
  [Auth.AuthChannels.oauthSubmitCode]: { request: Auth.AuthOAuthSubmitCodeInput, response: Auth.AuthOAuthSubmitCodeOutput },
  [Auth.AuthChannels.oauthCancel]: { request: Auth.AuthOAuthCancelInput, response: Auth.AuthOAuthCancelOutput },

  // model (3)
  [Model.ModelChannels.list]: { request: Model.ModelListInput, response: Model.ModelListOutput },
  [Model.ModelChannels.set]: { request: Model.ModelSetInput, response: Model.ModelSetOutput },
  [Model.ModelChannels.current]: { request: Model.ModelCurrentInput, response: Model.ModelCurrentOutput },

  // memory (5)
  [Memory.MemoryChannels.add]: { request: Memory.MemoryAddInput, response: Memory.MemoryAddOutput },
  [Memory.MemoryChannels.list]: { request: Memory.MemoryListInput, response: Memory.MemoryListOutput },
  [Memory.MemoryChannels.remove]: { request: Memory.MemoryRemoveInput, response: Memory.MemoryRemoveOutput },
  [Memory.MemoryChannels.update]: { request: Memory.MemoryUpdateInput, response: Memory.MemoryUpdateOutput },
  [Memory.MemoryChannels.recall]: { request: Memory.MemoryRecallInput, response: Memory.MemoryRecallOutput },

  // skills (4)
  [Skills.SkillsChannels.list]: { request: Skills.SkillsListInput, response: Skills.SkillsListOutput },
  [Skills.SkillsChannels.reload]: { request: Skills.SkillsReloadInput, response: Skills.SkillsReloadOutput },
  [Skills.SkillsChannels.install]: { request: Skills.SkillsInstallInput, response: Skills.SkillsInstallOutput },
  [Skills.SkillsChannels.uninstall]: { request: Skills.SkillsUninstallInput, response: Skills.SkillsUninstallOutput },

  // commands (2)
  [Commands.CommandsChannels.list]: { request: Commands.CommandsListInput, response: Commands.CommandsListOutput },
  [Commands.CommandsChannels.run]: { request: Commands.CommandsRunInput, response: Commands.CommandsRunOutput },

  // chat (2)
  [Chat.ChatChannels.send]: { request: Chat.ChatSendInput, response: Chat.ChatSendOutput },
  [Chat.ChatChannels.abort]: { request: Chat.ChatAbortInput, response: Chat.ChatAbortOutput },

  // session (4)
  [Session.SessionChannels.read]: { request: Session.SessionReadInput, response: Session.SessionReadOutput },
  [Session.SessionChannels.clear]: { request: Session.SessionClearInput, response: Session.SessionClearOutput },
  [Session.SessionChannels.compact]: { request: Session.SessionCompactInput, response: Session.SessionCompactOutput },
  [Session.SessionChannels.export]: { request: Session.SessionExportInput, response: Session.SessionExportOutput },

  // tasks (4)
  [Tasks.TasksChannels.list]: { request: Tasks.TasksListInput, response: Tasks.TasksListOutput },
  [Tasks.TasksChannels.cancel]: { request: Tasks.TasksCancelInput, response: Tasks.TasksCancelOutput },
  [Tasks.TasksChannels.remove]: { request: Tasks.TasksRemoveInput, response: Tasks.TasksRemoveOutput },
  [Tasks.TasksChannels.clearCompleted]: { request: Tasks.TasksClearCompletedInput, response: Tasks.TasksClearCompletedOutput },

  // swarm (1)
  [Swarm.SwarmChannels.run]: { request: Swarm.SwarmRunInput, response: Swarm.SwarmRunOutput },

  // buddy (2)
  [Buddy.BuddyChannels.get]: { request: Buddy.BuddyGetInput, response: Buddy.BuddyGetOutput },
  [Buddy.BuddyChannels.dismiss]: { request: Buddy.BuddyDismissInput, response: Buddy.BuddyDismissOutput },

  // tools (1)
  [Tools.ToolsChannels.list]: { request: Tools.ToolsListInput, response: Tools.ToolsListOutput },

  // askUser (1)
  [AskUser.AskUserChannels.answer]: { request: AskUser.AskUserAnswerInput, response: AskUser.AskUserAnswerOutput },

  // workspace (2)
  [Workspace.WorkspaceChannels.get]: { request: Workspace.WorkspaceGetInput, response: Workspace.WorkspaceGetOutput },
  [Workspace.WorkspaceChannels.set]: { request: Workspace.WorkspaceSetInput, response: Workspace.WorkspaceSetOutput },

  // todos (1)
  [Todos.TodosChannels.get]: { request: Todos.TodosGetInput, response: Todos.TodosGetOutput },

  // mcp (6)
  [Mcp.McpChannels.servers]: { request: Mcp.McpServersInput, response: Mcp.McpServersOutput },
  [Mcp.McpChannels.tools]: { request: Mcp.McpToolsInput, response: Mcp.McpToolsOutput },
  [Mcp.McpChannels.resources]: { request: Mcp.McpResourcesInput, response: Mcp.McpResourcesOutput },
  [Mcp.McpChannels.callTool]: { request: Mcp.McpCallToolInput, response: Mcp.McpCallToolOutput },
  [Mcp.McpChannels.readResource]: { request: Mcp.McpReadResourceInput, response: Mcp.McpReadResourceOutput },
  [Mcp.McpChannels.shutdown]: { request: Mcp.McpShutdownInput, response: Mcp.McpShutdownOutput },

  // cron (5)
  [Cron.CronChannels.list]: { request: Cron.CronListInput, response: Cron.CronListOutput },
  [Cron.CronChannels.create]: { request: Cron.CronCreateInput, response: Cron.CronCreateOutput },
  [Cron.CronChannels.update]: { request: Cron.CronUpdateInput, response: Cron.CronUpdateOutput },
  [Cron.CronChannels.delete]: { request: Cron.CronDeleteInput, response: Cron.CronDeleteOutput },
  [Cron.CronChannels.runNow]: { request: Cron.CronRunNowInput, response: Cron.CronRunNowOutput },

  // hooks (2)
  [Hooks.HooksChannels.read]: { request: Hooks.HooksReadInput, response: Hooks.HooksReadOutput },
  [Hooks.HooksChannels.write]: { request: Hooks.HooksWriteInput, response: Hooks.HooksWriteOutput },
} as const satisfies Record<string, IpcRegistryEntry>

export type IpcChannelId = keyof typeof IPC_REGISTRY

export function registryChannels(): IpcChannelId[] {
  return Object.keys(IPC_REGISTRY) as IpcChannelId[]
}

export function getChannelEntry(channel: string): IpcRegistryEntry | null {
  return (IPC_REGISTRY as Record<string, IpcRegistryEntry>)[channel] ?? null
}
