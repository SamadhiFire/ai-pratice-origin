import { chatCompletion, loadLlmConfig } from './llm'
import { loadQuestionBank, setQuestionTagsById, type StoredQuestion } from './question-bank'
import { loadUserTags } from './user-tags'

const DEFAULT_GENERAL_TAG = '综合'
const DEFAULT_OTHER_TAG = '其他'
const MAX_TAG_COUNT = 7
const RETAG_SIGNATURE_KEY = 'study_quiz_retag_signature_v1'
const RETAG_AI_BATCH_SIZE = 25
const RETAG_AI_BATCH_TIMEOUT_MS = 12000
const RETAG_AI_TOTAL_BUDGET_MS = 18000
const RETAG_AI_MAX_BATCHES = 4

export interface RetagSummary {
  targetCount: number
  updatedCount: number
  remainingCount: number
  usedAi: boolean
  skipped: boolean
}

interface RetagOptions {
  force?: boolean
  useAi?: boolean
}

function normalizeTag(raw: unknown): string {
  const clean = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 12)
  if (!clean) return DEFAULT_GENERAL_TAG
  if (clean === '通用' || clean === '未分类') return DEFAULT_GENERAL_TAG
  return clean
}

function normalizeAllowedTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  tags.forEach((raw) => {
    const tag = normalizeTag(raw)
    if (!tag) return
    if (tag === DEFAULT_GENERAL_TAG || tag === DEFAULT_OTHER_TAG) return
    const signature = tag.toLowerCase()
    if (seen.has(signature)) return
    seen.add(signature)
    output.push(tag)
  })

  return output.slice(0, MAX_TAG_COUNT)
}

function parseLooseJson(raw: string): unknown {
  const clean = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  if (!clean) throw new Error('empty')

  try {
    return JSON.parse(clean)
  } catch {
    const objectMatch = clean.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      return JSON.parse(objectMatch[0])
    }
    const arrayMatch = clean.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0])
    }
  }

  throw new Error('invalid_json')
}

function pickAllowedTag(rawTag: unknown, allowedTags: string[]): string {
  const clean = normalizeTag(rawTag)
  if (!clean || allowedTags.length === 0) return ''

  const exact = allowedTags.find((tag) => tag.toLowerCase() === clean.toLowerCase())
  if (exact) return exact

  const fuzzy = allowedTags.find((tag) => {
    const a = tag.toLowerCase()
    const b = clean.toLowerCase()
    return a.includes(b) || b.includes(a)
  })
  return fuzzy || ''
}

function parseRetagResult(raw: string, allowedTags: string[]): Record<string, string> {
  const parsed = parseLooseJson(raw) as
    | { items?: Array<{ id?: unknown; tag?: unknown }>; results?: Array<{ id?: unknown; tag?: unknown }> }
    | Array<{ id?: unknown; tag?: unknown }>

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed?.results)
        ? parsed.results
        : []

  const output: Record<string, string> = {}
  list.forEach((item) => {
    const id = String(item?.id || '').trim()
    const tag = pickAllowedTag(item?.tag, allowedTags)
    if (!id || !tag) return
    output[id] = tag
  })
  return output
}

function chunkQuestions(list: StoredQuestion[], size: number): StoredQuestion[][] {
  if (size <= 0) return [list]
  const output: StoredQuestion[][] = []
  for (let i = 0; i < list.length; i += size) {
    output.push(list.slice(i, i + size))
  }
  return output
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('RETAG_TIMEOUT'))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function isRetagTarget(question: StoredQuestion, allowedSet: Set<string>): boolean {
  const normalized = normalizeTag(question.tag)
  if (!normalized) return true
  if (normalized === DEFAULT_GENERAL_TAG || normalized === DEFAULT_OTHER_TAG) return true
  return !allowedSet.has(normalized.toLowerCase())
}

function buildQuestionSearchText(question: StoredQuestion): string {
  const stem = String(question.stem || '').replace(/^\s*题目\s*[:：]\s*/, '').trim()
  const options = (question.options || [])
    .map((opt) => String(opt.text || '').trim())
    .filter(Boolean)
    .join(' ')
  return `${stem} ${options}`.toLowerCase()
}

function scoreTagByContent(content: string, tag: string): number {
  const normalizedTag = normalizeTag(tag).toLowerCase()
  if (!normalizedTag) return 0

  let score = 0
  if (content.includes(normalizedTag)) {
    score += normalizedTag.length * 3
  }

  const tokenList = normalizedTag.split(/[\s/、，,._-]+/g).filter(Boolean)
  tokenList.forEach((token) => {
    if (token && content.includes(token)) {
      score += token.length
    }
  })

  return score
}

function fallbackTagForQuestion(question: StoredQuestion, allowedTags: string[]): string {
  if (allowedTags.length === 0) return ''

  const content = buildQuestionSearchText(question)
  let bestTag = ''
  let bestScore = 0

  allowedTags.forEach((tag) => {
    const score = scoreTagByContent(content, tag)
    if (score > bestScore) {
      bestScore = score
      bestTag = tag
    }
  })

  if (bestTag) return bestTag
  return DEFAULT_OTHER_TAG
}

