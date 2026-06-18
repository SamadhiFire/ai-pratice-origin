import type { Keypoint, Question, QuestionOption } from '../../types'
import type { Chunk } from '../preprocess'
import type { KeypointQuota, QuestionAngle } from './parser-validator.ts'
import { OPTION_KEYS, buildQuestionSignature, normalizeTextForCompare, sortChoiceKeys } from '../question-schema.ts'
import {
  buildKeypointQuotas,
  dedupeQuestionsByDiversity,
  dedupeQuestionsByStem,
  deriveKeypointTitle,
  getPrimaryCorrectSignature,
  inferKeypointTag,
  inferQuestionAngle,
  isPlaceholderOption,
  isPlaceholderStem,
  isQuestionDiverseEnough,
  isQuestionQualityAcceptable,
  questionScore,
  withQuestionDefaults,
} from './parser-validator.ts'
import { compactText, normalizeSignatureList, pickFirstSentence, uniqueTexts } from './shared.ts'

const MAX_KEYPOINTS = 6
const ENABLE_TEMPLATE_FALLBACK_QUESTIONS = false
const ENABLE_EMERGENCY_TEMPLATE_FALLBACK = true

const SINGLE_FALLBACK_STEM_TEMPLATES = [
  '以下哪条证据最能直接支持“{title}”？',
  '围绕“{title}”，下列哪项表述与材料一致？',
  '若判断“{title}”，应优先依据哪条信息？',
  '根据材料，关于“{title}”最准确的是哪一项？',
  '下列哪项最能体现“{title}”的关键证据？',
  '关于“{title}”，哪项判断最贴合原文？',
]

const SINGLE_FALLBACK_FOCUS_SUFFIXES = [
  '（聚焦定义边界）',
  '（关注限定条件）',
  '（强调证据来源）',
  '（优先排除反例）',
  '（关注因果方向）',
  '（识别概念差异）',
  '（辨析适用场景）',
  '（核对关键词）',
]

const MULTI_FALLBACK_STEM_TEMPLATES = [
  '关于“{title}”，下列哪些选项与材料一致？',
  '围绕“{title}”，请选择所有符合材料的表述。',
  '根据材料判断“{title}”，哪些选项成立？',
  '关于“{title}”，下列哪些项可由原文直接支持？',
]

const MULTI_FALLBACK_FOCUS_SUFFIXES = [
  '（至少排除两项干扰）',
  '（关注并列条件）',
  '（避免绝对化表述）',
  '（关注证据一致性）',
  '（识别概念混淆）',
  '（校验逻辑先后）',
  '（比对关键术语）',
  '（核对适用边界）',
]

interface ConceptFallbackPreset {
  keywordSignatures: string[]
  correctFacts: string[]
  distractors: string[]
}

interface QuotaAllocation {
  selected: Question[]
  shortages: Array<{
    keypoint: Keypoint
    missing: number
  }>
}

const CONCEPT_FALLBACK_PRESETS: ConceptFallbackPreset[] = [
  {
    keywordSignatures: ['ecpm', 'effectivecostpermille', '千次展示收益'],
    correctFacts: [
      'eCPM（每千次展示收益）= 总收益 / 总展示次数 * 1000',
      'eCPM用于衡量每千次广告展示能够产生的收益',
      'eCPM会受到出价、预估点击率、转化率与填充率等因素影响',
    ],
    distractors: [
      'eCPM 与 CPC 完全同义',
      'eCPM 只看点击率，不考虑收益与展示量',
      'eCPM 越高代表每次点击成本必然越低',
      'eCPM 与投放填充率无关',
    ],
  },
  {
    keywordSignatures: ['ctr', 'clickthroughrate', '点击率'],
    correctFacts: [
      'CTR（点击率）= 点击次数 / 展示次数',
      'CTR反映广告素材和人群匹配程度',
    ],
    distractors: [
      'CTR = 展示次数 / 点击次数',
      'CTR 只由出价决定，与创意内容无关',
      'CTR 越高代表转化率一定越高',
    ],
  },
]

