import type { Question } from '../types'
import {
  fetchQuestionBankFromBackend,
  syncQuestionBankToBackend,
  deleteQuestionBankItemsInBackend,
  queryQuestionBankFromBackend,
  submitQuestionAttemptInBackend,
  updateQuestionMasteredInBackend,
  updateQuestionTagsInBackend,
} from './backend-sync'
import {
  buildQuestionSignature,
  normalizeOptionText,
  normalizeQuestionOptions,
  normalizeQuestionTag,
} from './question-schema'

export { buildQuestionSignature, normalizeOptionText } from './question-schema'

export type PracticeMode = 'modeA' | 'modeB'

export interface StoredQuestion extends Question {
  createdAt: number
  mode: PracticeMode
  practiceCount: number
  wrongCount: number
  isMastered: boolean
  category_order?: number
  lastWrongAt?: number
}

const BANK_KEY = 'study_quiz_question_bank_v1'
const QUESTION_BANK_QUERY_PAGE_SIZE = 200
let questionBankSyncTimer: ReturnType<typeof setTimeout> | null = null

interface SaveQuestionBankOptions {
  syncBackend?: boolean
}

function normalizeTimestamp(raw: unknown): number {
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) return 0
  // Support both second-level and millisecond-level timestamps.
  if (num > 1_000_000_000 && num < 10_000_000_000) {
    return Math.round(num * 1000)
  }
  return Math.round(num)
}

function extractTimestampFromId(id: unknown): number {
  const text = String(id || '')
  if (!text) return 0

  const parts = text.match(/\d{10,13}/g) || []
  let best = 0
  parts.forEach((part) => {
    const ts = normalizeTimestamp(part)
    if (ts > best) best = ts
  })
  return best
}

function resolveQuestionCreatedAt(input: Partial<StoredQuestion>): number {
  const fromField = normalizeTimestamp(input.createdAt)
  if (fromField > 0) return fromField
  const fromId = extractTimestampFromId(input.id)
  if (fromId > 0) return fromId
  return 0
}

function compareQuestionDesc(a: StoredQuestion, b: StoredQuestion): number {
  const tsDiff = Number(b.createdAt || 0) - Number(a.createdAt || 0)
  if (tsDiff !== 0) return tsDiff

  // Timestamp tie-breaker for deterministic order.
  return String(b.id || '').localeCompare(String(a.id || ''))
}

function sortQuestionBankDesc(list: StoredQuestion[]): StoredQuestion[] {
  return [...list].sort(compareQuestionDesc)
}

function normalizeTag(tag: unknown): string {
  return normalizeQuestionTag(tag)
}

function normalizeCategoryOrder(raw: unknown): number | undefined {
  const value = Number(raw)
  if (!Number.isFinite(value)) return undefined
  const normalized = Math.max(0, Math.floor(value))
  return Number.isFinite(normalized) ? normalized : undefined
}

function normalizeCustomTagOrder(tags: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  tags.forEach((raw) => {
    const tag = normalizeTag(raw)
    if (!tag || tag === '综合' || tag === '其他') return
    const signature = tag.toLowerCase()
    if (seen.has(signature)) return
    seen.add(signature)
    output.push(tag)
  })
  return output
}

function resolveCategoryOrderByTag(tag: unknown, customTagOrder: string[]): number {
  const normalizedTag = normalizeTag(tag)
  if (normalizedTag === '综合') return 0

  const customIndex = customTagOrder.findIndex(
    (item) => item.toLowerCase() === normalizedTag.toLowerCase(),
  )
  if (customIndex >= 0) {
    return customIndex + 1
  }

  return customTagOrder.length + 1
}

function normalizeOptions(
  source: Array<{ key?: unknown; text?: unknown; isCorrect?: unknown }> | undefined,
) {
  return normalizeQuestionOptions(source)
}

