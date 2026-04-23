/**
 * Renderer-side mirror of the preload `window.wish` surface.
 *
 * Keep in sync with /electron/preload.ts. The preload is the source of
 * truth; this file is a runtime-safe subset used to type-check the
 * renderer without importing electron.
 */

export type Provider = 'anthropic' | 'openai' | 'xai' | 'gemini' | 'ollama' | 'hermon'

export interface AuthStatusEntry {
  provider: Provider
  authenticated: boolean
  live?: boolean
  info?: Record<string, unknown>
}

export interface AuthStatusResponse {
  configDir: string
  configFile: string
  currentModel: string | null
  providers: {
    anthropic: { configured: boolean; apiKey: string | null; oauth: boolean; email?: string | null }
    openai:    { configured: boolean; apiKey: string | null }
    xai:       { configured: boolean; apiKey: string | null }
    gemini:    { configured: boolean; apiKey: string | null }
    ollama:    { configured: boolean; baseUrl: string; live: boolean }
    hermon:    { configured: boolean; account: { email?: string; accountUuid?: string } | null }
  }
}

export interface ModelEntry {
  provider: Provider
  model: string
  label?: string
  recommended?: boolean
  warning?: string
  rateNote?: string
}

export interface ModelListResponse {
  current: string
  available: ModelEntry[]
}

export interface CurrentModel {
  provider: Provider
  model: string
}

// ── Chat & transcript ---------------------------------------------------

export type Role = 'user' | 'assistant' | 'system' | 'tool'

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string | unknown; is_error?: boolean }

export interface Message {
  id: string
  role: Role
  ts: number
  content: ContentBlock[]
  streaming?: boolean
  error?: string
  model?: string
  provider?: Provider
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt?: number
  pinned?: boolean
  /**
   * Archived conversations are hidden from the main sidebar list but still
   * accessible from the History view. Kept as an optional flag so existing
   * sessions migrate cleanly with undefined = false.
   */
  archived?: boolean
  messages: Message[]
  /**
   * Last model this conversation was run against. When the user reopens
   * an older chat, the app restores this as the active global model so
   * the thread stays consistent with whatever produced its history.
   * `undefined` on new conversations — they adopt whatever the global
   * picker currently points at.
   */
  lastModel?: CurrentModel
}

// ── Memory / skills / commands ------------------------------------------

export interface MemoryEntry {
  id: string
  body: string
  tags?: string[]
  pinned?: boolean
  created: number
  updated?: number
}

export interface SkillInfo {
  name: string
  title: string
  description: string
  version?: string
  author?: string
  source: 'builtin' | 'user'
}

export interface CommandInfo {
  name: string
  summary: string
  category: string
  usage?: string
  aliases: string[]
}

// ── Tasks / buddy -------------------------------------------------------

export interface TaskView {
  id: string
  title: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  progress?: number
  output?: string
  error?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
}

export type BuddyMood =
  | 'idle' | 'thinking' | 'speaking' | 'tooling' | 'smiling'
  | 'worried' | 'alert' | 'working' | 'sleeping'

export interface BuddyNotification {
  id: string
  kind: 'info' | 'success' | 'warn' | 'error'
  text: string
  ts: number
}

export interface BuddyView {
  mood: BuddyMood
  message: string
  notifications: BuddyNotification[]
  intensity: 0 | 1 | 2 | 3
  sinceMs: number
}

// ── The `window.wish` api ---------------------------------------------

type Unsub = () => void