function pickConceptFallbackPreset(title: string, evidence: string): ConceptFallbackPreset | null {
  const signature = normalizeTextForCompare(`${title} ${evidence}`)
  if (!signature) return null
  return CONCEPT_FALLBACK_PRESETS.find((item) => item.keywordSignatures.some((key) => signature.includes(key))) || null
}

function rotateArray<T>(list: T[], offset: number): T[] {
  if (list.length <= 1) return [...list]
  const start = ((offset % list.length) + list.length) % list.length
  return [...list.slice(start), ...list.slice(0, start)]
}

function createDistractorPool(title: string, evidence: string): string[] {
  const safeTitle = compactText(title || '该知识点', 18)
  const safeEvidence = compactText(evidence, 30)
  const preset = pickConceptFallbackPreset(title, evidence)

  return uniqueTexts([
    ...(preset?.distractors || []),
    safeEvidence ? `将“${safeEvidence}”误当作唯一决定因素` : '',
    safeEvidence ? `把“${safeEvidence}”与相邻概念混为一谈` : '',
    `仅凭单一线索判断“${safeTitle}”`,
    `把“${safeTitle}”用于不适配的业务场景`,
    `把“${safeTitle}”与目标结果做反向因果推断`,
    `将“${safeTitle}”绝对化，不考虑前提条件`,
  ])
}

export function fallbackKeypointsFromChunks(chunks: Chunk[]): Keypoint[] {
  return chunks.slice(0, Math.min(MAX_KEYPOINTS, chunks.length)).map((chunk, index) => {
    const evidence_quote = compactText(pickFirstSentence(chunk.text), 140) || compactText(chunk.text, 140)
    return {
      id: `kp_${index}`,
      title: deriveKeypointTitle(evidence_quote, index),
      importance_score: Math.max(1, 8 - index),
      evidence_quote,
      why_important: '从材料自动提炼的关键信息',
    }
  })
}

function allocateExistingByQuota(questions: Question[], quotas: KeypointQuota[]): QuotaAllocation {
  const byKeypoint = new Map<string, Question[]>()
  for (const question of questions) {
    const bucket = byKeypoint.get(question.keypoint_id)
    if (bucket) {
      bucket.push(question)
    } else {
      byKeypoint.set(question.keypoint_id, [question])
    }
  }

  const selected: Question[] = []
  const selectedStem = new Set<string>()
  const shortages: QuotaAllocation['shortages'] = []

  for (const quota of quotas) {
    const list = byKeypoint.get(quota.keypoint.id) || []
    let taken = 0

    for (const question of list) {
      if (taken >= quota.expectedCount) break
      const stemSignature = normalizeTextForCompare(question.stem)
      if (!stemSignature || selectedStem.has(stemSignature)) continue
      selected.push(question)
      selectedStem.add(stemSignature)
      taken += 1
    }

    if (taken < quota.expectedCount) {
      shortages.push({
        keypoint: quota.keypoint,
        missing: quota.expectedCount - taken,
      })
    }
  }

  return { selected, shortages }
}

function buildFallbackSingleStem(keypoint: Keypoint, seed: number): string {
  const template = SINGLE_FALLBACK_STEM_TEMPLATES[seed % SINGLE_FALLBACK_STEM_TEMPLATES.length]
  const suffix = SINGLE_FALLBACK_FOCUS_SUFFIXES[
    Math.floor(seed / SINGLE_FALLBACK_STEM_TEMPLATES.length) % SINGLE_FALLBACK_FOCUS_SUFFIXES.length
  ]
  return `${template.replace('{title}', keypoint.title)}${suffix}`
}

function buildFallbackMultiStem(keypoint: Keypoint, seed: number): string {
  const template = MULTI_FALLBACK_STEM_TEMPLATES[seed % MULTI_FALLBACK_STEM_TEMPLATES.length]
  const suffix = MULTI_FALLBACK_FOCUS_SUFFIXES[
    Math.floor(seed / MULTI_FALLBACK_STEM_TEMPLATES.length) % MULTI_FALLBACK_FOCUS_SUFFIXES.length
  ]
  return `${template.replace('{title}', keypoint.title)}${suffix}`
}

