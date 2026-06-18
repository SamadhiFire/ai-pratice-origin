import type { Keypoint } from '../../types'
import type { ChatMessage, ChatCompletionOptions } from '../llm'
import type { PracticeMode } from '../question-bank'
import type { Chunk } from '../preprocess'
import { MODE_PROMPT_CONTRACTS, SHARED_OUTPUT_CONTRACT } from './prompt-contract'

const MAX_KEYPOINT_PROMPT_CHARS = 1200
const MAX_QUESTION_PROMPT_CHARS = 2200
const MAX_QUESTION_PROMPT_CHUNKS = 4
const MAX_KEYPOINT_EXTRACTION_CHUNKS = 3

export interface PromptRequest {
  messages: ChatMessage[]
  options: ChatCompletionOptions
}

function normalizeQuestionCountForBudget(count: number): number {
  const safe = Math.floor(Number(count || 0))
  if (!Number.isFinite(safe)) return 1
  return Math.max(1, Math.min(20, safe))
}

export function resolveBundleTokenBudget(type: 'single' | 'multi', count: number): number {
  const safeCount = normalizeQuestionCountForBudget(count)
  const perQuestion = type === 'single' ? 210 : 240
  const target = 700 + safeCount * perQuestion
  return Math.max(1200, Math.min(5200, target))
}

export function resolveLegacyQuestionTokenBudget(type: 'single' | 'multi', count: number): number {
  const safeCount = normalizeQuestionCountForBudget(count)
  const perQuestion = type === 'single' ? 180 : 210
  const target = 500 + safeCount * perQuestion
  return Math.max(1000, Math.min(4600, target))
}

export function pickRepresentativeChunks(chunks: Chunk[], maxCount: number): Chunk[] {
  if (chunks.length <= maxCount) return [...chunks]
  const picked = new Set<number>([0, chunks.length - 1])

  if (maxCount === 1) {
    picked.clear()
    picked.add(0)
  } else {
    for (let index = 0; index < maxCount; index += 1) {
      const candidateIndex = Math.round((index * (chunks.length - 1)) / (maxCount - 1))
      picked.add(Math.min(Math.max(0, candidateIndex), chunks.length - 1))
    }
  }

  return [...picked]
    .sort((a, b) => a - b)
    .map((index) => chunks[index])
}

export function buildKeypointPromptMaterial(source: string, chunks: Chunk[]): string {
  if (source.length <= MAX_KEYPOINT_PROMPT_CHARS) return source

  const sampled = pickRepresentativeChunks(chunks, Math.min(MAX_KEYPOINT_EXTRACTION_CHUNKS, chunks.length))
  let compacted = sampled
    .map((chunk) => `片段${chunk.index + 1}：${chunk.text}`)
    .join('\n\n')
    .trim()

  if (!compacted) {
    compacted = source.slice(0, MAX_KEYPOINT_PROMPT_CHARS)
  }

  if (compacted.length > MAX_KEYPOINT_PROMPT_CHARS) {
    compacted = compacted.slice(0, MAX_KEYPOINT_PROMPT_CHARS)
  }

  return `${compacted}\n\n（材料较长，已抽取关键片段用于知识点提取）`
}

export function buildQuestionPromptMaterial(source: string, chunks: Chunk[]): string {
  if (source.length <= MAX_QUESTION_PROMPT_CHARS) return source

  const sampled = pickRepresentativeChunks(chunks, Math.min(MAX_QUESTION_PROMPT_CHUNKS, chunks.length))
  let compacted = sampled
    .map((chunk) => `片段${chunk.index + 1}：${chunk.text}`)
    .join('\n\n')
    .trim()

  if (!compacted) {
    return source.slice(0, MAX_QUESTION_PROMPT_CHARS)
  }

  if (compacted.length > MAX_QUESTION_PROMPT_CHARS) {
    compacted = compacted.slice(0, MAX_QUESTION_PROMPT_CHARS)
  }

  return `${compacted}\n\n（材料较长，已抽取关键片段用于出题）`
}

function buildUserTagRule(userTags: string[]): string {
  if (userTags.length > 0) {
    return `每道题必须从给定 user_tags 中选择一个最相关标签写入 tag；若均不匹配，则写“综合”。user_tags=${JSON.stringify(userTags)}。`
  }
  return '若无法归类可将 tag 置为“综合”。'
}

function buildSharedQuestionRules(): string[] {
  return [
    '题干必须互不重复，禁止同义改写重复。',
    '不同题目的正确选项文本不得重复，禁止仅通过调换答案位置制造“新题”。',
    '同一批题的四个选项集合不得高度重合（避免选项池整体复用）。',
    '若考查同一概念，题干角度必须切换（定义、计算、影响因素、场景判断至少覆盖其一）。',
    'evidence_quote 请控制在 36 字以内，explanation 请控制在 40 字以内。',
    '干扰项必须与题干同主题且看起来“像对的”，禁止使用“忽略/混淆/套用”等元描述句式。',
    '禁止输出“与材料不一致的表述1”“干扰项1”等占位文案。',
    '禁止输出除上述 schema 外的任何字段。',
  ]
}

