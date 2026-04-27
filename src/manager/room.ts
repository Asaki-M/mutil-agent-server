import type {
  RoomConversationOptions,
  RoomEvent,
  RoomEventListener,
  RoomMessageRecord,
  RoomReplyRecord,
  RoomStatusEvent,
} from '../model/room'
import type { SubAgentOptions } from '../model/subAgent'
import { SubAgent } from './subAgent'

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
  sourceAgentName: string,
  message: string,
  round: number,
): string {
  return [
    '你正在当前协作会话中与其他 agent 配合。',
    `当前是第 ${round} 轮交流。`,
    `以下是 agent "${sourceAgentName}" 刚刚的真实回复，请你继续自然回应。`,
    '要求：保持你自己的角色设定，不要复读，不要暴露系统编排信息，语气像真实对话。',
    message,
  ].join('\n\n')
}

export class Room {
  private readonly agents = new Map<string, SubAgent>()
  private readonly events: RoomEvent[] = []
  private readonly listeners = new Set<RoomEventListener>()
  private workflowQueue = Promise.resolve()

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
      let roundReplies: RoomReplyRecord[] = []

      for (let round = 1; round <= maxRounds; round += 1) {
        const nextReplies: RoomReplyRecord[] = []

        if (round === 1) {
          // 用户消息只对外记录一次，后续发给各个 agent 属于 room 内部投递。
          this.recordMessage({
            from,
            to: 'all',
            message: options.message,
            round,
            trigger: 'user',
          })

          for (const agent of agents) {
            if (agent.name === from) {
              continue
            }

            const reply = await this.sendToAgent(agent, {
              from,
              message: options.message,
              config: options.config,
              round,
              trigger: 'user',
            })

            nextReplies.push(reply)
          }
        }
        else {
          for (const sourceReply of roundReplies) {
            for (const agent of agents) {
              if (agent.name === sourceReply.agentName) {
                continue
              }

              const reply = await this.sendToAgent(agent, {
                from: sourceReply.agentName,
                message: sourceReply.text,
                promptMessage: buildRelayPrompt(sourceReply.agentName, sourceReply.text, round),
                config: options.config,
                round,
                trigger: 'agent',
              })

              nextReplies.push(reply)
            }
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
      message: string
      promptMessage?: string
      config?: RoomConversationOptions['config']
      round: number
      trigger: RoomMessageRecord['trigger']
    },
  ): Promise<RoomReplyRecord> {
    const reply = await targetAgent.sendText({
      message: options.promptMessage ?? buildAgentPrompt(options.message, options.from, options.round),
      config: options.config,
    })

    return this.recordReply({
      from: options.from,
      to: targetAgent.name,
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
    this.notifyListeners(event)
    return event
  }

  private notifyListeners(event: RoomEvent): void {
    for (const listener of this.listeners) {
      Promise.resolve(listener(event)).catch(() => undefined)
    }
  }
}

// 当前服务只维护这一个全局房间实例。
const room = new Room()

export { room }
