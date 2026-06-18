import type { Keypoint, Question } from '../types'
import type { PracticeMode } from '../utils/question-bank'
import type { Chunk } from '../utils/preprocess'

export type PipelineStrategy = 'cache_hit' | 'single_pass' | 'legacy_fallback'
const MAX_QUALITY_REPAIR_ROUNDS = 2

export interface SegmentedPipelineExecutionInput {
  source: string
  sourceSignature: string
  chunks: Chunk[]
  type: 'single' | 'multi'
  questionCount: number
  difficulty: 'easy' | 'medium' | 'hard'
  mode: PracticeMode
  normalizedUserTags: string[]
  resultCacheKey: string
  skipResultCache: boolean
  excludeSignatures?: string[]
  temperature?: number
  generationSeed?: string
  enableLegacyFallback: boolean
  singlePassMinCandidatesRatio: number
  legacyFallbackTriggerRatio: number
  maxKeypointExtractionChunks: number
}

export interface SegmentedPipelineExecutionMetrics {
  strategy: PipelineStrategy
  keypointCacheHit: boolean
  keypointMs: number
  questionMs: number
  singlePassMs: number
  keypointChunks: number
  keypointPromptChars: number
  promptChars: number
}

export interface SegmentedPipelineExecutionOutput extends SegmentedPipelineExecutionMetrics {
  keypoints: Keypoint[]
  questions: Question[]
}

interface SegmentedPipelineHooks {
  readPipelineResultCache: (cacheKey: string) => { keypoints: Keypoint[]; questions: Question[] } | null
  writePipelineResultCache: (cacheKey: string, keypoints: Keypoint[], questions: Question[]) => void
  pickRepresentativeChunks: (chunks: Chunk[], maxCount: number) => Chunk[]
  buildKeypointPromptMaterial: (source: string, chunks: Chunk[]) => string
  buildQuestionPromptMaterial: (source: string, chunks: Chunk[]) => string
  fallbackKeypointsFromChunks: (chunks: Chunk[]) => Keypoint[]
  generateBundleByLlm: (
    material: string,
    type: 'single' | 'multi',
    count: number,
    difficulty: 'easy' | 'medium' | 'hard',
    mode: PracticeMode,
    userTags: string[],
    options?: {
      temperature?: number
      generationSeed?: string
    },
  ) => Promise<unknown>
  normalizeKeypoints: (raw: unknown) => Keypoint[]
  mergeKeypoints: (list: Keypoint[], reindex?: boolean) => Keypoint[]
  writeKeypointCache: (signature: string, keypoints: Keypoint[]) => void
  normalizeQuestions: (
    raw: unknown,
    keypoints: Keypoint[],
    type: 'single' | 'multi',
    difficulty: 'easy' | 'medium' | 'hard',
    userTags: string[],
  ) => Question[]
  readKeypointCache: (signature: string) => Keypoint[] | null
  extractKeypointsFromMaterial: (material: string) => Promise<Keypoint[]>
  generateQuestionsByLlm: (
    material: string,
    keypoints: Keypoint[],
    type: 'single' | 'multi',
    count: number,
    difficulty: 'easy' | 'medium' | 'hard',
    mode: PracticeMode,
    userTags: string[],
  ) => Promise<Question[]>
  finalizeQuestionSet: (
    candidates: Question[],
    keypoints: Keypoint[],
    type: 'single' | 'multi',
    count: number,
    difficulty: 'easy' | 'medium' | 'hard',
    userTags: string[],
    excludeSignatures?: string[],
  ) => Question[]
  estimateUsableCandidateCount: (
    candidates: Question[],
    keypoints: Keypoint[],
    type: 'single' | 'multi',
    difficulty: 'easy' | 'medium' | 'hard',
    excludeSignatures?: string[],
  ) => number
}

