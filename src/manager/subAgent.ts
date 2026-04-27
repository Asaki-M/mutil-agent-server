import type { Content } from '@google/genai'
import type {
  ChatMessageOptions,
} from '../model/aiClient'
import type {
  SubAgentOptions,
  SubAgentTextReply,
} from '../model/subAgent'
import {
  generateText,
  sendModelMessage,
} from './aiClient'

interface MemoryMessage {
  role: 'user' | 'model'
  text: string
}

const MAX_RECENT_MESSAGES = 15
const SUMMARY_PROMPT = '你负责维护一个 agent 的长期记忆。请把输入的旧摘要和新增对话压缩成简洁中文摘要，只保留用户偏好、任务目标、关键事实、约定、未完成事项。不要复述无关寒暄。'

function toContent(message: MemoryMessage): Content {
  return {
    role: message.role,
    parts: [{ text: message.text }],
  }
}

export class SubAgent {
  // 子 agent 的基础元信息。
  readonly name: string
  readonly sysPrompt: string
  readonly model?: string

  private summary = ''
  private readonly recentMessages: MemoryMessage[] = []

  constructor(options: SubAgentOptions) {
    this.name = options.name
    this.sysPrompt = options.sysPrompt
    this.model = options.model
  }

  async sendText(options: ChatMessageOptions): Promise<SubAgentTextReply> {
    const message = String(options.message)
    const result = await sendModelMessage({
      systemInstruction: this.sysPrompt,
      contents: this.buildContents(message),
      ...(this.model == null ? {} : { model: this.model }),
      ...(options.config == null ? {} : { config: options.config }),
    })

    await this.remember('user', message)
    await this.remember('model', result.text)

    return {
      agentName: this.name,
      text: result.text,
      response: result.response,
    }
  }

  private buildContents(message: string): Content[] {
    const contents = this.recentMessages.map(toContent)

    if (this.summary !== '') {
      contents.unshift(toContent({
        role: 'user',
        text: `以下是更早之前的对话摘要，请作为背景记忆参考：\n${this.summary}`,
      }))
    }

    contents.push(toContent({
      role: 'user',
      text: message,
    }))

    return contents
  }

  private async remember(role: MemoryMessage['role'], text: string): Promise<void> {
    this.recentMessages.push({ role, text })

    if (this.recentMessages.length <= MAX_RECENT_MESSAGES) {
      return
    }

    const overflow = this.recentMessages.splice(0, this.recentMessages.length - MAX_RECENT_MESSAGES)
    this.summary = await generateText({
      systemInstruction: SUMMARY_PROMPT,
      contents: [toContent({
        role: 'user',
        text: [
          `旧摘要：\n${this.summary || '无'}`,
          '新增旧对话：',
          ...overflow.map(message => `${message.role}: ${message.text}`),
        ].join('\n'),
      })],
      ...(this.model == null ? {} : { model: this.model }),
    })
  }
}