async function classifyQuestionBatch(batch: StoredQuestion[], allowedTags: string[]): Promise<Record<string, string>> {
  if (batch.length === 0 || allowedTags.length === 0) return {}

  const compactQuestions = batch.map((item) => ({
    id: item.id,
    stem: String(item.stem || '').replace(/^\s*题目\s*[:：]\s*/, '').trim().slice(0, 150),
    options: (item.options || [])
      .map((opt) => `${String(opt.key || '').trim()}. ${String(opt.text || '').trim()}`)
      .join(' | ')
      .slice(0, 220),
  }))

  const systemPrompt = [
    '你是题目标签分类助手。',
    '请仅根据题目内容，为每道题从给定标签中选择一个最匹配标签。',
    '只返回 JSON：{"items":[{"id":"题目id","tag":"标签"}]}。',
    `tag 必须严格来自 allowed_tags：${JSON.stringify(allowedTags)}。`,
    '禁止输出多余说明。',
  ].join(' ')

  const userPrompt = [
    `allowed_tags: ${JSON.stringify(allowedTags)}`,
    `questions: ${JSON.stringify(compactQuestions)}`,
  ].join('\n\n')

  const content = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ])

  return parseRetagResult(content, allowedTags)
}

function buildRetagSignature(allowedTags: string[], targets: StoredQuestion[]): string {
  const tagPart = allowedTags.map((tag) => tag.toLowerCase()).join('|')
  const idPart = targets.map((item) => String(item.id || '').trim()).filter(Boolean).sort().join('|')
  return `${tagPart}::${idPart}`
}

function readRetagSignature(): string {
  return String(uni.getStorageSync(RETAG_SIGNATURE_KEY) || '')
}

function writeRetagSignature(signature: string): void {
  uni.setStorageSync(RETAG_SIGNATURE_KEY, signature)
}

export async function retagQuestionBankByTags(tags: string[], options: RetagOptions = {}): Promise<RetagSummary> {
  const allowedTags = normalizeAllowedTags(tags)
  if (allowedTags.length === 0) {
    return {
      targetCount: 0,
      updatedCount: 0,
      remainingCount: 0,
      usedAi: false,
      skipped: true,
    }
  }

  const allowedSet = new Set(allowedTags.map((tag) => tag.toLowerCase()))
  const allQuestions = loadQuestionBank()
  const targets = allQuestions.filter((item) => isRetagTarget(item, allowedSet))

  if (targets.length === 0) {
    writeRetagSignature('')
    return {
      targetCount: 0,
      updatedCount: 0,
      remainingCount: 0,
      usedAi: false,
      skipped: false,
    }
  }

  const signature = buildRetagSignature(allowedTags, targets)
  const force = Boolean(options.force)
  if (!force && signature && readRetagSignature() === signature) {
    return {
      targetCount: targets.length,
      updatedCount: 0,
      remainingCount: targets.length,
      usedAi: false,
      skipped: true,
    }
  }

  const merged: Record<string, string> = {}
  let usedAi = false
  const shouldUseAi = Boolean(options.useAi)
  const config = loadLlmConfig()
  const canUseAi = shouldUseAi && !!config.apiKey.trim()

  if (canUseAi) {
    const batches = chunkQuestions(targets, RETAG_AI_BATCH_SIZE)
    const aiStart = Date.now()
    let aiBatchUsed = 0
    for (const batch of batches) {
      if (aiBatchUsed >= RETAG_AI_MAX_BATCHES) break
      if (Date.now() - aiStart > RETAG_AI_TOTAL_BUDGET_MS) break
      aiBatchUsed += 1
      try {
        const result = await withTimeout(
          classifyQuestionBatch(batch, allowedTags),
          RETAG_AI_BATCH_TIMEOUT_MS,
        )
        if (Object.keys(result).length > 0) {
          usedAi = true
          Object.assign(merged, result)
        }
      } catch {
        // ignore and keep fallback classification below
      }
    }
  }

  targets.forEach((item) => {
    if (merged[item.id]) return
    const fallbackTag = fallbackTagForQuestion(item, allowedTags)
    const picked = pickAllowedTag(fallbackTag, allowedTags)
    merged[item.id] = picked || DEFAULT_OTHER_TAG
  })

  const updatedCount = Object.keys(merged).length
  if (updatedCount > 0) {
    setQuestionTagsById(merged)
  }

  const latest = loadQuestionBank()
  const remainingTargets = latest.filter((item) => isRetagTarget(item, allowedSet)).length

  if (remainingTargets > 0) {
    writeRetagSignature(signature)
  } else {
    writeRetagSignature('')
  }

  return {
    targetCount: targets.length,
    updatedCount,
    remainingCount: remainingTargets,
    usedAi,
    skipped: false,
  }
}

export async function retagQuestionBankByStoredTags(options: RetagOptions = {}): Promise<RetagSummary> {
  return retagQuestionBankByTags(loadUserTags(), options)
}
