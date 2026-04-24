import type { Chat, Content, GenerateContentResponse } from '@google/genai'
import type {
  ChatMessageOptions,
  ChatTextResult,
} from '../model/aiClient'
import type {
  SubAgentOptions,
  SubAgentTextReply,
} from '../model/subAgent'
import {
  createChatClient,
  getChatHistory,
  sendChatMessage,
  sendChatMessageStream,
  sendChatText,
  sendChatTextStream,
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
      history: options.history,
      textHistory: options.textHistory,
      config: options.config,
      systemInstruction: options.sysPrompt,
    })
  }

  async sendMessage(options: ChatMessageOptions): Promise<GenerateContentResponse> {
    return sendChatMessage(this.chat, options)
  }

  async sendText(options: ChatMessageOptions): Promise<SubAgentTextReply> {
    const result = await sendChatText(this.chat, options)

    return this.buildTextReply(result)
  }

  async sendMessageStream(options: ChatMessageOptions): Promise<AsyncGenerator<GenerateContentResponse>> {
    return sendChatMessageStream(this.chat, options)
  }

  async* sendTextStream(options: ChatMessageOptions): AsyncGenerator<string, void, unknown> {
    const stream = sendChatTextStream(this.chat, options)

    for await (const chunk of stream) {
      yield chunk
    }
  }

  getHistory(curated = false): Content[] {
    return getChatHistory(this.chat, curated)
  }

  // 统一补上 agent 名称，方便 room 层直接消费。
  private buildTextReply(result: ChatTextResult): SubAgentTextReply {
    return {
      agentName: this.name,
      text: result.text,
      response: result.response,
    }
  }
}

export function createSubAgent(options: SubAgentOptions): SubAgent {
  return new SubAgent(options)
}
