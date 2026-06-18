import type { GenerateResult } from '../types'
import {
  createQuestionsGenerationJobInBackend,
  isPlannedEndpointError,
  triggerGenerationBatchInBackend,
  type GenerationBatchPayload,
  type GenerationJobPayload,
} from '../utils/backend-sync'

export type GenerationSource = 'backend' | 'local_fallback'
type LocalFallbackReason = 'backend_error' | 'backend_empty' | 'planned_endpoint'

export type InitialGenerationSourceResult =
  | {
      source: 'backend'
      payload: GenerationJobPayload
    }
  | {
      source: 'local_fallback'
      payload: GenerateResult
      fallbackReason?: LocalFallbackReason
      backendErrorMessage?: string
    }

export type BatchGenerationSourceResult =
  | {
      source: 'backend'
      payload: GenerationBatchPayload
    }
  | {
      source: 'local_fallback'
      payload: GenerateResult
      fallbackReason?: LocalFallbackReason
      backendErrorMessage?: string
    }

export async function requestInitialGenerationFromPreferredSource(
  backendPayload: Parameters<typeof createQuestionsGenerationJobInBackend>[0],
  runLocalFallback: () => Promise<GenerateResult>,
): Promise<InitialGenerationSourceResult> {
  try {
    const remotePayload = await createQuestionsGenerationJobInBackend(backendPayload)
    if (remotePayload?.session && remotePayload.generationJob) {
      return {
        source: 'backend',
        payload: remotePayload,
      }
    }
    throw new Error('后端返回无效数据')
  } catch (error) {
    // 不再使用本地兜底，直接抛出错误
    throw error
  }
}

export async function requestBatchGenerationFromPreferredSource(
  jobId: string,
  batchIndex: 2 | 3,
  runLocalFallback: () => Promise<GenerateResult>,
): Promise<BatchGenerationSourceResult> {
  try {
    const remotePayload = await triggerGenerationBatchInBackend(jobId, batchIndex)
    if (remotePayload?.generationJob && remotePayload.session) {
      return {
        source: 'backend',
        payload: remotePayload,
      }
    }
    throw new Error('后端返回无效数据')
  } catch (error) {
    // 不再使用本地兜底，直接抛出错误
    throw error
  }
}
