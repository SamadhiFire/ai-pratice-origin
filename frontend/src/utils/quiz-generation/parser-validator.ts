import type { Keypoint, Question, QuestionOption } from '../../types'
import {
  OPTION_KEYS,
  buildQuestionSignature,
  normalizeQuestionOptions,
  normalizeQuestionTag,
  normalizeTextForCompare,
  parseAnswerKeys,
} from '../question-schema.ts'
import { compactText, pickFirstSentence, uniqueTexts } from './shared.ts'

const MAX_KEYPOINTS = 6
const PLACEHOLDER_STEM_PATTERNS = [/材料片段\s*\d+/i, /完成该题/i]
const PLACEHOLDER_OPTION_PATTERNS = [
  /^与材料不一致的表述\s*\d*$/i,
  /^干扰项\s*\d*$/i,
  /^错误干扰项\s*\d*$/i,
]

export interface KeypointQuota {
  keypoint: Keypoint
  expectedCount: number
}

export type QuestionAngle = 'definition' | 'formula' | 'factor' | 'scenario' | 'evidence' | 'other'

export interface QuestionValidationIssue {
  questionId: string
  messages: string[]
}

function normalizeJsonLikeText(text: string): string {
  return text
    .trim()
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, '\'')
    .replace(/,\s*([}\]])/g, '$1')
}

function parseCandidateJson(text: string): unknown | null {
  const normalized = normalizeJsonLikeText(text)
  if (!normalized) return null
  try {
    return JSON.parse(normalized)
  } catch {
    return null
  }
}

export function parseModelJson(text: string): unknown {
  let cleaned = String(text || '').trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  const direct = parseCandidateJson(cleaned)
  if (direct !== null) return direct

  const objectMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    const parsedObject = parseCandidateJson(objectMatch[0])
    if (parsedObject !== null) return parsedObject
  }

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    const parsedArray = parseCandidateJson(arrayMatch[0])
    if (parsedArray !== null) return parsedArray
  }

  throw new Error('模型返回 JSON 解析失败')
}

export function deriveKeypointTitle(text: string, index: number): string {
  const candidate = compactText(pickFirstSentence(text), 18)
  return candidate.length >= 4 ? candidate : `知识点${index + 1}`
}

export function normalizeKeypoints(raw: unknown): Keypoint[] {
  const data = raw as {
    keypoints?: Array<Partial<Keypoint> & { importance?: number }>
  }

  const list = Array.isArray(raw)
    ? (raw as Array<Partial<Keypoint> & { importance?: number }>)
    : Array.isArray(data?.keypoints)
      ? data.keypoints
      : []

  return list
    .map((item, index) => {
      const importanceRaw = Number(item.importance_score ?? item.importance ?? 5)
      const importance_score = Number.isFinite(importanceRaw)
        ? Math.max(1, Math.min(10, importanceRaw))
        : 5
      const evidence_quote = compactText(String(item.evidence_quote || ''), 160)
      const title = compactText(String(item.title || '').trim(), 30) || deriveKeypointTitle(evidence_quote, index)

      return {
        id: String(item.id || `kp_${index}`),
        title,
        importance_score,
        evidence_quote,
        why_important: compactText(String(item.why_important || '').trim(), 80),
      }
    })
    .filter((item) => item.title && item.evidence_quote)
}

function assignStableKeypointIds(list: Keypoint[], reindex: boolean): Keypoint[] {
  const seen = new Set<string>()

  return list.map((item, index) => {
    const seed = reindex ? `kp_${index}` : String(item.id || `kp_${index}`).trim()
    const baseId = seed || `kp_${index}`
    let nextId = baseId
    let suffix = 1

    while (seen.has(nextId)) {
      nextId = `${baseId}_${suffix}`
      suffix += 1
    }

    seen.add(nextId)
    return {
      ...item,
      id: nextId,
    }
  })
}

export function mergeKeypoints(list: Keypoint[], reindex = true): Keypoint[] {
  const map = new Map<string, Keypoint>()

  for (const keypoint of list) {
    const titleKey = normalizeTextForCompare(keypoint.title)
    const evidenceKey = normalizeTextForCompare(compactText(keypoint.evidence_quote, 30))
    const dedupeKey = titleKey || evidenceKey
    if (!dedupeKey) continue

    const existing = map.get(dedupeKey)
    if (!existing || keypoint.importance_score > existing.importance_score) {
      map.set(dedupeKey, keypoint)
    }
  }

  const merged = [...map.values()]
    .sort((a, b) => b.importance_score - a.importance_score)
    .slice(0, MAX_KEYPOINTS)

  return assignStableKeypointIds(merged, reindex)
}