function buildMultiCorrectTexts(keypoint: Keypoint): string[] {
  const evidence = compactText(keypoint.evidence_quote, 72)
  const sentence = compactText(pickFirstSentence(keypoint.evidence_quote), 72)
  const title = compactText(keypoint.title, 18)
  const preset = pickConceptFallbackPreset(keypoint.title, keypoint.evidence_quote)

  const list = uniqueTexts([
    ...(preset?.correctFacts || []),
    evidence,
    sentence,
    `材料可直接支持“${title}”相关判断`,
    `“${title}”在原文中有明确证据`,
  ]).filter(Boolean)

  while (list.length < 2) {
    list.push(`与“${title || '该知识点'}”一致的材料表述${list.length + 1}`)
  }

  return list.slice(0, 2)
}

function buildSingleCorrectTexts(keypoint: Keypoint): string[] {
  const evidence = compactText(keypoint.evidence_quote, 72)
  const sentence = compactText(pickFirstSentence(keypoint.evidence_quote), 72)
  const title = compactText(keypoint.title, 18)
  const preset = pickConceptFallbackPreset(keypoint.title, keypoint.evidence_quote)
  const list = uniqueTexts([
    ...(preset?.correctFacts || []),
    evidence,
    sentence,
    `“${title}”的定义与材料一致`,
    `“${title}”可由原文证据直接支持`,
  ]).filter(Boolean)
  return list.length > 0 ? list : [evidence || `与“${title || '该知识点'}”一致的证据`]
}

function buildFallbackSingleQuestion(
  keypoint: Keypoint,
  keypoints: Keypoint[],
  difficulty: 'easy' | 'medium' | 'hard',
  userTags: string[],
  seed: number,
): Question {
  const stem = buildFallbackSingleStem(keypoint, seed)
  const correctTexts = buildSingleCorrectTexts(keypoint)
  const evidence = correctTexts[seed % correctTexts.length] || `与“${keypoint.title}”一致的证据`

  const otherEvidence = keypoints
    .filter((item) => item.id !== keypoint.id)
    .map((item) => compactText(item.evidence_quote, 72))
    .filter(Boolean)

  const wrongPool = uniqueTexts([
    ...rotateArray(otherEvidence, seed),
    ...createDistractorPool(keypoint.title, keypoint.evidence_quote),
  ]).filter((text) => {
    const signature = normalizeTextForCompare(text)
    if (!signature) return false
    return !correctTexts.some((item) => normalizeTextForCompare(item) === signature)
  })

  let fallbackWrongIndex = 1
  while (wrongPool.length < 3) {
    wrongPool.push(`对“${compactText(keypoint.title, 14)}”的片面理解${fallbackWrongIndex}`)
    fallbackWrongIndex += 1
  }

  const answerIndex = seed % OPTION_KEYS.length
  const options: QuestionOption[] = []
  let wrongCursor = 0

  for (let index = 0; index < OPTION_KEYS.length; index += 1) {
    const isCorrect = index === answerIndex
    options.push({
      key: OPTION_KEYS[index],
      text: isCorrect ? evidence : wrongPool[wrongCursor],
      isCorrect,
    })
    if (!isCorrect) wrongCursor += 1
  }

  return {
    id: `fallback_single_${keypoint.id}_${seed}`,
    type: 'single',
    stem,
    tag: inferKeypointTag(keypoint, userTags),
    options,
    answer: OPTION_KEYS[answerIndex],
    explanation: `依据材料证据“${compactText(evidence, 26)}”可判断正确选项。`,
    evidence_quote: evidence,
    keypoint_id: keypoint.id,
    difficulty,
  }
}

