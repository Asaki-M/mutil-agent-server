import type {
  GenerateContentConfig,
  PartListUnion,
} from '@google/genai'

interface ChatMessageOptions {
  message: PartListUnion
  config?: GenerateContentConfig
}

export type {
  ChatMessageOptions,
}