function normalizeTagSignature(tag: unknown): string {
  return normalizeTextForCompare(normalizeQuestionTag(tag))
}

export function pickQuestionTag(rawTag: unknown, userTags: string[]): string {
  const normalizedUserTags = uniqueTexts(userTags.map((item) => normalizeQuestionTag(item))).slice(0, 7)
  if (normalizedUserTags.length === 0) {
    return normalizeQuestionTag(rawTag)
  }

  const clean = normalizeQuestionTag(rawTag)
  const signature = normalizeTagSignature(clean)
  if (signature) {
    const exact = normalizedUserTags.find((item) => normalizeTagSignature(item) === signature)
    if (exact) return exact

    const fuzzy = normalizedUserTags.find((item) => {
      const itemSignature = normalizeTagSignature(item)
      return itemSignature && (signature.includes(itemSignature) || itemSignature.includes(signature))
    })
    if (fuzzy) return fuzzy
  }

  return '综合'
}

export function inferKeypointTag(keypoint: Keypoint, userTags: string[]): string {
  const normalizedUserTags = uniqueTexts(userTags.map((item) => normalizeQuestionTag(item))).slice(0, 7)
  if (normalizedUserTags.length === 0) return '综合'

  const titleSignature = normalizeTagSignature(keypoint.title)
  const evidenceSignature = normalizeTagSignature(keypoint.evidence_quote)
  const matched = normalizedUserTags.find((item) => {
    const itemSignature = normalizeTagSignature(item)
    return itemSignature && (titleSignature.includes(itemSignature) || evidenceSignature.includes(itemSignature))
  })
  return matched || '综合'
}

function normalizeOptionObjects(rawOptions: unknown): QuestionOption[] {
  if (!Array.isArray(rawOptions)) return []

  const objectOptions = rawOptions.every((option) => typeof option === 'object' && option !== null)
    ? normalizeQuestionOptions(
        rawOptions as Array<{ key?: unknown; text?: unknown; content?: unknown; isCorrect?: unknown; correct?: unknown }>,
      )
    : undefined

  if (objectOptions) return objectOptions

  return rawOptions
    .map((option, index) => ({
      key: OPTION_KEYS[index] || String.fromCharCode(65 + index),
      text: compactText(String(option || ''), 90),
      isCorrect: false,
    }))
    .filter((option) => option.key && option.text)
}

function createDistractorPool(title: string, evidence: string): string[] {
  const safeTitle = compactText(title || '该知识点', 18)
  const safeEvidence = compactText(evidence, 30)

  return uniqueTexts([
    safeEvidence ? `将“${safeEvidence}”误当作唯一决定因素` : '',
    safeEvidence ? `把“${safeEvidence}”与相邻概念混为一谈` : '',
    `仅凭单一线索判断“${safeTitle}”`,
    `把“${safeTitle}”用于不适配的业务场景`,
    `把“${safeTitle}”与目标结果做反向因果推断`,
    `将“${safeTitle}”绝对化，不考虑前提条件`,
  ])
}

