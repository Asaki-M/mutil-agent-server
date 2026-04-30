import type {
  RoomConversationOptions,
  RoomEvent,
  RoomEventListener,
  RoomMessageRecord,
  RoomReplyRecord,
  RoomStatusEvent,
} from '../model/room'
import type { SubAgentOptions } from '../model/subAgent'
import { EventEmitter } from 'node:events'
import { clearRoomState, loadRoomState, saveRoomState } from './persistence'
import { SubAgent } from './subAgent'

const ROOM_EVENT = 'room_event'

function hasText(value?: string): value is string {
  return value != null && value !== ''
}

function createRoomEventId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function createTimestamp(): string {
  return new Date().toISOString()
}

function buildAgentPrompt(
  message: string,
  fromAgentName?: string,
  round = 1,
): string {
  if (!hasText(fromAgentName)) {
    return message
  }

  return [
    '你正在当前协作会话中与其他 agent 配合。',
    `当前是第 ${round} 轮交流。`,
    `来自 "${fromAgentName}" 的消息：`,
    message,
  ].join('\n\n')
}

function buildRelayPrompt(
  replies: RoomReplyRecord[],
  round: number,
): string {
  return [
    '你正在当前协作会话中与其他 agent 配合。',
    `当前是第 ${round} 轮交流。`,
    '以下是其他 agent 上一轮的真实回复，请你综合这些上下文后继续自然回应。',
    '你可以明确回应某个 agent 的观点，例如“我不同意 Mika 的说法”或“我赞同 Luna”。',
    '如果你确实不同意，可以自然反驳或争论；如果你赞同，也可以补充理由。',
    '要求：保持你自己的角色设定，不要复读，不要暴露系统编排信息，语气像真实群聊。',
    ...replies.map(reply => `agent "${reply.agentName}"：\n${reply.text}`),
  ].join('\n\n')
}

export class Room {
  private readonly agents = new Map<string, SubAgent>()
  private readonly events: RoomEvent[] = []
  private readonly emitter = new EventEmitter()
  // 串行执行会话，避免多次 /messages 请求同时改写同一个 room 状态。
  private workflowQueue = Promise.resolve()
  private persistenceQueue = Promise.resolve()
  private readonly restoreTask: Promise<void>

  constructor() {
    this.restoreTask = this.restore()
  }

  async ready(): Promise<void> {
    await this.restoreTask
  }

  createAgent(options: SubAgentOptions): SubAgent {
    const agent = new SubAgent(options)
    if (this.agents.has(agent.name)) {
      throw new Error(`Agent "${agent.name}" already exists`)
    }

    this.agents.set(agent.name, agent)
    this.recordStatusEvent('agent_added', `Agent "${agent.name}" added`)
    return agent
  }

  removeAgent(agentName: string): boolean {
    const removed = this.agents.delete(agentName)

    if (removed) {
      this.recordStatusEvent('agent_removed', `Agent "${agentName}" removed`)
    }

    return removed
  }

  async clearRecords(): Promise<void> {
    this.workflowQueue = this.workflowQueue
      .catch(() => undefined)
      .then(async () => {
        await this.ready()
        this.agents.clear()
        this.events.length = 0
        await this.enqueuePersistence(async () => clearRoomState())

        this.emitter.emit(ROOM_EVENT, {
          id: createRoomEventId('room_status'),
          type: 'status',
          event: 'records_cleared',
          detail: 'All room records cleared',
          timestamp: createTimestamp(),
        } satisfies RoomStatusEvent)
      })

    await this.workflowQueue
  }

  listAgents(): SubAgent[] {
    return [...this.agents.values()]
  }

  listAgentNames(): string[] {
    return [...this.agents.keys()]
  }

  getEvents(): RoomEvent[] {
    return [...this.events]
  }

  subscribe(listener: RoomEventListener): () => void {
    const eventListener = (event: RoomEvent) => {
      Promise.resolve(listener(event)).catch(() => undefined)
    }

    this.emitter.on(ROOM_EVENT, eventListener)

    return () => {
      this.emitter.off(ROOM_EVENT, eventListener)
    }
  }

  async enqueueConversation(options: RoomConversationOptions): Promise<void> {
    // 新会话接在上一段会话后面；上一段失败也不阻塞后续会话。
    this.workflowQueue = this.workflowQueue
      .catch(() => undefined)
      .then(async () => this.runConversation(options))

    await this.workflowQueue
  }