export interface WishApi {
  app: {
    version(): Promise<{ version: string }>
    paths(): Promise<Record<string, string>>
    quit(): Promise<void>
    openExternal(url: string): Promise<void>
    logs(limit?: number): Promise<Array<{ ts: number; level: string; scope: string; msg: string }>>
    onLog(cb: (entry: any) => void): Unsub
  }
  config: {
    get(key?: string): Promise<any>
    set(key: string, value: unknown): Promise<boolean>
  }
  auth: {
    status(): Promise<AuthStatusResponse>
    login(provider: string, creds?: Record<string, unknown>): Promise<any>
    logout(provider: string): Promise<void>
    oauthStart(): Promise<{ manualUrl: string; automaticUrl: string }>
    oauthSubmitCode(code: string): Promise<void>
    oauthCancel(): Promise<void>
    onOAuthComplete(cb: (payload: any) => void): Unsub
  }
  model: {
    list(): Promise<ModelListResponse>
    set(provider: string, name: string): Promise<void>
    current(): Promise<CurrentModel>
    onChanged(cb: (payload: { from: CurrentModel; to: CurrentModel; ts: number }) => void): Unsub
  }
  memory: {
    add(body: string, opts?: { tags?: string[]; pinned?: boolean }): Promise<MemoryEntry>
    list(): Promise<MemoryEntry[]>
    remove(id: string): Promise<boolean>
    update(id: string, patch: Partial<MemoryEntry>): Promise<MemoryEntry | null>
    recall(query: string, limit?: number): Promise<MemoryEntry[]>
    onChanged(cb: () => void): Unsub
  }
  skills: {
    list(): Promise<SkillInfo[]>
    reload(): Promise<SkillInfo[]>
    install(name: string, markdown: string): Promise<SkillInfo>
    uninstall(name: string): Promise<boolean>
  }
  commands: {
    list(): Promise<CommandInfo[]>
    run(sessionId: string, input: string): Promise<any>
  }
  chat: {
    send(sessionId: string, requestId: string, text: string, permission?: string): Promise<any>
    abort(requestId: string): Promise<boolean>
    onDelta(cb: (payload: { requestId: string; text: string }) => void): Unsub
    onThinking(cb: (payload: { requestId: string; text: string }) => void): Unsub
    onToolUse(cb: (payload: any) => void): Unsub
    onToolResult(cb: (payload: any) => void): Unsub
    onDone(cb: (payload: { requestId: string; usage: any; stopReason: string }) => void): Unsub
    onError(cb: (payload: { requestId: string; error: string }) => void): Unsub
    onStatus(cb: (payload: any) => void): Unsub
  }
  session: {
    read(sessionId: string): Promise<any[]>
    clear(sessionId: string): Promise<void>
    compact(sessionId: string, keepRecent?: number): Promise<{ droppedTurns: number; summaryChars: number }>
    export(sessionId: string, fmt: 'markdown' | 'json'): Promise<string>
  }
  tasks: {
    list(): Promise<TaskView[]>
    cancel(id: string): Promise<boolean>
    remove(id: string): Promise<boolean>
    clearCompleted(): Promise<number>
    onUpdate(cb: (payload: { id: string; task: TaskView }) => void): Unsub
    onChanged(cb: (payload: { runningCount: number; total: number }) => void): Unsub
  }
  swarm: {
    run(brief: string): Promise<any>
  }
  buddy: {
    get(): Promise<BuddyView>
    dismiss(id: string): Promise<void>
    onUpdate(cb: (payload: BuddyView) => void): Unsub
  }
  tools: {
    list(): Promise<Array<{
      name: string
      title: string
      description: string
      category: string
      permission: 'auto' | 'ask' | 'plan' | 'bypass'
      dangerous: boolean
      inputSchema: any
    }>>
  }
  askUser: {
    onQuestion(cb: (payload: {
      requestId: string
      sessionId: string
      question: string
      options: string[]
      allowFreeText: boolean
    }) => void): Unsub
    answer(requestId: string, answer: { choice: string; text?: string }): Promise<boolean>
  }
  workspace: {
    get(): Promise<string>
    set(dir: string): Promise<string>
  }
  todos: {
    get(sessionId: string): Promise<Array<{
      content: string
      activeForm: string
      status: 'pending' | 'in_progress' | 'completed'
    }>>
  }
  mcp: {
    servers(): Promise<Array<{
      id: string
      status: 'connecting' | 'ready' | 'error' | 'closed'
      error?: string
      tools: any[]
      resources: any[]
      serverInfo?: { name?: string; version?: string }
      protocolVersion?: string
    }>>
    tools(): Promise<Array<{ server: string; tool: string; description?: string; inputSchema?: any }>>
    resources(): Promise<Array<{ server: string; uri: string; name?: string; mimeType?: string }>>
    callTool(server: string, tool: string, args?: any): Promise<any>
    readResource(server: string, uri: string): Promise<any>
    shutdown(): Promise<void>
  }
  cron: {
    list(): Promise<Array<{
      id: string; name: string; expression: string; prompt: string;
      disabled?: boolean; lastRunAt?: number; lastRunTaskId?: string;
      runCount?: number; createdAt: number;
    }>>
    create(input: { name: string; expression: string; prompt: string }): Promise<any>
    update(id: string, patch: any): Promise<any>
    delete(id: string): Promise<boolean>
    runNow(id: string): Promise<{ taskId: string | null }>
  }
  hooks: {
    read(): Promise<{ file: string; content: string }>
    write(content: string): Promise<{ file: string }>
  }
}

declare global {
  interface Window {
    wish: WishApi
  }
}