function ensureChoiceQuestionShape(
  options: QuestionOption[],
  rawAnswer: string,
  fallbackTitle: string,
  fallbackEvidence: string,
  questionType: 'single' | 'multi',
): { options: QuestionOption[]; answer: string } {
  const normalized = options
    .map((option, index) => ({
      key: String(option.key || OPTION_KEYS[index] || String.fromCharCode(65 + index)).toUpperCase(),
      text: compactText(String(option.text || ''), 90),
      isCorrect: Boolean(option.isCorrect),
    }))
    .filter((option) => option.text)

  const expectedCorrectCount = questionType === 'single' ? 1 : 2
  const answerKeysFromText = parseAnswerKeys(rawAnswer, normalized)
  const answerKeysFromMark = normalized
    .filter((option) => option.isCorrect)
    .map((option) => option.key)
  const baseAnswerKeys = answerKeysFromText.length > 0 ? answerKeysFromText : answerKeysFromMark

  const fallbackCorrectText = compactText(fallbackEvidence, 72) || `与“${compactText(fallbackTitle, 16) || '该知识点'}”一致的表述`
  const candidateCorrectTexts = uniqueTexts([
    ...baseAnswerKeys
      .map((key) => normalized.find((option) => option.key === key)?.text || '')
      .filter(Boolean),
    ...normalized.filter((option) => option.isCorrect).map((option) => option.text),
    /^[A-D,\s/|／，;；]+$/i.test(rawAnswer.trim()) ? '' : compactText(rawAnswer.trim(), 72),
    fallbackCorrectText,
    compactText(pickFirstSentence(fallbackEvidence), 72),
  ])

  const correctTexts = [...candidateCorrectTexts]
  while (correctTexts.length < expectedCorrectCount) {
    correctTexts.push(`${compactText(fallbackTitle || '该知识点', 16)}的正确表述${correctTexts.length + 1}`)
  }

  const wrongTexts = uniqueTexts([
    ...normalized.map((option) => option.text),
    ...createDistractorPool(fallbackTitle, fallbackEvidence),
  ]).filter(
    (text) => !correctTexts
      .slice(0, expectedCorrectCount)
      .some((correct) => normalizeTextForCompare(correct) === normalizeTextForCompare(text)),
  )

  let fallbackWrongIndex = 1
  while (wrongTexts.length < 4 - expectedCorrectCount) {
    wrongTexts.push(`对“${compactText(fallbackTitle || '该知识点', 14)}”的片面理解${fallbackWrongIndex}`)
    fallbackWrongIndex += 1
  }

  const answerIndexes: number[] = []
  for (const key of baseAnswerKeys) {
    const index = OPTION_KEYS.findIndex((item) => item === key)
    if (index >= 0 && !answerIndexes.includes(index)) {
      answerIndexes.push(index)
    }
    if (answerIndexes.length >= expectedCorrectCount) break
  }

  let cursor = 0
  while (answerIndexes.length < expectedCorrectCount) {
    const candidate = cursor % OPTION_KEYS.length
    if (!answerIndexes.includes(candidate)) {
      answerIndexes.push(candidate)
    }
    cursor += 2
  }

  const sortedAnswerIndexes = [...answerIndexes].sort((a, b) => a - b)

  const result: QuestionOption[] = []
  let correctCursor = 0
  let wrongCursor = 0

  for (let index = 0; index < OPTION_KEYS.length; index += 1) {
    const isCorrect = sortedAnswerIndexes.includes(index)
    result.push({
      key: OPTION_KEYS[index],
      text: isCorrect ? correctTexts[correctCursor] : wrongTexts[wrongCursor],
      isCorrect,
    })
    if (isCorrect) {
      correctCursor += 1
    } else {
      wrongCursor += 1
    }
  }

  const answer = questionType === 'single'
    ? OPTION_KEYS[sortedAnswerIndexes[0]]
    : sortedAnswerIndexes.map((index) => OPTION_KEYS[index]).join(',')

  return {
    options: result,
    answer,
  }
}

