/**
 * C-7 — CoAgent agent orchestration.
 *
 * Joins family as `orchestration`. Drives an A-2 `AgentRuntime` inside
 * a Task's lifecycle: every run flips the task to `running`, publishes
 * `agent.run.started` + `agent.run.finished` to the bus, and writes
 * the final stop reason back into the task.
 */

import type { AgentRequest, AgentRunOptions, AgentRunResult, AgentRuntime } from '../agent/index.js'
import type { Task, TaskStore } from '../tasks/v2/index.js'
import type { CoAgentBus, CoAgentCore } from './bus.js'
import type { CoAgentMember, JoinResult } from './types.js'

export interface OrchestrateOptions {
  agentRunOptions?: AgentRunOptions
  /** Author tag — `agent:<id>` or `cell:<id>`. */
  author?: string
}

export interface OrchestrationResult {
  task: Task
  runResult: AgentRunResult
}

export class CoAgentAgentOrchestration {
  private join: JoinResult | null = null
  private readonly bus: CoAgentBus
  private inFlight = new Set<string>()

  constructor(
    public readonly agent: AgentRuntime,
    public readonly tasks: TaskStore,
    coreOrBus: CoAgentCore | CoAgentBus,
  ) {
    this.bus = 'bus' in coreOrBus ? coreOrBus.bus : coreOrBus
  }

  attach(): void {
    if (this.join) return
    const member: CoAgentMember = {
      role: 'orchestration', label: 'CoAgent agent orchestration', subscribes: [],
    }
    this.join = this.bus.join(member, () => {})
  }

  detach(): void {
    if (!this.join) return
    this.join.leave()
    this.join = null
  }

  isAttached(): boolean { return !!this.join }
  inFlightCount(): number { return this.inFlight.size }

  async runForTask(
    taskId: string,
    request: AgentRequest,
    opts: OrchestrateOptions = {},
  ): Promise<OrchestrationResult> {
    const t0 = await this.tasks.getTask(taskId)
    if (!t0) throw new Error(`Orchestration: task not found: ${taskId}`)
    if (this.inFlight.has(taskId)) {
      throw new Error(`Orchestration: task ${taskId} already running`)
    }
    this.inFlight.add(taskId)

    const author = opts.author ?? 'agent:default'
    const startedTask = t0.status === 'queued'
      ? await this.tasks.setTaskStatus(taskId, 'running')
      : t0
    this.publish('agent.run.started', { taskId, author, sessionId: request.sessionId })

    let runResult: AgentRunResult
    try {
      runResult = await this.agent.run(request, opts.agentRunOptions)
    } catch (e) {
      this.inFlight.delete(taskId)
      const failed = await this.tasks.setTaskStatus(taskId, 'failed', {
        code: 'orchestration.threw',
        message: e instanceof Error ? e.message : String(e),
      })
      this.publish('agent.run.finished', { taskId, stopReason: 'error', author })
      return {
        task: failed,
        runResult: { messages: request.messages, stopReason: 'error', turns: 0 },
      }
    }

    let nextTask: Task = startedTask
    if (runResult.stopReason === 'completed') {
      nextTask = await this.tasks.setTaskStatus(taskId, 'succeeded')
    } else if (
      runResult.stopReason === 'error' ||
      runResult.stopReason === 'unsupported_tool' ||
      runResult.stopReason === 'max_turns'
    ) {
      nextTask = await this.tasks.setTaskStatus(taskId, 'failed', {
        code: `orchestration.${runResult.stopReason}`,
        message: runResult.error?.message ?? runResult.stopReason,
      })
    } else if (runResult.stopReason === 'cancelled') {
      nextTask = await this.tasks.setTaskStatus(taskId, 'cancelled')
    }
    this.inFlight.delete(taskId)
    this.publish('agent.run.finished', {
      taskId,
      stopReason: runResult.stopReason,
      turns: runResult.turns,
      author,
    })
    return { task: nextTask, runResult }
  }

  private publish(
    kind: 'agent.run.started' | 'agent.run.finished',
    payload: Record<string, string | number>,
  ): void {
    if (!this.join) return
    this.join.publish({ kind, payload })
  }
}
