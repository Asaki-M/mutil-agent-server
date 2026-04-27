import type { Chat } from '@google/genai'
import type {
  ChatMessageOptions,
} from '../model/aiClient'
import type {
  SubAgentOptions,
  SubAgentTextReply,
} from '../model/subAgent'
import {
  createChatClient,
} from './aiClient'

export class SubAgent {
  // 子 agent 的基础元信息。
  readonly name: string
  readonly sysPrompt: string
  readonly model?: string

  private readonly chat: Chat

  constructor(options: SubAgentOptions) {
    this.name = options.name
    this.sysPrompt = options.sysPrompt
    this.model = options.model

    // 每个 agent 持有自己的独立会话。
    this.chat = createChatClient({
      model: options.model,
      systemInstruction: options.sysPrompt,
    })
  }

  async sendText(options: ChatMessageOptions): Promise<SubAgentTextReply> {
    const response = await this.chat.sendMessage({
      message: options.message,
      config: options.config,
    })

    return {
      agentName: this.name,
      text: response.text ?? '',
      response,
    }
  }
}
