import type {
  RoomConversationOptions,
  RoomDirectMessageOptions,
  RoomEvent,
  RoomEventListener,
  RoomMessageRecord,
  RoomOptions,
  RoomReplyRecord,
  RoomStatusEvent,
} from '../model/room'
import type { SubAgentOptions } from '../model/subAgent'
import type { SubAgent } from './subAgent'
import { createSubAgent } from './subAgent'

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

export class Room {
  private readonly agents = new Map<string, SubAgent>()
  private readonly events: RoomEvent[] = []
  private readonly listeners = new Set<RoomEventListener>()
  private workflowQueue = Promise.resolve()

  constructor(options: RoomOptions = {}) {
    for (const agentOptions of options.agents ?? []) {
      this.createAgent(agentOptions)
    }
  }

  addAgent(agent: SubAgent): void {
    this.assertAgentNameAvailable(agent.name)
    this.agents.set(agent.name, agent)
    this.recordStatusEvent('agent_added', `Agent "${agent.name}" added`)
  }

  createAgent(options: SubAgentOptions): SubAgent {
    const agent = createSubAgent(options)
    this.addAgent(agent)
    return agent
  }

  removeAgent(agentName: string): boolean {
    const removed = this.agents.delete(agentName)

    if (removed) {
      this.recordStatusEvent('agent_removed', `Agent "${agentName}" removed`)
    }

    return removed
  }

  hasAgent(agentName: string): boolean {
    return this.agents.has(agentName)
  }

  getAgent(agentName: string): SubAgent {
    const agent = this.agents.get(agentName)

    if (agent == null) {
      throw new Error(`Agent "${agentName}" not found`)
    }

    return agent
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
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  async sendToAgent(options: RoomDirectMessageOptions): Promise<RoomReplyRecord> {
    const from = this.getSenderName(options.fromAgentName)
    const round = options.round ?? 1
    const trigger = options.trigger ?? 'user'
    const targetAgent = this.getAgent(options.toAgentName)

    this.recordMessage({
      from,
      to: targetAgent.name,
      message: options.message,
      round,
      trigger,
    })

    const reply = await targetAgent.sendText({
      message: buildAgentPrompt(options.message, options.fromAgentName, round),
      config: options.config,
    })

    return this.recordReply({
      from,
      to: targetAgent.name,
      agentName: reply.agentName,
      text: reply.text,
      response: reply.response,
      round,
      trigger,
    })
  }

  async enqueueConversation(options: RoomConversationOptions): Promise<void> {
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
      let currentSpeaker = from
      let currentMessage = options.message

      for (let round = 1; round <= maxRounds; round += 1) {
        const replies: RoomReplyRecord[] = []

        for (const agent of agents) {
          if (agent.name === currentSpeaker) {
            continue
          }

          const reply = await this.sendToAgent({
            fromAgentName: currentSpeaker,
            toAgentName: agent.name,
            message: currentMessage,
            config: options.config,
            round,
            trigger: round === 1 ? 'user' : 'agent',
          })

          replies.push(reply)
        }

        if (replies.length === 0) {
          break
        }

        currentSpeaker = replies[0].agentName
        currentMessage = this.buildNextRoundMessage(replies, round)
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

  private buildNextRoundMessage(replies: RoomReplyRecord[], round: number): string {
    const content = replies
      .map(reply => `${reply.agentName}：${reply.text}`)
      .join('\n\n')

    return [
      `以下是第 ${round} 轮其他 agent 的回复，请继续给出你的回应。`,
      content,
    ].join('\n\n')
  }

  private normalizeMaxRounds(maxRounds?: number): number {
    if (maxRounds == null || Number.isNaN(maxRounds)) {
      return 3
    }

    return Math.min(Math.max(maxRounds, 1), 3)
  }

  private assertAgentNameAvailable(agentName: string): void {
    if (this.hasAgent(agentName)) {
      throw new Error(`Agent "${agentName}" already exists`)
    }
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

  // 房间级事件统一落在这里，SSE 和后续持久化都从这里取。
  private saveEvent<T extends RoomEvent>(event: T): T {
    this.events.push(event)
    this.notifyListeners(event)
    return event
  }

  private notifyListeners(event: RoomEvent): void {
    for (const listener of this.listeners) {
      Promise.resolve(listener(event)).catch(() => undefined)
    }
  }
}

export function createRoom(options: RoomOptions = {}): Room {
  return new Room(options)
}

// 当前服务只维护这一个全局房间实例。
const room = createRoom()

export { room }
