import type { GenerateContentConfig } from '@google/genai'
import type { SubAgentOptions, SubAgentTextReply } from './subAgent'

export interface RoomOptions {
  // 初始化时可直接注入一组 agent。
  agents?: SubAgentOptions[]
}

export interface RoomDirectMessageOptions {
  message: string
  toAgentName: string
  fromAgentName?: string
  config?: GenerateContentConfig
  round?: number
  trigger?: 'user' | 'agent' | 'system'
}

export interface RoomConversationOptions {
  message: string
  fromAgentName?: string
  maxRounds?: number
  config?: GenerateContentConfig
}

export interface RoomMessageRecord {
  id: string
  type: 'message'
  from: string
  to: string
  message: string
  round: number
  trigger: 'user' | 'agent' | 'system'
  timestamp: string
}

export interface RoomReplyRecord extends SubAgentTextReply {
  id: string
  type: 'reply'
  from: string
  to: string
  round: number
  trigger: 'user' | 'agent' | 'system'
  timestamp: string
}

export interface RoomStatusEvent {
  id: string
  type: 'status'
  event: 'agent_added' | 'agent_removed' | 'conversation_started' | 'conversation_completed' | 'conversation_failed'
  detail: string
  timestamp: string
}

export type RoomEvent = RoomMessageRecord | RoomReplyRecord | RoomStatusEvent
export type RoomEventListener = (event: RoomEvent) => void | Promise<void>