function normalizeQuestion(raw: unknown): StoredQuestion | null {
  const q = raw as Partial<StoredQuestion>
  if (!q || typeof q !== 'object') return null

  const id = String(q.id || '').trim()
  const stem = String(q.stem || '').trim()
  const answer = String(q.answer || '').trim()
  const evidence = String(q.evidence_quote || '').trim()
  const type = q.type === 'multi' ? 'multi' : q.type === 'single' ? 'single' : null
  const difficulty = ['easy', 'medium', 'hard'].includes(String(q.difficulty))
    ? (q.difficulty as 'easy' | 'medium' | 'hard')
    : 'medium'

  if (!id || !stem || !answer || !evidence || !type) return null

  return {
    id,
    type,
    stem,
    tag: normalizeTag(q.tag || '综合') || '综合',
    options: normalizeOptions(q.options as Array<{ key?: unknown; text?: unknown; isCorrect?: unknown }> | undefined),
    answer,
    explanation: String(q.explanation || '').trim(),
    evidence_quote: evidence,
    keypoint_id: String(q.keypoint_id || '').trim(),
    difficulty,
    createdAt: resolveQuestionCreatedAt(q),
    mode: q.mode === 'modeB' ? 'modeB' : 'modeA',
    practiceCount: Math.max(0, Number((q as Partial<StoredQuestion>).practiceCount || 0)),
    wrongCount: Math.max(0, Number(q.wrongCount || 0)),
    isMastered: Boolean((q as Partial<StoredQuestion>).isMastered),
    category_order: normalizeCategoryOrder(
      (q as Partial<StoredQuestion>).category_order ?? (q as Partial<StoredQuestion> & { categoryOrder?: unknown }).categoryOrder,
    ),
    lastWrongAt: q.lastWrongAt ? Number(q.lastWrongAt) : undefined,
  }
}

export function loadQuestionBank(): StoredQuestion[] {
  const raw = uni.getStorageSync(BANK_KEY)
  if (!Array.isArray(raw)) return []

  const list = raw
    .map((item) => normalizeQuestion(item))
    .filter((item): item is StoredQuestion => !!item)

  return sortQuestionBankDesc(list)
}

function clearPendingQuestionBankSync(): void {
  if (!questionBankSyncTimer) return
  clearTimeout(questionBankSyncTimer)
  questionBankSyncTimer = null
}

function saveQuestionBank(list: StoredQuestion[], options: SaveQuestionBankOptions = {}): void {
  const sorted = sortQuestionBankDesc(list)
  uni.setStorageSync(BANK_KEY, sorted)
  if (options.syncBackend === false) {
    clearPendingQuestionBankSync()
    return
  }
  scheduleQuestionBankBackendSync(sorted)
}

export function addGeneratedQuestions(questions: Question[], mode: PracticeMode): StoredQuestion[] {
  const now = Date.now()
  const existingBank = loadQuestionBank()
  const seen = new Set(
    existingBank
      .map((item) => buildQuestionSignature(item))
      .filter(Boolean),
  )
  const uniqueQuestions = questions.filter((q) => {
    const signature = buildQuestionSignature(q)
    if (!signature || seen.has(signature)) return false
    seen.add(signature)
    return true
  })

  const prepared: StoredQuestion[] = uniqueQuestions.map((q, idx) => ({
    ...q,
    tag: normalizeTag(q.tag || '综合') || '综合',
    options: normalizeOptions(q.options as Array<{ key?: unknown; text?: unknown; isCorrect?: unknown }> | undefined),
    id: `${q.id}_${now}_${idx}`,
    createdAt: now - idx,
    mode,
    practiceCount: 0,
    wrongCount: 0,
    isMastered: false,
  }))

  const merged = [...prepared, ...existingBank]
  saveQuestionBank(merged)
  return prepared
}