export function normalizeQuestions(
  raw: unknown,
  keypoints: Keypoint[],
  type: 'single' | 'multi',
  difficulty: 'easy' | 'medium' | 'hard',
  userTags: string[],
): Question[] {
  const data = raw as { questions?: Array<Partial<Question>> }
  const list = Array.isArray(raw)
    ? (raw as Array<Partial<Question>>)
    : Array.isArray(data?.questions)
      ? data.questions
      : []

  const keypointMap = new Map(keypoints.map((item) => [item.id, item]))
  const firstKeypoint = keypoints[0]

  return list
    .map((item, index) => {
      const rawType = String(item.type || '').toLowerCase().trim()
      const questionType: 'single' | 'multi' =
        rawType === 'multi' || rawType === 'multiple' || rawType === '多选'
          ? 'multi'
          : 'single'
      const keypointIdRaw = String(item.keypoint_id || '').trim()
      const keypoint_id = keypointMap.has(keypointIdRaw)
        ? keypointIdRaw
        : firstKeypoint?.id || `kp_${index % Math.max(1, keypoints.length)}`
      const linkedKeypoint = keypointMap.get(keypoint_id) || firstKeypoint

      const rawOptions = normalizeOptionObjects(item.options)
      const rawAnswer = String(item.answer || '').trim()
      const normalizedChoice = ensureChoiceQuestionShape(
        rawOptions,
        rawAnswer,
        linkedKeypoint?.title || '',
        linkedKeypoint?.evidence_quote || '',
        questionType,
      )

      const stem = compactText(
        String(item.stem || '').trim() || `根据材料知识点“${linkedKeypoint?.title || '核心概念'}”，完成该题。`,
        140,
      )
      const evidence_quote = compactText(
        String(item.evidence_quote || '').trim() || linkedKeypoint?.evidence_quote || '',
        160,
      )
      const level = String(item.difficulty || '').trim()
      const normalizedDifficulty: 'easy' | 'medium' | 'hard' =
        level === 'easy' || level === 'medium' || level === 'hard'
          ? level
          : difficulty

      return {
        id: String(item.id || `q_${index}`),
        type: questionType,
        stem,
        tag: pickQuestionTag(item.tag, userTags),
        options: normalizedChoice.options,
        answer: normalizedChoice.answer,
        explanation: compactText(String(item.explanation || '').trim(), 180),
        evidence_quote,
        keypoint_id,
        difficulty: normalizedDifficulty,
      } as Question
    })
    .filter((question) => {
      if (!question.stem || !question.answer) return false
      if (question.type !== type) return false
      if (!question.options || question.options.length !== 4) return false
      return true
    })
}

export function buildKeypointQuotas(keypoints: Keypoint[], count: number): KeypointQuota[] {
  if (keypoints.length === 0 || count <= 0) return []

  const sorted = [...keypoints].sort((a, b) => b.importance_score - a.importance_score)
  const totalWeight = sorted.reduce((sum, item) => sum + Math.max(1, item.importance_score), 0)
  const quotas = sorted.map((keypoint) => ({
    keypoint,
    expectedCount: Math.floor((Math.max(1, keypoint.importance_score) / totalWeight) * count),
  }))

  let allocated = quotas.reduce((sum, item) => sum + item.expectedCount, 0)
  const focusCount = Math.min(quotas.length, Math.max(1, Math.ceil(count / 3)))
  for (let index = 0; index < focusCount && allocated < count; index += 1) {
    quotas[index].expectedCount += 1
    allocated += 1
  }

  let cursor = 0
  while (allocated < count) {
    quotas[cursor % quotas.length].expectedCount += 1
    allocated += 1
    cursor += 1
  }

  return quotas.filter((item) => item.expectedCount > 0)
}

export function isPlaceholderStem(stem: string): boolean {
  const clean = String(stem || '').trim()
  return PLACEHOLDER_STEM_PATTERNS.some((pattern) => pattern.test(clean))
}

export function isPlaceholderOption(text: string): boolean {
  const clean = String(text || '').trim()
  return PLACEHOLDER_OPTION_PATTERNS.some((pattern) => pattern.test(clean))
}

export function isQuestionQualityAcceptable(question: Question): boolean {
  if (question.stem.trim().length < 8) return false
  if (!question.answer.trim()) return false
  if (!question.evidence_quote.trim()) return false
  if (isPlaceholderStem(question.stem)) return false

  if (!question.options || question.options.length !== 4) return false

  const optionSignatures = new Set<string>()
  for (const option of question.options) {
    const signature = normalizeTextForCompare(option.text)
    if (!signature || optionSignatures.has(signature)) return false
    if (isPlaceholderOption(option.text)) return false
    optionSignatures.add(signature)
  }

  const answerKeys = parseAnswerKeys(question.answer, question.options)
  if (question.type === 'single' && answerKeys.length !== 1) return false
  if (question.type === 'multi' && answerKeys.length < 2) return false

  for (const key of answerKeys) {
    const answerOption = question.options.find((option) => option.key === key)
    if (!answerOption || isPlaceholderOption(answerOption.text)) return false
  }

  return true
}

