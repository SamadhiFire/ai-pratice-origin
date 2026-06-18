import { chatCompletion, type ChatCompletionOptions, type ChatMessage } from '../llm'
import { parseModelJson } from './parser-validator'

export interface JsonPromptRequest {
  messages: ChatMessage[]
  options?: ChatCompletionOptions
}

export interface ProviderJsonCompletion {
  rawText: string
  payload: unknown
}

export interface QuizGenerationProviderAdapter {
  completeJson(request: JsonPromptRequest): Promise<ProviderJsonCompletion>
}

export function createQuizGenerationProviderAdapter(
  transport: (
    messages: ChatMessage[],
    config?: undefined,
    options?: ChatCompletionOptions,
  ) => Promise<string> = chatCompletion,
): QuizGenerationProviderAdapter {
  return {
    async completeJson(request: JsonPromptRequest): Promise<ProviderJsonCompletion> {
      const rawText = await transport(request.messages, undefined, request.options)
      return {
        rawText,
        payload: parseModelJson(rawText),
      }
    },
  }
}
