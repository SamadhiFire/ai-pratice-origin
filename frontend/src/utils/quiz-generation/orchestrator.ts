import type { GenerateResult, Keypoint, Question } from '../../types'
import { executeSegmentedPipeline } from '../../services/pipeline-segmented-service'
import { chunkMaterial } from '../preprocess'
import { normalizeQuestionTag } from '../question-schema'
import type { PracticeMode } from '../question-bank'
import {
  buildPipelineResultCacheKey,
  readKeypointCache,
  readPipelineResultCache,
  writeKeypointCache,
  writePipelineResultCache,
} from './cache'
import { fallbackKeypointsFromChunks, fallbackQuestions, finalizeQuestionSet } from './fallback'
import {
  buildKeypointQuotas,
  estimateUsableCandidateCount,
  mergeKeypoints,
  normalizeKeypoints,
  normalizeQuestions,
} from './parser-validator'
import {
  MAX_KEYPOINT_EXTRACTION_CHUNKS,
  buildBundleGenerationPrompt,
  buildKeypointExtractionPrompt,
  buildKeypointPromptMaterial,
  buildQuestionGenerationPrompt,
  buildQuestionPromptMaterial,
  pickRepresentativeChunks,
} from './prompt-builder'
import { createQuizGenerationProviderAdapter } from './provider-adapter'
import { buildMaterialSignature, normalizeSignatureList, uniqueTexts } from './shared'

const ENABLE_LEGACY_LLM_FALLBACK = true
const SINGLE_PASS_MIN_CANDIDATES_RATIO = 0.6
const LEGACY_FALLBACK_TRIGGER_RATIO = 0.25

export interface PipelineRunOptions {
  skipResultCache?: boolean
  cacheKeySuffix?: string
  temperature?: number
  generationSeed?: string
  excludeSignatures?: string[]
}

const providerAdapter = createQuizGenerationProviderAdapter()

async function extractKeypointsFromMaterial(material: string): Promise<Keypoint[]> {
  const response = await providerAdapter.completeJson(buildKeypointExtractionPrompt(material))
  return normalizeKeypoints(response.payload)
}

async function generateBundleByLlm(
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
): Promise<unknown> {
  const response = await providerAdapter.completeJson(buildBundleGenerationPrompt({
    material,
    type,
    count,
    difficulty,
    mode,
    userTags,
    temperature: options?.temperature,
    generationSeed: options?.generationSeed,
  }))
  return response.payload
}

async function generateQuestionsByLlm(
  material: string,
  keypoints: Keypoint[],
  type: 'single' | 'multi',
  count: number,
  difficulty: 'easy' | 'medium' | 'hard',
  mode: PracticeMode,
  userTags: string[],
  options?: {
    temperature?: number
    generationSeed?: string
  },
): Promise<Question[]> {
  const keypointPlan = buildKeypointQuotas(keypoints, count).map((item) => ({
    keypoint_id: item.keypoint.id,
    title: item.keypoint.title,
    importance_score: item.keypoint.importance_score,
    expected_count: item.expectedCount,
    evidence_quote: item.keypoint.evidence_quote,
  }))

  const response = await providerAdapter.completeJson(buildQuestionGenerationPrompt({
    material,
    keypoints,
    keypointPlan,
    type,
    count,
    difficulty,
    mode,
    userTags,
    temperature: options?.temperature,
    generationSeed: options?.generationSeed,
  }))

  return normalizeQuestions(response.payload, keypoints, type, difficulty, userTags)
}

export async function runLocalQuizGenerationPipeline(
  material: string,
  type: 'single' | 'multi',
  count: number,
  difficulty: 'easy' | 'medium' | 'hard',
  mode: PracticeMode = 'modeA',
  userTags: string[] = [],
  options: PipelineRunOptions = {},
): Promise<GenerateResult> {
  try {
    const source = material.trim()
    const sourceSignature = buildMaterialSignature(source)
    const normalizedUserTags = uniqueTexts(userTags.map((item) => normalizeQuestionTag(item))).slice(0, 7)
    const minSourceLength = mode === 'modeA' ? 50 : 1
    if (source.length < minSourceLength) {
      return {
        success: false,
        error: mode === 'modeA' ? '材料太短，请至少输入 50 字' : '请至少输入 1 个字',
      }
    }

    const chunks = chunkMaterial(source, minSourceLength)
    if (chunks.length === 0) {
      return { success: false, error: '材料无法分块，请补充内容后重试' }
    }

    const questionCount = Math.min(Math.max(1, count), 20)
    const resultCacheKey = buildPipelineResultCacheKey(
      sourceSignature,
      type,
      questionCount,
      difficulty,
      mode,
      normalizedUserTags,
      String(options.cacheKeySuffix || ''),
    )

    const execution = await executeSegmentedPipeline(
      {
        source,
        sourceSignature,
        chunks,
        type,
        questionCount,
        difficulty,
        mode,
        normalizedUserTags,
        resultCacheKey,
        skipResultCache: Boolean(options.skipResultCache),
        excludeSignatures: normalizeSignatureList(options.excludeSignatures),
        temperature: options.temperature,
        generationSeed: options.generationSeed,
        enableLegacyFallback: ENABLE_LEGACY_LLM_FALLBACK,
        singlePassMinCandidatesRatio: SINGLE_PASS_MIN_CANDIDATES_RATIO,
        legacyFallbackTriggerRatio: LEGACY_FALLBACK_TRIGGER_RATIO,
        maxKeypointExtractionChunks: MAX_KEYPOINT_EXTRACTION_CHUNKS,
      },
      {
        readPipelineResultCache,
        writePipelineResultCache,
        pickRepresentativeChunks,
        buildKeypointPromptMaterial,
        buildQuestionPromptMaterial,
        fallbackKeypointsFromChunks,
        generateBundleByLlm,
        normalizeKeypoints,
        mergeKeypoints,
        writeKeypointCache,
        normalizeQuestions,
        readKeypointCache,
        extractKeypointsFromMaterial,
        generateQuestionsByLlm,
        finalizeQuestionSet,
        estimateUsableCandidateCount,
      },
    )

    if (execution.strategy === 'cache_hit') {
      return {
        success: true,
        output: {
          keypoints: execution.keypoints,
          questions: execution.questions,
        },
      }
    }

    if (execution.questions.length === 0) {
      const emergencyKeypointsSource = execution.keypoints.length > 0
        ? execution.keypoints
        : fallbackKeypointsFromChunks(chunks)
      const emergencyKeypoints = mergeKeypoints(emergencyKeypointsSource)
      const emergencyQuestions = fallbackQuestions(
        emergencyKeypoints,
        type,
        questionCount,
        difficulty,
        normalizedUserTags,
        normalizeSignatureList(options.excludeSignatures),
      )

      if (emergencyQuestions.length > 0) {
        if (!options.skipResultCache) {
          writePipelineResultCache(resultCacheKey, emergencyKeypoints, emergencyQuestions)
        }
        return {
          success: true,
          output: {
            keypoints: emergencyKeypoints,
            questions: emergencyQuestions,
          },
        }
      }

      return { success: false, error: '模型结果解析失败，请重试或更换品牌模型' }
    }

    return {
      success: true,
      output: {
        keypoints: execution.keypoints,
        questions: execution.questions,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return {
      success: false,
      error: message,
    }
  }
}