export function validateQuestion(question: Question, requireEvidence = true): string[] {
  const issues: string[] = []

  if (!question.id.trim()) issues.push('missing id')
  if (!question.stem.trim()) issues.push('missing stem')
  if (!question.answer.trim()) issues.push('missing answer')
  if (question.type !== 'single' && question.type !== 'multi') issues.push(`invalid type ${question.type}`)
  if (question.difficulty !== 'easy' && question.difficulty !== 'medium' && question.difficulty !== 'hard') {
    issues.push(`invalid difficulty ${question.difficulty}`)
  }
  if (requireEvidence && !question.evidence_quote.trim()) issues.push('missing evidence_quote')
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    issues.push('options must contain exactly 4 items')
  }
  if (Array.isArray(question.options)) {
    const seenOptionKeys = new Set<string>()
    question.options.forEach((option, index) => {
      const key = String(option.key || '').trim().toUpperCase()
      if (!key) issues.push(`option[${index}] missing key`)
      if (!String(option.text || '').trim()) issues.push(`option[${index}] missing text`)
      if (key && seenOptionKeys.has(key)) issues.push(`duplicate option key ${key}`)
      if (key) seenOptionKeys.add(key)
    })
    const answerKeys = parseAnswerKeys(question.answer, question.options)
    if (question.type === 'single' && answerKeys.length !== 1) {
      issues.push('single question must resolve to exactly one answer key')
    }
    if (question.type === 'multi' && answerKeys.length < 2) {
      issues.push('multi question must resolve to at least two answer keys')
    }
  }

  if (isPlaceholderStem(question.stem)) issues.push('placeholder stem')
  if (Array.isArray(question.options) && question.options.some((option) => isPlaceholderOption(option.text))) {
    issues.push('placeholder option')
  }

  return issues
}

export function validateQuestionList(questions: Question[], requireEvidence = true): QuestionValidationIssue[] {
  return questions
    .map((question) => ({
      questionId: question.id,
      messages: validateQuestion(question, requireEvidence),
    }))
    .filter((item) => item.messages.length > 0)
}

function normalizeOptionSignatures(question: Question): string[] {
  if (!Array.isArray(question.options)) return []
  return question.options
    .map((item) => normalizeTextForCompare(String(item?.text || '')))
    .filter(Boolean)
    .sort()
}

function normalizeCorrectOptionSignatures(question: Question): string[] {
  const options = question.options
  if (!Array.isArray(options) || options.length === 0) return []
  const fromAnswer = parseAnswerKeys(question.answer, options)
    .map((key) => options.find((option) => option.key === key))
    .map((item) => normalizeTextForCompare(String(item?.text || '')))
    .filter(Boolean)
  if (fromAnswer.length > 0) {
    return [...new Set(fromAnswer)]
  }

  const fromMarked = options
    .filter((item) => Boolean(item?.isCorrect))
    .map((item) => normalizeTextForCompare(String(item?.text || '')))
    .filter(Boolean)
  return [...new Set(fromMarked)]
}

export function getPrimaryCorrectSignature(question: Question): string {
  const signatures = normalizeCorrectOptionSignatures(question)
  return signatures[0] || ''
}

export function inferQuestionAngle(stem: string): QuestionAngle {
  const clean = normalizeTextForCompare(stem)
  if (!clean) return 'other'
  if (clean.includes('定义') || clean.includes('含义') || clean.includes('是什么') || clean.includes('概念')) {
    return 'definition'
  }
  if (clean.includes('公式') || clean.includes('计算') || clean.includes('怎么算') || clean.includes('求值')) {
    return 'formula'
  }
  if (clean.includes('影响') || clean.includes('因素') || clean.includes('决定') || clean.includes('导致')) {
    return 'factor'
  }
  if (clean.includes('场景') || clean.includes('适用') || clean.includes('应用') || clean.includes('业务')) {
    return 'scenario'
  }
  if (clean.includes('依据') || clean.includes('证据') || clean.includes('支持') || clean.includes('判断')) {
    return 'evidence'
  }
  return 'other'
}

function calcSetJaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  setA.forEach((value) => {
    if (setB.has(value)) intersection += 1
  })
  const union = new Set([...setA, ...setB]).size
  if (union <= 0) return 0
  return intersection / union
}

