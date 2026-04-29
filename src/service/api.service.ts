import type { RoomEvent } from '../model/room'
import { room } from '../manager/room'

interface SseEventPayload {
  data: string
  event?: string
  id?: string
  retry?: number
}

interface CreateAgentInput {
  name: string
  sysPrompt: string
  model?: string
}

interface SendMessageInput {
  message: string
  fromAgentName?: string
  maxRounds?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object'
}

function toOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const text = value.trim()

  return text === '' ? undefined : text
}

// 用缩进后的 JSON，方便直接在终端里看 SSE 输出。
function formatSseData(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

function buildSseEvent(event: string, data: unknown, id?: string): SseEventPayload {
  return {
    event,
    id,
    data: formatSseData(data),
  }
}

function getRoomEventName(event: RoomEvent): string {
  if (event.type === 'status') {
    return event.event
  }

  return event.type
}

function buildRoomEventSse(event: RoomEvent): SseEventPayload {
  return buildSseEvent(getRoomEventName(event), event, event.id)
}

function toAgentResponse(agent: { name: string, sysPrompt: string, model?: string }): CreateAgentInput {
  return {
    name: agent.name,
    sysPrompt: agent.sysPrompt,
    model: agent.model,
  }
}

function listAgents() {
  return {
    agents: room.listAgents().map(toAgentResponse),
  }
}

function createAgent(body: unknown) {
  const input = normalizeAgentInput(body)
  const agent = room.createAgent(input)

  return {
    success: true,
    agent: toAgentResponse(agent),
  }
}

function removeAgent(name: string) {
  const removed = room.removeAgent(name)

  if (!removed) {
    return {
      body: {
        success: false,
        message: `Agent "${name}" not found`,
      },
      status: 404 as const,
    }
  }

  return {
    body: {
      success: true,
      name,
    },
    status: 200 as const,
  }
}

function enqueueMessage(body: unknown) {
  const input = normalizeMessageInput(body)

  void room.enqueueConversation(input)

  return {
    success: true,
    message: 'Conversation queued',
    agentCount: room.listAgentNames().length,
    maxRounds: input.maxRounds ?? 3,
  }
}

function listEvents() {
  return {
    events: room.getEvents(),
  }
}

async function clearRecords() {
  await room.clearRecords()

  return {
    success: true,
  }
}

function buildSseConnectedEvent(): SseEventPayload {
  return buildSseEvent('connected', {
    message: 'SSE connection established',
    agents: room.listAgentNames(),
    eventCount: room.getEvents().length,
  })
}

function getRoomEvents(): RoomEvent[] {
  return room.getEvents()
}

function subscribeRoomEvents(listener: (event: RoomEvent) => void | Promise<void>): () => void {
  return room.subscribe(listener)
}

function normalizeAgentInput(input: unknown): CreateAgentInput {
  if (!isRecord(input)) {
    throw new Error('Invalid agent payload')
  }

  const name = toOptionalText(input.name)
  const sysPrompt = toOptionalText(input.sysPrompt)

  if (name == null || name === '') {
    throw new Error('Agent name is required')
  }

  if (sysPrompt == null || sysPrompt === '') {
    throw new Error('sysPrompt is required')
  }

  return {
    name,
    sysPrompt,
    model: toOptionalText(input.model),
  }
}

function normalizeMessageInput(input: unknown): SendMessageInput {
  if (!isRecord(input)) {
    throw new Error('Invalid message payload')
  }

  const message = toOptionalText(input.message)

  if (message == null || message === '') {
    throw new Error('message is required')
  }

  return {
    message,
    fromAgentName: toOptionalText(input.fromAgentName),
    maxRounds: typeof input.maxRounds === 'number' ? input.maxRounds : undefined,
  }
}

export {
  buildRoomEventSse,
  buildSseConnectedEvent,
  buildSseEvent,
  clearRecords,
  createAgent,
  enqueueMessage,
  getRoomEvents,
  listAgents,
  listEvents,
  removeAgent,
  subscribeRoomEvents,
}