function buildFallbackMultiQuestion(
  keypoint: Keypoint,
  keypoints: Keypoint[],
  difficulty: 'easy' | 'medium' | 'hard',
  userTags: string[],
  seed: number,
): Question {
  const stem = buildFallbackMultiStem(keypoint, seed)
  const evidence = compactText(keypoint.evidence_quote, 72)
  const correctTexts = buildMultiCorrectTexts(keypoint)

  const otherEvidence = keypoints
    .filter((item) => item.id !== keypoint.id)
    .map((item) => compactText(item.evidence_quote, 72))
    .filter(Boolean)

  const wrongPool = uniqueTexts([
    ...rotateArray(otherEvidence, seed),
    ...createDistractorPool(keypoint.title, keypoint.evidence_quote),
  ]).filter((item) => !correctTexts.some((text) => normalizeTextForCompare(text) === normalizeTextForCompare(item)))

  while (wrongPool.length < 2) {
    wrongPool.push(`与“${compactText(keypoint.title, 14)}”不符的推断${wrongPool.length + 1}`)
  }

  const firstCorrectIndex = seed % OPTION_KEYS.length
  const secondCorrectIndex = (seed + 2) % OPTION_KEYS.length
  const answerIndexes = sortChoiceKeys([
    OPTION_KEYS[firstCorrectIndex],
    OPTION_KEYS[secondCorrectIndex],
  ]).map((key) => OPTION_KEYS.indexOf(key as (typeof OPTION_KEYS)[number]))

  const options: QuestionOption[] = []
  let correctCursor = 0
  let wrongCursor = 0
  for (let index = 0; index < OPTION_KEYS.length; index += 1) {
    const isCorrect = answerIndexes.includes(index)
    options.push({
      key: OPTION_KEYS[index],
      text: isCorrect ? correctTexts[correctCursor] : wrongPool[wrongCursor],
      isCorrect,
    })
    if (isCorrect) {
      correctCursor += 1
    } else {
      wrongCursor += 1
    }
  }

  const answer = answerIndexes.map((index) => OPTION_KEYS[index]).join(',')

  return {
    id: `fallback_multi_${keypoint.id}_${seed}`,
    type: 'multi',
    stem,
    tag: inferKeypointTag(keypoint, userTags),
    options,
    answer,
    explanation: `可由材料证据“${compactText(evidence, 26)}”排除干扰项并确定多个正确选项。`,
    evidence_quote: evidence,
    keypoint_id: keypoint.id,
    difficulty,
  }
}

function buildFallbackQuestion(
  keypoint: Keypoint,
  keypoints: Keypoint[],
  type: 'single' | 'multi',
  difficulty: 'easy' | 'medium' | 'hard',
  userTags: string[],
  seed: number,
): Question {
  if (type === 'single') {
    return buildFallbackSingleQuestion(keypoint, keypoints, difficulty, userTags, seed)
  }
  return buildFallbackMultiQuestion(keypoint, keypoints, difficulty, userTags, seed)
}

function appendFallbackQuestions(
  target: Question[],
  usedStem: Set<string>,
  keypoint: Keypoint,
  keypoints: Keypoint[],
  type: 'single' | 'multi',
  difficulty: 'easy' | 'medium' | 'hard',
  userTags: string[],
  amount: number,
  seedStart: number,
  acceptCandidate?: (candidate: Question) => boolean,
): number {
  let seed = seedStart
  let produced = 0
  let attempts = 0
  const maxAttempts = Math.max(16, amount * 40)

  while (produced < amount && attempts < maxAttempts) {
    const candidate = buildFallbackQuestion(keypoint, keypoints, type, difficulty, userTags, seed)
    const signature = normalizeTextForCompare(candidate.stem)
    const accepted = typeof acceptCandidate === 'function' ? acceptCandidate(candidate) : true
    if (signature && !usedStem.has(signature) && accepted) {
      target.push(candidate)
      usedStem.add(signature)
      produced += 1
    }
    seed += 1
    attempts += 1
  }

  return seed
}

export function ensureUniqueQuestionIds(list: Question[]): Question[] {
  const seen = new Set<string>()

  return list.map((question, index) => {
    const baseId = String(question.id || `q_${index}`).trim() || `q_${index}`
    let nextId = baseId
    let suffix = 1

    while (seen.has(nextId)) {
      nextId = `${baseId}_${suffix}`
      suffix += 1
    }

    seen.add(nextId)
    return {
      ...question,
      id: nextId,
    }
  })
}