function isNearDuplicateQuestion(candidate: Question, existing: Question): boolean {
  if (candidate.type !== existing.type) return false

  const stemA = normalizeTextForCompare(candidate.stem)
  const stemB = normalizeTextForCompare(existing.stem)
  if (stemA && stemB) {
    if (stemA === stemB) return true
    if (stemA.includes(stemB) || stemB.includes(stemA)) {
      const minLength = Math.min(stemA.length, stemB.length)
      const maxLength = Math.max(stemA.length, stemB.length)
      if (maxLength > 0 && minLength / maxLength >= 0.68) {
        return true
      }
    }
  }

  const optionJaccard = calcSetJaccard(normalizeOptionSignatures(candidate), normalizeOptionSignatures(existing))
  const correctA = normalizeCorrectOptionSignatures(candidate)
  const correctB = normalizeCorrectOptionSignatures(existing)
  const correctOverlap = correctA.some((item) => correctB.includes(item))
  const evidenceA = normalizeTextForCompare(candidate.evidence_quote || '')
  const evidenceB = normalizeTextForCompare(existing.evidence_quote || '')
  const evidenceSimilar = Boolean(
    evidenceA
    && evidenceB
    && (evidenceA === evidenceB || evidenceA.includes(evidenceB) || evidenceB.includes(evidenceA)),
  )

  if (optionJaccard >= 0.82) return true
  if (optionJaccard >= 0.62 && correctOverlap) return true
  if (optionJaccard >= 0.68 && (evidenceSimilar || candidate.keypoint_id === existing.keypoint_id)) return true
  if (correctOverlap && evidenceSimilar && candidate.keypoint_id === existing.keypoint_id) return true
  return false
}

export function isQuestionDiverseEnough(candidate: Question, selected: Question[]): boolean {
  for (const existing of selected) {
    if (isNearDuplicateQuestion(candidate, existing)) return false
  }
  return true
}

export function dedupeQuestionsByDiversity(questions: Question[]): Question[] {
  const output: Question[] = []
  for (const question of questions) {
    if (!isQuestionDiverseEnough(question, output)) continue
    output.push(question)
  }
  return output
}

export function dedupeQuestionsByStem(questions: Question[]): Question[] {
  const seen = new Set<string>()
  const output: Question[] = []

  for (const question of questions) {
    const signature = normalizeTextForCompare(question.stem)
    if (!signature || seen.has(signature)) continue
    seen.add(signature)
    output.push(question)
  }

  return output
}

export function questionScore(question: Question, keypointMap: Map<string, Keypoint>): number {
  const importance = keypointMap.get(question.keypoint_id)?.importance_score || 1
  const evidenceBonus = Math.min(20, question.evidence_quote.trim().length / 6)
  const explanationBonus = question.explanation?.trim() ? 2 : 0
  return importance * 10 + evidenceBonus + explanationBonus
}

export function withQuestionDefaults(
  question: Question,
  keypointMap: Map<string, Keypoint>,
  difficulty: 'easy' | 'medium' | 'hard',
): Question {
  const linked = keypointMap.get(question.keypoint_id)
  const evidence = compactText(question.evidence_quote || linked?.evidence_quote || '', 160)
  const explanation = question.explanation?.trim()
    || (evidence ? `依据材料证据“${compactText(evidence, 26)}”可判断答案。` : '答案可由材料推导。')

  return {
    ...question,
    tag: normalizeQuestionTag(question.tag || '综合') || '综合',
    evidence_quote: evidence,
    explanation,
    difficulty: question.difficulty || difficulty,
  }
}

export function estimateUsableCandidateCount(
  candidates: Question[],
  keypoints: Keypoint[],
  type: 'single' | 'multi',
  difficulty: 'easy' | 'medium' | 'hard',
  excludeSignatures: string[] = [],
): number {
  const source = keypoints.length > 0
    ? keypoints
    : [
        {
          id: 'kp_0',
          title: '核心概念',
          importance_score: 5,
          evidence_quote: '材料中的核心信息',
          why_important: '兜底生成',
        },
      ]

  const keypointMap = new Map(source.map((item) => [item.id, item]))
  const normalizedCandidates = candidates
    .map((question) => withQuestionDefaults(question, keypointMap, difficulty))
    .filter((question) => question.type === type)
  const qualityCandidates = normalizedCandidates.filter((question) => isQuestionQualityAcceptable(question))
  const excluded = new Set(excludeSignatures)
  const deduped = dedupeQuestionsByDiversity(dedupeQuestionsByStem(qualityCandidates))
    .filter((question) => {
      const signature = buildQuestionSignature(question)
      if (!signature) return false
      return !excluded.has(signature)
    })
  return deduped.length
}
