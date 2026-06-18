import type { Keypoint, Question } from '../../types'
import { cloneKeypoints, cloneQuestions } from './shared'

const KEYPOINT_CACHE_LIMIT = 12
const PIPELINE_RESULT_CACHE_LIMIT = 4
const PIPELINE_RESULT_STORAGE_KEY = 'study_quiz_pipeline_result_cache_v1'
const PIPELINE_RESULT_STORAGE_TTL_MS = 1000 * 60 * 60 * 12
const ENABLE_PIPELINE_RESULT_STORAGE = false

interface PipelineResultCacheEntry {
  keypoints: Keypoint[]
  questions: Question[]
  createdAt: number
}

const KEYPOINT_CACHE = new Map<string, Keypoint[]>()
const PIPELINE_RESULT_CACHE = new Map<string, PipelineResultCacheEntry>()
let pipelineResultCacheHydrated = false

export function readKeypointCache(signature: string): Keypoint[] | null {
  const cached = KEYPOINT_CACHE.get(signature)
  if (!cached || cached.length === 0) return null

  KEYPOINT_CACHE.delete(signature)
  KEYPOINT_CACHE.set(signature, cached)
  return cloneKeypoints(cached)
}

export function writeKeypointCache(signature: string, keypoints: Keypoint[]): void {
  if (!signature || keypoints.length === 0) return
  KEYPOINT_CACHE.delete(signature)
  KEYPOINT_CACHE.set(signature, cloneKeypoints(keypoints))

  while (KEYPOINT_CACHE.size > KEYPOINT_CACHE_LIMIT) {
    const oldestKey = KEYPOINT_CACHE.keys().next().value as string | undefined
    if (!oldestKey) break
    KEYPOINT_CACHE.delete(oldestKey)
  }
}

export function buildPipelineResultCacheKey(
  sourceSignature: string,
  type: 'single' | 'multi',
  count: number,
  difficulty: 'easy' | 'medium' | 'hard',
  mode: 'modeA' | 'modeB',
  userTags: string[],
  cacheKeySuffix = '',
): string {
  const parts = [
    sourceSignature,
    `t:${type}`,
    `n:${count}`,
    `d:${difficulty}`,
    `m:${mode}`,
    `tags:${userTags.join('|')}`,
  ]

  if (cacheKeySuffix) {
    parts.push(`salt:${cacheKeySuffix}`)
  }

  return parts.join('||')
}

function isPipelineResultExpired(createdAt: number): boolean {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return true
  return Date.now() - createdAt > PIPELINE_RESULT_STORAGE_TTL_MS
}

function hydratePipelineResultCache(): void {
  if (pipelineResultCacheHydrated) return
  pipelineResultCacheHydrated = true

  if (!ENABLE_PIPELINE_RESULT_STORAGE) {
    try {
      const uniApi = (globalThis as { uni?: { removeStorageSync?: (key: string) => void } }).uni
      uniApi?.removeStorageSync?.(PIPELINE_RESULT_STORAGE_KEY)
    } catch {
      // ignore storage cleanup failure
    }
    return
  }

  try {
    const uniApi = (globalThis as { uni?: { getStorageSync?: (key: string) => unknown } }).uni
    if (!uniApi?.getStorageSync) return
    const raw = uniApi.getStorageSync(PIPELINE_RESULT_STORAGE_KEY)
    if (!Array.isArray(raw)) return

    const list = raw as Array<{
      cacheKey?: unknown
      keypoints?: unknown
      questions?: unknown
      createdAt?: unknown
    }>

    const restored: Array<{
      cacheKey: string
      keypoints: Keypoint[]
      questions: Question[]
      createdAt: number
    }> = []

    list.forEach((item) => {
      const cacheKey = String(item.cacheKey || '').trim()
      const createdAt = Number(item.createdAt || 0)
      const keypoints = Array.isArray(item.keypoints) ? cloneKeypoints(item.keypoints as Keypoint[]) : []
      const questions = Array.isArray(item.questions) ? cloneQuestions(item.questions as Question[]) : []
      if (!cacheKey || questions.length === 0 || isPipelineResultExpired(createdAt)) return
      restored.push({ cacheKey, keypoints, questions, createdAt })
    })

    restored.slice(-PIPELINE_RESULT_CACHE_LIMIT).forEach((entry) => {
      PIPELINE_RESULT_CACHE.set(entry.cacheKey, {
        keypoints: entry.keypoints,
        questions: entry.questions,
        createdAt: entry.createdAt,
      })
    })
  } catch {
    // ignore cache hydration failure
  }
}

function persistPipelineResultCache(): void {
  try {
    const uniApi = (globalThis as {
      uni?: {
        setStorageSync?: (key: string, value: unknown) => void
        removeStorageSync?: (key: string) => void
      }
    }).uni
    if (!uniApi) return
    if (!ENABLE_PIPELINE_RESULT_STORAGE) {
      uniApi.removeStorageSync?.(PIPELINE_RESULT_STORAGE_KEY)
      return
    }
    if (!uniApi.setStorageSync) return

    const entries = [...PIPELINE_RESULT_CACHE.entries()]
      .filter(([, entry]) => entry.questions.length > 0 && !isPipelineResultExpired(entry.createdAt))
      .slice(-PIPELINE_RESULT_CACHE_LIMIT)
      .map(([cacheKey, entry]) => ({
        cacheKey,
        keypoints: cloneKeypoints(entry.keypoints),
        questions: cloneQuestions(entry.questions),
        createdAt: entry.createdAt,
      }))

    uniApi.setStorageSync(PIPELINE_RESULT_STORAGE_KEY, entries)
  } catch {
    // ignore cache persist failure
  }
}

export function readPipelineResultCache(cacheKey: string): { keypoints: Keypoint[]; questions: Question[] } | null {
  hydratePipelineResultCache()
  const cached = PIPELINE_RESULT_CACHE.get(cacheKey)
  if (!cached || cached.questions.length === 0) return null
  if (isPipelineResultExpired(cached.createdAt)) {
    PIPELINE_RESULT_CACHE.delete(cacheKey)
    persistPipelineResultCache()
    return null
  }

  PIPELINE_RESULT_CACHE.delete(cacheKey)
  PIPELINE_RESULT_CACHE.set(cacheKey, cached)
  return {
    keypoints: cloneKeypoints(cached.keypoints),
    questions: cloneQuestions(cached.questions),
  }
}

export function writePipelineResultCache(cacheKey: string, keypoints: Keypoint[], questions: Question[]): void {
  hydratePipelineResultCache()
  if (!cacheKey || questions.length === 0) return

  PIPELINE_RESULT_CACHE.delete(cacheKey)
  PIPELINE_RESULT_CACHE.set(cacheKey, {
    keypoints: cloneKeypoints(keypoints),
    questions: cloneQuestions(questions),
    createdAt: Date.now(),
  })

  while (PIPELINE_RESULT_CACHE.size > PIPELINE_RESULT_CACHE_LIMIT) {
    const oldestKey = PIPELINE_RESULT_CACHE.keys().next().value as string | undefined
    if (!oldestKey) break
    PIPELINE_RESULT_CACHE.delete(oldestKey)
  }

  persistPipelineResultCache()
}