export function fallbackQuestions(
  keypoints: Keypoint[],
  type: 'single' | 'multi',
  count: number,
  difficulty: 'easy' | 'medium' | 'hard',
  userTags: string[],
  excludeSignatures: string[] = [],
): Question[] {
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

  const quotas = buildKeypointQuotas(source, count)
  const questions: Question[] = []
  const usedStem = new Set<string>()
  const usedQuestionSignatures = new Set(normalizeSignatureList(excludeSignatures))
  const canAcceptCandidate = (candidate: Question): boolean => {
    const signature = buildQuestionSignature(candidate)
    if (!signature || usedQuestionSignatures.has(signature)) return false
    if (!isQuestionDiverseEnough(candidate, questions)) return false
    usedQuestionSignatures.add(signature)
    return true
  }
  let seed = 0

  for (const quota of quotas) {
    seed = appendFallbackQuestions(
      questions,
      usedStem,
      quota.keypoint,
      source,
      type,
      difficulty,
      userTags,
      quota.expectedCount,
      seed,
      canAcceptCandidate,
    )
  }

  let cursor = 0
  while (questions.length < count && cursor < count * 10) {
    const keypoint = source[cursor % source.length]
    seed = appendFallbackQuestions(
      questions,
      usedStem,
      keypoint,
      source,
      type,
      difficulty,
      userTags,
      1,
      seed,
      canAcceptCandidate,
    )
    cursor += 1
  }

  return ensureUniqueQuestionIds(dedupeQuestionsByDiversity(questions).slice(0, count))
}

