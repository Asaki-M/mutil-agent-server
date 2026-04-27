import type { GenerateContentResponse } from '@google/genai'

export interface SubAgentOptions {
  // 子 agent 的唯一名称。
  name: string
  // 角色提示词。
  sysPrompt: string
  model?: string
}

export interface SubAgentTextReply {
  agentName: string
  text: string
  response: GenerateContentResponse
}
