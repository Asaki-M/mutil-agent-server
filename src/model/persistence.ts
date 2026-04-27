import type { RoomEvent } from './room'

export interface PersistedMemoryMessage {
  role: 'user' | 'model'
  text: string
}

export interface PersistedSubAgent {
  name: string
  sysPrompt: string
  model?: string
  summary: string
  recentMessages: PersistedMemoryMessage[]
}

export interface PersistedRoomState {
  version: 1
  updatedAt: string
  agents: PersistedSubAgent[]
  events: RoomEvent[]
}