export function finalizeQuestionSet(
  candidates: Question[],
  keypoints: Keypoint[],
  type: 'single' | 'multi',
  count: number,
  difficulty: 'easy' | 'medium' | 'hard',
  userTags: string[],
  excludeSignatures: string[] = [],
): Question[] {
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
  const sortedByScore = [...qualityCandidates].sort((a, b) => questionScore(b, keypointMap) - questionScore(a, keypointMap))
  const deduped = dedupeQuestionsByDiversity(dedupeQuestionsByStem(sortedByScore))
  const rawBackupCandidates = dedupeQuestionsByStem(
    [...normalizedCandidates]
      .filter((question) => !isPlaceholderStem(question.stem))
      .filter((question) => (question.options || []).every((option) => !isPlaceholderOption(option.text)))
      .sort((a, b) => questionScore(b, keypointMap) - questionScore(a, keypointMap)),
  )
  const backupCandidates = dedupeQuestionsByDiversity(rawBackupCandidates)

  const quotas = buildKeypointQuotas(source, count)
  const allocation = allocateExistingByQuota(deduped, quotas)
  const selected: Question[] = []
  const usedStem = new Set(selected.map((item) => normalizeTextForCompare(item.stem)))
  const usedQuestionSignatures = new Set(normalizeSignatureList(excludeSignatures))
  const usedPrimaryCorrectByKeypoint = new Map<string, Set<string>>()
  const usedAngleByKeypoint = new Map<string, Set<QuestionAngle>>()

  const getCorrectSet = (keypointId: string): Set<string> => {
    const key = String(keypointId || '').trim() || '__unknown__'
    const existing = usedPrimaryCorrectByKeypoint.get(key)
    if (existing) return existing
    const created = new Set<string>()
    usedPrimaryCorrectByKeypoint.set(key, created)
    return created
  }

  const getAngleSet = (keypointId: string): Set<QuestionAngle> => {
    const key = String(keypointId || '').trim() || '__unknown__'
    const existing = usedAngleByKeypoint.get(key)
    if (existing) return existing
    const created = new Set<QuestionAngle>()
    usedAngleByKeypoint.set(key, created)
    return created
  }

  const markSelected = (question: Question): void => {
    const primaryCorrect = getPrimaryCorrectSignature(question)
    if (primaryCorrect) {
      getCorrectSet(question.keypoint_id).add(primaryCorrect)
    }
    const angle = inferQuestionAngle(question.stem)
    if (angle !== 'other') {
      getAngleSet(question.keypoint_id).add(angle)
    }
  }

  const canSelectBySemanticConstraints = (question: Question, strict: boolean): boolean => {
    if (!strict) return true
    const primaryCorrect = getPrimaryCorrectSignature(question)
    if (primaryCorrect && getCorrectSet(question.keypoint_id).has(primaryCorrect)) {
      return false
    }
    const angle = inferQuestionAngle(question.stem)
    if (angle !== 'other') {
      const usedAngles = getAngleSet(question.keypoint_id)
      const softLimit = Math.max(1, Math.floor(count * 0.75))
      if (usedAngles.has(angle) && selected.length < softLimit) {
        return false
      }
    }
    return true
  }

  const trySelect = (question: Question, strict = true): boolean => {
    const signature = normalizeTextForCompare(question.stem)
    if (!signature || usedStem.has(signature)) return false
    const questionSignature = buildQuestionSignature(question)
    if (!questionSignature || usedQuestionSignatures.has(questionSignature)) return false
    if (!isQuestionDiverseEnough(question, selected)) return false
    if (!canSelectBySemanticConstraints(question, strict)) return false
    selected.push(question)
    usedStem.add(signature)
    usedQuestionSignatures.add(questionSignature)
    markSelected(question)
    return true
  }

  allocation.selected.forEach((question) => {
    if (selected.length >= count) return
    void trySelect(question, true)
  })

  if (selected.length < count) {
    for (const question of deduped) {
      if (selected.length >= count) break
      if (!trySelect(question, true)) continue
    }
  }

  if (selected.length < count) {
    for (const question of backupCandidates) {
      if (selected.length >= count) break
      if (!trySelect(question, true)) continue
    }
  }

  const shouldUseTemplateFallback = ENABLE_TEMPLATE_FALLBACK_QUESTIONS
    || (ENABLE_EMERGENCY_TEMPLATE_FALLBACK && selected.length === 0)
    || selected.length < count

  if (shouldUseTemplateFallback) {
    let seed = 0
    for (const shortage of allocation.shortages) {
      if (selected.length >= count) break
      const missing = Math.min(shortage.missing, count - selected.length)
      seed = appendFallbackQuestions(
        selected,
        usedStem,
        shortage.keypoint,
        source,
        type,
        difficulty,
        userTags,
        missing,
        seed,
        (candidate) => isQuestionDiverseEnough(candidate, selected) && canSelectBySemanticConstraints(candidate, true),
      )
    }

    if (selected.length < count) {
      const supplements = fallbackQuestions(
        source,
        type,
        count - selected.length,
        difficulty,
        userTags,
        [...usedQuestionSignatures],
      )
      for (const question of supplements) {
        if (selected.length >= count) break
        if (!trySelect(question, false)) continue
      }
    }
  }

  if (selected.length < count) {
    for (const question of backupCandidates) {
      if (selected.length >= count) break
      if (!trySelect(question, false)) continue
    }
  }

  if (selected.length < count) {
    const supplements = fallbackQuestions(
      source,
      type,
      count - selected.length,
      difficulty,
      userTags,
      [...usedQuestionSignatures],
    )
    for (const question of supplements) {
      if (selected.length >= count) break
      if (!trySelect(question, false)) continue
    }
  }

  if (selected.length < count) {
    for (const question of rawBackupCandidates) {
      if (selected.length >= count) break
      const signature = normalizeTextForCompare(question.stem)
      if (!signature || usedStem.has(signature)) continue
      const questionSignature = buildQuestionSignature(question)
      if (!questionSignature || usedQuestionSignatures.has(questionSignature)) continue
      selected.push(question)
      usedStem.add(signature)
      usedQuestionSignatures.add(questionSignature)
      markSelected(question)
    }
  }

  return ensureUniqueQuestionIds(selected.slice(0, count))
}
