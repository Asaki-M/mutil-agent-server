import type { Content, GenerateContentConfig, GenerateContentResponse } from '@google/genai'
import type { TextHistoryMessage } from './aiClient'

export interface SubAgentOptions {
  // 子 agent 的唯一名称。
  name: string
  // 角色提示词。
  sysPrompt: string
  model?: string
  history?: Content[]
  textHistory?: TextHistoryMessage[]
  config?: GenerateContentConfig
}

export interface SubAgentTextReply {
  agentName: string
  text: string
  response: GenerateContentResponse
}
