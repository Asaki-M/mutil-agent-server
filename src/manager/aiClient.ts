import type { Content, GenerateContentConfig } from '@google/genai'
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

interface SendModelMessageOptions {
  model?: string
  systemInstruction: string
  contents: Content[]
  config?: GenerateContentConfig
}

interface ModelTextResponse {
  text: string
  response: unknown
}

async function generateText(options: SendModelMessageOptions): Promise<string> {
  const { text } = await sendModelMessage(options)

  return text
}

function buildSystemInstruction(systemInstruction?: string): Content | undefined {
  if (systemInstruction == null || systemInstruction === '') {
    return undefined
  }

  return {
    parts: [{ text: systemInstruction }],
  }
}

async function sendModelMessage(options: SendModelMessageOptions): Promise<ModelTextResponse> {
  const response = await ai.models.generateContent({
    model: options.model ?? GEMINI_MODEL,
    contents: options.contents,
    config: {
      ...options.config,
      systemInstruction: buildSystemInstruction(options.systemInstruction),
    },
  })

  return {
    text: response.text ?? '',
    response,
  }
}

export {
  generateText,
  sendModelMessage,
}
