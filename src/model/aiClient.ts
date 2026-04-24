import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  PartListUnion,
} from '@google/genai'

type ChatRole = 'user' | 'model'

interface TextHistoryMessage {
  role: ChatRole
  text: string
}

interface CreateChatClientOptions {
  model?: string
  history?: Content[]
  textHistory?: TextHistoryMessage[]
  config?: GenerateContentConfig
  systemInstruction?: string
}

interface ChatMessageOptions {
  message: PartListUnion
  config?: GenerateContentConfig
}

interface ChatTextResult {
  response: GenerateContentResponse
  text: string
}

export type {
  ChatMessageOptions,
  ChatRole,
  ChatTextResult,
  CreateChatClientOptions,
  TextHistoryMessage,
}