export function upsertStoredQuestions(
  questions: StoredQuestion[],
  options: SaveQuestionBankOptions = {},
): StoredQuestion[] {
  const normalizedIncoming = (questions || [])
    .map((item) => normalizeQuestion(item))
    .filter((item): item is StoredQuestion => !!item)

  if (normalizedIncoming.length === 0) return []

  const incomingIdSet = new Set(normalizedIncoming.map((item) => item.id))
  const incomingSignatureSet = new Set(
    normalizedIncoming
      .map((item) => buildQuestionSignature(item))
      .filter(Boolean),
  )
  const existing = loadQuestionBank().filter((item) => {
    if (incomingIdSet.has(item.id)) return false
    const signature = buildQuestionSignature(item)
    if (!signature) return true
    return !incomingSignatureSet.has(signature)
  })

  saveQuestionBank([...normalizedIncoming, ...existing], options)
  return normalizedIncoming
}

export function deleteQuestionById(id: string): void {
  const list = loadQuestionBank().filter((item) => item.id !== id)
  saveQuestionBank(list)
}

export function removeQuestionsByIds(ids: string[]): number {
  const targetSet = new Set(
    (ids || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )
  if (targetSet.size === 0) return 0

  const current = loadQuestionBank()
  const next = current.filter((item) => !targetSet.has(item.id))
  const deletedCount = current.length - next.length
  if (deletedCount <= 0) return 0

  saveQuestionBank(next)
  void deleteQuestionBankItemsInBackend([...targetSet]).catch(() => {
    // ignore backend deletion failure
  })
  return deletedCount
}

export function updateQuestionStem(id: string, stem: string): void {
  const clean = stem.trim()
  if (!clean) return

  const list = loadQuestionBank().map((item) => {
    if (item.id !== id) return item
    return {
      ...item,
      stem: clean,
    }
  })

  saveQuestionBank(list)
}

export function setQuestionWrong(
  id: string,
  isWrong: boolean,
  options: SaveQuestionBankOptions = {},
): void {
  const now = Date.now()
  const list = loadQuestionBank().map((item) => {
    if (item.id !== id) return item

    const nextPracticeCount = Math.max(0, Number(item.practiceCount || 0) + 1)

    if (!isWrong) {
      return {
        ...item,
        practiceCount: nextPracticeCount,
      }
    }

    return {
      ...item,
      practiceCount: nextPracticeCount,
      wrongCount: Math.max(1, item.wrongCount + 1),
      lastWrongAt: now,
    }
  })

  saveQuestionBank(list, options)
}

export function setQuestionMastered(id: string, isMastered: boolean): void {
  const list = loadQuestionBank().map((item) => {
    if (item.id !== id) return item
    return {
      ...item,
      isMastered,
    }
  })

  saveQuestionBank(list)
  void updateQuestionMasteredInBackend(id, isMastered).catch(() => {
    // ignore backend update failure
  })
}

export function setQuestionTagsById(tagById: Record<string, string>): void {
  const entries = Object.entries(tagById)
  if (entries.length === 0) return

  const tagMap = new Map<string, string>(
    entries
      .map(([id, tag]) => [String(id).trim(), normalizeTag(tag)] as const)
      .filter(([id]) => !!id),
  )

  if (tagMap.size === 0) return

  const list = loadQuestionBank().map((item) => {
    const nextTag = tagMap.get(item.id)
    if (!nextTag) return item
    return {
      ...item,
      tag: nextTag,
    }
  })

  saveQuestionBank(list)
  void updateQuestionTagsInBackend(Object.fromEntries(tagMap)).catch(() => {
    // ignore backend tag sync failure
  })
}

export function saveQuestionExplanation(id: string, explanation: string): void {
  const content = explanation.trim()
  if (!content) return

  const list = loadQuestionBank().map((item) => {
    if (item.id !== id) return item
    return {
      ...item,
      explanation: content,
    }
  })

  saveQuestionBank(list)
}

export function applyQuestionAttemptStats(
  id: string,
  stats: {
    practiceCount?: number
    wrongCount?: number
    lastWrongAt?: number
    explanation?: string
  },
): void {
  const list = loadQuestionBank().map((item) => {
    if (item.id !== id) return item
    return {
      ...item,
      practiceCount: Math.max(0, Number(stats.practiceCount ?? (item.practiceCount || 0))),
      wrongCount: Math.max(0, Number(stats.wrongCount ?? (item.wrongCount || 0))),
      lastWrongAt: Number(stats.lastWrongAt ?? (item.lastWrongAt || 0)) || undefined,
      explanation: String(stats.explanation ?? (item.explanation || '')).trim(),
    }
  })

  saveQuestionBank(list, { syncBackend: false })
}

export async function submitQuestionAttempt(
  id: string,
  userChoice: string,
  feedbackMode: 'instant' | 'after_all',
): Promise<void> {
  const result = await submitQuestionAttemptInBackend({
    questionId: id,
    userChoice,
    feedbackMode,
  }).catch(() => null)

  if (!result) {
    scheduleQuestionBankBackendSync(loadQuestionBank())
    return
  }

  applyQuestionAttemptStats(id, {
    practiceCount: result.practiceCount,
    wrongCount: result.wrongCount,
    lastWrongAt: result.lastWrongAt,
    explanation: result.explanation,
  })
}

export function setQuestionCategoryOrderByTagOrder(customTagOrder: string[]): void {
  const normalizedOrder = normalizeCustomTagOrder(customTagOrder)
  const list = loadQuestionBank().map((item) => ({
    ...item,
    category_order: resolveCategoryOrderByTag(item.tag, normalizedOrder),
  }))
  saveQuestionBank(list)
}

function scheduleQuestionBankBackendSync(list: StoredQuestion[]): void {
  if (questionBankSyncTimer) {
    clearTimeout(questionBankSyncTimer)
  }

  questionBankSyncTimer = setTimeout(() => {
    questionBankSyncTimer = null
    syncQuestionBankToBackend(list).catch(() => {
      // ignore backend sync failure
    })
  }, 500)
}

async function fetchQuestionBankSnapshotFromBackend(): Promise<StoredQuestion[] | null> {
  try {
    const firstPage = await queryQuestionBankFromBackend({
      mainTab: 'all',
      page: 1,
      pageSize: QUESTION_BANK_QUERY_PAGE_SIZE,
    })
    if (!firstPage || !Array.isArray(firstPage.list)) return null

    const merged = [...firstPage.list]
    const total = Math.max(0, Number(firstPage.total || merged.length))
    const totalPages = Math.max(1, Math.ceil(total / QUESTION_BANK_QUERY_PAGE_SIZE))

    for (let page = 2; page <= totalPages; page += 1) {
      const nextPage = await queryQuestionBankFromBackend({
        mainTab: 'all',
        page,
        pageSize: QUESTION_BANK_QUERY_PAGE_SIZE,
      }).catch(() => null)

      if (!nextPage || !Array.isArray(nextPage.list) || nextPage.list.length === 0) {
        break
      }

      merged.push(...nextPage.list)
    }

    return merged as StoredQuestion[]
  } catch {
    return null
  }
}

export async function hydrateQuestionBankFromBackend(): Promise<boolean> {
  try {
    const remoteList = await fetchQuestionBankSnapshotFromBackend()
      .then((list) => (Array.isArray(list) ? list : fetchQuestionBankFromBackend()))
    if (!Array.isArray(remoteList)) return false

    if (remoteList.length === 0) {
      const local = loadQuestionBank()
      if (local.length > 0) {
        syncQuestionBankToBackend(local).catch(() => {
          // ignore backend sync failure
        })
      }
      return false
    }

    const normalized = remoteList
      .map((item) => normalizeQuestion(item))
      .filter((item): item is StoredQuestion => !!item)

    if (normalized.length === 0) return false
    uni.setStorageSync(BANK_KEY, sortQuestionBankDesc(normalized))
    return true
  } catch {
    return false
  }
}


