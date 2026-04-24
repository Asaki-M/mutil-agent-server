import type { Chat, Content, CreateChatParameters, GenerateContentConfig, GenerateContentResponse } from '@google/genai'
import type {
  ChatMessageOptions,
  ChatTextResult,
  CreateChatClientOptions,
  TextHistoryMessage,
} from '../model/aiClient'
import { GoogleGenAI } from '@google/genai'
import {
  GEMINI_MODEL,
  GOOGLE_CLOUD_LOCATION,
  GOOGLE_CLOUD_PROJECT,
} from '../config/env'

const DEFAULT_PROJECT_ID = GOOGLE_CLOUD_PROJECT
const DEFAULT_LOCATION = GOOGLE_CLOUD_LOCATION
const DEFAULT_MODEL = GEMINI_MODEL

// 进程内复用同一个 Gemini 客户端即可。
const ai = new GoogleGenAI({
  vertexai: true,
  project: DEFAULT_PROJECT_ID,
  location: DEFAULT_LOCATION,
})

function buildSystemInstruction(systemInstruction?: string): Content | undefined {
  if (systemInstruction == null || systemInstruction === '') {
    return undefined
  }

  return {
    parts: [{ text: systemInstruction }],
  }
}

function buildTextHistory(history: TextHistoryMessage[] = []): Content[] {
  return history.map(item => ({
    role: item.role,
    parts: [{ text: item.text }],
  }))
}

function mergeHistory(history: Content[] = [], textHistory: TextHistoryMessage[] = []): Content[] {
  return [...history, ...buildTextHistory(textHistory)]
}

function mergeChatConfig(config?: GenerateContentConfig, systemInstruction?: string): GenerateContentConfig | undefined {
  if (config == null && (systemInstruction == null || systemInstruction === '')) {
    return undefined
  }

  return {
    ...config,
    // 优先用显式传入的系统提示词。
    systemInstruction: buildSystemInstruction(systemInstruction) || config?.systemInstruction,
  }
}

function createChatClient(options: CreateChatClientOptions = {}): Chat {
  const { model = DEFAULT_MODEL, history, textHistory, config, systemInstruction } = options
  const params: CreateChatParameters = {
    model,
    history: mergeHistory(history, textHistory),
    config: mergeChatConfig(config, systemInstruction),
  }

  return ai.chats.create(params)
}

// SDK 结果统一收敛成纯文本，业务层更好用。
function getResponseText(response: GenerateContentResponse): string {
  return response.text ?? ''
}

async function sendChatMessage(chat: Chat, options: ChatMessageOptions): Promise<GenerateContentResponse> {
  return chat.sendMessage({
    message: options.message,
    config: options.config,
  })
}

async function sendChatText(chat: Chat, options: ChatMessageOptions): Promise<ChatTextResult> {
  const response = await sendChatMessage(chat, options)

  return {
    response,
    text: getResponseText(response),
  }
}

async function sendChatMessageStream(chat: Chat, options: ChatMessageOptions): Promise<AsyncGenerator<GenerateContentResponse>> {
  return chat.sendMessageStream({
    message: options.message,
    config: options.config,
  })
}

async function* sendChatTextStream(
  chat: Chat,
  options: ChatMessageOptions,
): AsyncGenerator<string, void, unknown> {
  const stream = await sendChatMessageStream(chat, options)

  for await (const chunk of stream) {
    const text = getResponseText(chunk)

    if (text !== '') {
      yield text
    }
  }
}

function getChatHistory(chat: Chat, curated = false): Content[] {
  return chat.getHistory(curated)
}

export {
  ai,
  buildTextHistory,
  createChatClient,
  DEFAULT_LOCATION,
  DEFAULT_MODEL,
  DEFAULT_PROJECT_ID,
  getChatHistory,
  getResponseText,
  sendChatMessage,
  sendChatMessageStream,
  sendChatText,
  sendChatTextStream,
}