export function buildKeypointExtractionPrompt(material: string): PromptRequest {
  const systemPrompt = [
    '你是知识点提取助手。',
    '只返回一个合法 JSON 对象，不要 markdown、不要解释、不要注释。',
    '顶层仅允许 keypoints。',
    `keypoints 每项仅允许 ${SHARED_OUTPUT_CONTRACT.keypointFields.join(',')}。`,
    '禁止输出 why_important 或任意额外字段。',
    '输出 4-6 个核心知识点，importance_score 为 1-10 的整数。',
    'title 必须可读，禁止使用占位标题；evidence_quote 必须来自材料原文且尽量简短。',
  ].join(' ')

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `材料：\n${material}\n\n请提取 4-6 个核心知识点。` },
    ],
    options: {
      maxOutputTokens: 900,
    },
  }
}

export function buildBundleGenerationPrompt(input: {
  material: string
  type: 'single' | 'multi'
  count: number
  difficulty: 'easy' | 'medium' | 'hard'
  mode: PracticeMode
  userTags: string[]
  temperature?: number
  generationSeed?: string
}): PromptRequest {
  const contract = MODE_PROMPT_CONTRACTS[input.mode]

  const systemPrompt = [
    '你是严格的出题助手。先提取知识点，再出题。',
    `${contract.label}：${contract.summary}`,
    contract.extractionBoundary,
    contract.questionBoundary,
    contract.evidenceRule,
    contract.extensionRule,
    '只返回一个合法 JSON 对象，不要 markdown、不要解释、不要注释。',
    '顶层仅允许 keypoints 与 questions 两个字段。',
    `keypoints 每项仅允许 ${SHARED_OUTPUT_CONTRACT.keypointFields.join(',')}。`,
    `questions 每项仅允许 ${SHARED_OUTPUT_CONTRACT.questionFields.join(',')}。`,
    `options 必须是长度为 ${SHARED_OUTPUT_CONTRACT.optionCount} 的数组，且每项仅允许 ${SHARED_OUTPUT_CONTRACT.optionFields.join(',')}。`,
    `请输出 4-6 个 keypoints 和 ${input.count} 道 ${input.type} 题，questions 数组长度必须严格等于 ${input.count}。`,
    'keypoints.id 使用 kp_0、kp_1 这类格式，questions.keypoint_id 必须引用这些 id。',
    'single 题必须是 4 选 1，answer 为一个字母（如 A）。',
    'multi 题必须是 4 选 2，answer 用逗号分隔两个字母（如 A,C）。',
    ...buildSharedQuestionRules(),
    'evidence_quote 与 explanation 尽量简洁，保证可由材料支持。',
    '若输入包含 seed，请以其作为变体随机源，确保同材料多次请求时题干与选项表达明显不同。',
    buildUserTagRule(input.userTags),
  ].join(' ')

  const userPayload: Record<string, unknown> = {
    type: input.type,
    count: input.count,
    difficulty: input.difficulty,
    mode: input.mode === 'modeA' ? 'A' : 'B',
    user_tags: input.userTags,
    material: input.material,
  }
  if (input.generationSeed) {
    userPayload.seed = input.generationSeed
  }

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
    options: {
      maxOutputTokens: resolveBundleTokenBudget(input.type, input.count),
      temperature: input.temperature,
    },
  }
}

export function buildQuestionGenerationPrompt(input: {
  material: string
  keypoints: Keypoint[]
  keypointPlan: Array<{
    keypoint_id: string
    title: string
    importance_score: number
    expected_count: number
    evidence_quote: string
  }>
  type: 'single' | 'multi'
  count: number
  difficulty: 'easy' | 'medium' | 'hard'
  mode: PracticeMode
  userTags: string[]
  temperature?: number
  generationSeed?: string
}): PromptRequest {
  const contract = MODE_PROMPT_CONTRACTS[input.mode]

  const systemPrompt = [
    '你是严格的出题助手。',
    `${contract.label}：${contract.summary}`,
    contract.questionBoundary,
    contract.evidenceRule,
    contract.extensionRule,
    '只返回一个合法 JSON 对象，不要 markdown、不要解释、不要注释。',
    '顶层仅允许 questions。',
    `questions 每项仅允许 ${SHARED_OUTPUT_CONTRACT.questionFields.join(',')}。`,
    `options 必须是长度为 ${SHARED_OUTPUT_CONTRACT.optionCount} 的数组，且每项仅允许 ${SHARED_OUTPUT_CONTRACT.optionFields.join(',')}。`,
    `请严格输出 ${input.count} 道 ${input.type} 题，questions 数组长度必须严格等于 ${input.count}。`,
    '每道题必须绑定给定 keypoint_id，题干不得重复。',
    'single 题必须是 4 选 1，answer 为一个字母（如 A）。',
    'multi 题必须是 4 选 2，answer 用逗号分隔两个字母（如 A,C）。',
    ...buildSharedQuestionRules(),
    '优先覆盖 importance 高的知识点，并遵守 keypoint_plan 的 expected_count，解释尽量简短。',
    '若输入包含 seed，请以其作为变体随机源，确保同材料多次请求时题干与选项表达明显不同。',
    buildUserTagRule(input.userTags),
  ].join(' ')

  const userPayload: Record<string, unknown> = {
    type: input.type,
    count: input.count,
    difficulty: input.difficulty,
    mode: input.mode === 'modeA' ? 'A' : 'B',
    user_tags: input.userTags,
    keypoint_plan: input.keypointPlan,
    keypoints: input.keypoints,
    material: input.material,
  }
  if (input.generationSeed) {
    userPayload.seed = input.generationSeed
  }

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
    options: {
      maxOutputTokens: resolveLegacyQuestionTokenBudget(input.type, input.count),
      temperature: input.temperature,
    },
  }
}

export { MAX_KEYPOINT_EXTRACTION_CHUNKS }