  private async runConversation(options: RoomConversationOptions): Promise<void> {
    const from = this.getSenderName(options.fromAgentName)
    const maxRounds = this.normalizeMaxRounds(options.maxRounds)
    const agents = this.listAgents()

    if (agents.length === 0) {
      throw new Error('No agents available in room')
    }

    this.recordStatusEvent(
      'conversation_started',
      `Conversation started by "${from}" with ${agents.length} agents`,
    )

    try {
      let roundReplies: RoomReplyRecord[] = []

      for (let round = 1; round <= maxRounds; round += 1) {
        const nextReplies: RoomReplyRecord[] = []

        if (round === 1) {
          // 第一轮：用户消息对外只展示一次，然后并行投递给每个 agent 独立处理。
          this.recordMessage({
            from,
            to: 'all',
            message: options.message,
            round,
            trigger: 'user',
          })

          const replies = await Promise.all(agents.map(async agent => this.sendToAgent(agent, {
            from,
            message: options.message,
            config: options.config,
            round,
            trigger: 'user',
          })))

          nextReplies.push(...replies)
        }
        else {
          // 后续轮次：每个 agent 只收到一次上一轮其他 agent 的汇总，避免三人以上交叉转发爆炸。
          for (const agent of agents) {
            const otherReplies = roundReplies.filter(reply => reply.agentName !== agent.name)

            if (otherReplies.length === 0) {
              continue
            }

            const reply = await this.sendToAgent(agent, {
              from: 'agents',
              contextFrom: otherReplies.map(reply => reply.agentName),
              message: otherReplies.map(reply => reply.text).join('\n\n'),
              promptMessage: buildRelayPrompt(otherReplies, round),
              config: options.config,
              round,
              trigger: 'agent',
            })

            nextReplies.push(reply)
          }
        }

        if (nextReplies.length === 0) {
          break
        }

        roundReplies = nextReplies
      }

      this.recordStatusEvent(
        'conversation_completed',
        `Conversation completed after ${maxRounds} rounds`,
      )
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown room error'
      this.recordStatusEvent('conversation_failed', message)
      throw error
    }
  }

  private async sendToAgent(
    targetAgent: SubAgent,
    options: {
      from: string
      contextFrom?: string[]
      message: string
      promptMessage?: string
      config?: RoomConversationOptions['config']
      round: number
      trigger: RoomMessageRecord['trigger']
    },
  ): Promise<RoomReplyRecord> {
    // 这里不记录 message 事件，避免前端看到 room 内部 fan-out 的重复投递。
    // 前端只需要看到用户原始消息和每个 agent 的真实回复。
    const reply = await targetAgent.sendText({
      message: options.promptMessage ?? buildAgentPrompt(options.message, options.from, options.round),
      config: options.config,
    })

    return this.recordReply({
      from: options.from,
      to: targetAgent.name,
      contextFrom: options.contextFrom,
      agentName: reply.agentName,
      text: reply.text,
      response: reply.response,
      round: options.round,
      trigger: options.trigger,
    })
  }

  private normalizeMaxRounds(maxRounds?: number): number {
    if (maxRounds == null || Number.isNaN(maxRounds)) {
      return 3
    }

    return Math.min(Math.max(maxRounds, 1), 3)
  }

  private getSenderName(fromAgentName?: string): string {
    return hasText(fromAgentName) ? fromAgentName : 'user'
  }

  private recordMessage(
    event: Omit<RoomMessageRecord, 'id' | 'timestamp' | 'type'>,
  ): RoomMessageRecord {
    return this.saveEvent({
      ...event,
      id: createRoomEventId('room_message'),
      type: 'message',
      timestamp: createTimestamp(),
    })
  }

  private recordReply(
    event: Omit<RoomReplyRecord, 'id' | 'timestamp' | 'type'>,
  ): RoomReplyRecord {
    return this.saveEvent({
      ...event,
      id: createRoomEventId('room_reply'),
      type: 'reply',
      timestamp: createTimestamp(),
    })
  }

  private recordStatusEvent(
    event: RoomStatusEvent['event'],
    detail: string,
  ): RoomStatusEvent {
    return this.saveEvent({
      id: createRoomEventId('room_status'),
      type: 'status',
      event,
      detail,
      timestamp: createTimestamp(),
    })
  }

  private saveEvent<T extends RoomEvent>(event: T): T {
    this.events.push(event)
    // SSE 订阅者会在这里实时收到 status/message/reply。
    this.emitter.emit(ROOM_EVENT, event)
    this.persist()
    return event
  }

  private async restore(): Promise<void> {
    const state = await loadRoomState()

    if (state == null) {
      return
    }

    for (const agentState of state.agents) {
      const agent = SubAgent.fromSnapshot(agentState)
      this.agents.set(agent.name, agent)
    }

    this.events.push(...state.events)
  }

  private persist(): void {
    void this.enqueuePersistence(async () => saveRoomState({
      version: 1,
      updatedAt: createTimestamp(),
      agents: this.listAgents().map(agent => agent.toSnapshot()),
      events: this.getEvents(),
    })).catch((error: unknown) => {
      console.error('Failed to persist room state', error)
    })
  }

  private async enqueuePersistence(task: () => Promise<void>): Promise<void> {
    this.persistenceQueue = this.persistenceQueue
      .catch(() => undefined)
      .then(task)

    await this.persistenceQueue
  }
}

// 当前服务只维护这一个全局房间实例。
const room = new Room()

export { room }
