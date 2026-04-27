import type { Chat, Content, CreateChatParameters } from '@google/genai'
import { GoogleGenAI } from '@google/genai'
import {
  GEMINI_MODEL,
  GOOGLE_CLOUD_LOCATION,
  GOOGLE_CLOUD_PROJECT,
} from '../config/env'

// 进程内复用同一个 Gemini 客户端即可。
const ai = new GoogleGenAI({
  vertexai: true,
  project: GOOGLE_CLOUD_PROJECT,
  location: GOOGLE_CLOUD_LOCATION,
})

function buildSystemInstruction(systemInstruction?: string): Content | undefined {
  if (systemInstruction == null || systemInstruction === '') {
    return undefined
  }

  return {
    parts: [{ text: systemInstruction }],
  }
}

function createChatClient(options: { model?: string, systemInstruction: string }): Chat {
  const params: CreateChatParameters = {
    model: options.model ?? GEMINI_MODEL,
    config: {
      systemInstruction: buildSystemInstruction(options.systemInstruction),
    },
  }

  return ai.chats.create(params)
}

export {
  createChatClient,
}