export async function executeSegmentedPipeline(
  input: SegmentedPipelineExecutionInput,
  hooks: SegmentedPipelineHooks,
): Promise<SegmentedPipelineExecutionOutput> {
  if (!input.skipResultCache) {
    const cachedResult = hooks.readPipelineResultCache(input.resultCacheKey)
    if (cachedResult) {
      return {
        keypoints: cachedResult.keypoints,
        questions: cachedResult.questions,
        strategy: 'cache_hit',
        keypointCacheHit: false,
        keypointMs: 0,
        questionMs: 0,
        singlePassMs: 0,
        keypointChunks: 0,
        keypointPromptChars: 0,
        promptChars: 0,
      }
    }
  }

  const keypointChunks = hooks.pickRepresentativeChunks(
    input.chunks,
    Math.min(input.maxKeypointExtractionChunks, input.chunks.length),
  )
  const keypointMaterial = hooks.buildKeypointPromptMaterial(input.source, keypointChunks)
  const promptMaterial = hooks.buildQuestionPromptMaterial(input.source, input.chunks)
  const fallbackKeypoints = hooks.fallbackKeypointsFromChunks(keypointChunks.length > 0 ? keypointChunks : input.chunks)

  let strategy: Exclude<PipelineStrategy, 'cache_hit'> = 'single_pass'
  let keypointCacheHit = false
  let keypointMs = 0
  let questionMs = 0
  let singlePassMs = 0
  let keypoints: Keypoint[] = fallbackKeypoints
  let candidates: Question[] = []

  const singlePassStart = Date.now()
  try {
    const payload = await hooks.generateBundleByLlm(
      promptMaterial,
      input.type,
      input.questionCount,
      input.difficulty,
      input.mode,
      input.normalizedUserTags,
      {
        temperature: input.temperature,
        generationSeed: input.generationSeed,
      },
    )

    const parsedKeypoints = hooks.mergeKeypoints(hooks.normalizeKeypoints(payload), false)
    if (parsedKeypoints.length > 0) {
      keypoints = parsedKeypoints
      // Legacy fallback can directly reuse keypoints extracted from first pass.
      hooks.writeKeypointCache(input.sourceSignature, hooks.mergeKeypoints(parsedKeypoints))
    }

    candidates = hooks.normalizeQuestions(payload, keypoints, input.type, input.difficulty, input.normalizedUserTags)
  } catch {
    candidates = []
  }
  singlePassMs = Date.now() - singlePassStart

  const minSinglePassCandidates = Math.max(1, Math.ceil(input.questionCount * input.singlePassMinCandidatesRatio))
  const fallbackTriggerFloor = Math.max(1, Math.ceil(input.questionCount * input.legacyFallbackTriggerRatio))
  const usableSinglePassCount = hooks.estimateUsableCandidateCount(
    candidates,
    keypoints,
    input.type,
    input.difficulty,
    input.excludeSignatures || [],
  )
  const shouldRunLegacyFallback =
    input.enableLegacyFallback &&
    (
      usableSinglePassCount < input.questionCount
      || (
        candidates.length < minSinglePassCandidates &&
        candidates.length < fallbackTriggerFloor
      )
    )

  if (shouldRunLegacyFallback) {
    strategy = 'legacy_fallback'
    const keypointStart = Date.now()
    const cachedKeypoints = hooks.readKeypointCache(input.sourceSignature)
    if (cachedKeypoints && cachedKeypoints.length > 0) {
      keypointCacheHit = true
      keypoints = cachedKeypoints
    } else {
      let allKeypoints: Keypoint[] = []
      try {
        allKeypoints = await hooks.extractKeypointsFromMaterial(keypointMaterial)
      } catch {
        allKeypoints = []
      }

      const merged = hooks.mergeKeypoints(allKeypoints)
      keypoints = merged.length > 0 ? merged : fallbackKeypoints
      if (merged.length > 0) {
        hooks.writeKeypointCache(input.sourceSignature, keypoints)
      }
    }
    keypointMs = Date.now() - keypointStart

    const questionStart = Date.now()
    try {
      candidates = await hooks.generateQuestionsByLlm(
        promptMaterial,
        keypoints,
        input.type,
        input.questionCount,
        input.difficulty,
        input.mode,
        input.normalizedUserTags,
      )
    } catch {
      candidates = []
    }
    questionMs = Date.now() - questionStart
  } else {
    questionMs = singlePassMs
  }

  let usableCandidateCount = hooks.estimateUsableCandidateCount(
    candidates,
    keypoints,
    input.type,
    input.difficulty,
    input.excludeSignatures || [],
  )
  if (usableCandidateCount < input.questionCount) {
    for (let round = 0; round < MAX_QUALITY_REPAIR_ROUNDS; round += 1) {
      const missing = input.questionCount - usableCandidateCount
      if (missing <= 0) break
      const repairCount = Math.min(
        input.questionCount,
        Math.max(2, missing + Math.ceil(input.questionCount * 0.35)),
      )
      try {
        const repaired = await hooks.generateQuestionsByLlm(
          promptMaterial,
          keypoints,
          input.type,
          repairCount,
          input.difficulty,
          input.mode,
          input.normalizedUserTags,
        )
        if (Array.isArray(repaired) && repaired.length > 0) {
          candidates = [...candidates, ...repaired]
        }
      } catch {
        // ignore one repair round failure and continue
      }
      const nextUsableCount = hooks.estimateUsableCandidateCount(
        candidates,
        keypoints,
        input.type,
        input.difficulty,
        input.excludeSignatures || [],
      )
      if (nextUsableCount <= usableCandidateCount) break
      usableCandidateCount = nextUsableCount
    }
  }

  if (keypoints.length < 1) {
    keypoints = fallbackKeypoints
  }

  const questions = hooks.finalizeQuestionSet(
    candidates,
    keypoints,
    input.type,
    input.questionCount,
    input.difficulty,
    input.normalizedUserTags,
    input.excludeSignatures || [],
  )

  if (!input.skipResultCache && questions.length > 0) {
    hooks.writePipelineResultCache(input.resultCacheKey, keypoints, questions)
  }

  return {
    keypoints,
    questions,
    strategy,
    keypointCacheHit,
    keypointMs,
    questionMs,
    singlePassMs,
    keypointChunks: keypointChunks.length,
    keypointPromptChars: keypointMaterial.length,
    promptChars: promptMaterial.length,
  }
}
