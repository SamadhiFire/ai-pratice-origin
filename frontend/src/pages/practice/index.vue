<template>
  <view class="oa-page session-page">
    <view class="session-fixed-shell">
      <view class="oa-header session-header" :style="sessionHeaderStyle">
        <view class="oa-title session-title">开始做题</view>
        <view class="oa-subtitle session-subtitle">逐题作答，交卷后查看得分与正确答案</view>
      </view>

      <view v-if="!loadError" class="oa-card oa-card-strong session-progress">
        <view class="oa-card-head">
          <text class="oa-card-title">第 {{ currentIndex + 1 }} / {{ questionCount }} 题</text>
          <text class="oa-note">{{ currentQuestionTagLabel }} · {{ sessionModeLabel }} · {{ feedbackModeLabel }} · 已答 {{ answeredCount }} 题</text>
        </view>
        <view class="progress-track">
          <view class="progress-bar" :style="{ width: `${progressPercent}%` }"></view>
        </view>
        <view v-if="generationHintText" class="generation-hint">{{ generationHintText }}</view>
      </view>
    </view>

    <scroll-view class="oa-scroll session-scroll" :style="sessionScrollStyle" scroll-y :show-scrollbar="false">
      <view v-if="loadError" class="oa-stack">
        <view class="oa-card oa-card-strong">
          <view class="oa-card-head">
            <text class="oa-card-title">暂无可练习题目</text>
          </view>
          <view class="oa-item-text">{{ loadError }}</view>
          <view class="oa-gap-16"></view>
          <button class="oa-btn" hover-class="oa-btn-hover" @click="backToGenerate">返回刷题页</button>
        </view>
      </view>

      <view v-else class="oa-stack">
        <view v-if="currentQuestion" class="oa-card oa-card-gradient question-card">
          <view class="oa-shape oa-shape-a"></view>
          <view class="oa-card-head">
            <text class="oa-card-title">{{ questionTypeLabel(currentQuestion.type) }}</text>
            <text class="oa-note">{{ difficultyLabel(currentQuestion.difficulty) }}</text>
          </view>

          <view class="question-stem oa-break">{{ currentQuestion.stem }}</view>

          <view class="oa-gap-14 choice-group">
            <view v-if="currentQuestion.type === 'multi'" class="oa-item-text">{{ multiTips }}</view>
            <view
              v-for="opt in currentQuestion.options || []"
              :key="opt.key"
              class="choice-item"
              :class="choiceClass(opt.key)"
              @click="selectOption(opt.key)"
            >
              <text class="choice-key">{{ opt.key }}</text>
              <text class="choice-text oa-break">{{ opt.text }}</text>
            </view>
          </view>

          <view v-if="shouldShowFeedback(currentQuestion.id)" class="oa-gap-16">
            <view class="answer-panel" :class="questionResult(currentQuestion.id)?.correct ? 'is-ok' : 'is-bad'">
              <view class="answer-line">你的答案：{{ showEmpty(questionResult(currentQuestion.id)?.user) }}</view>
              <view class="answer-line">正确答案：{{ showEmpty(questionResult(currentQuestion.id)?.expected) }}</view>
          </view>
            <view v-if="currentQuestion.explanation" class="oa-item-text oa-break">解析：{{ currentQuestion.explanation }}</view>
          </view>
        </view>

        <view class="oa-card oa-card-strong action-card">
          <view class="action-tier action-tier-primary">
            <view class="oa-row action-row">
              <button class="oa-btn oa-btn-small action-btn action-btn-secondary" hover-class="oa-btn-hover" :disabled="currentIndex === 0" @click="goPrev">
                上一题
              </button>
              <button class="oa-btn oa-btn-small action-btn action-btn-secondary" hover-class="oa-btn-hover" :disabled="isNextButtonDisabled" @click="goNext">
                下一题
              </button>
              <button
                v-if="!submitted && !isInstantFeedback"
                class="oa-btn oa-btn-small action-btn"
                :class="answeredCount >= questionCount ? 'action-btn-primary' : 'action-btn-secondary'"
                hover-class="oa-btn-hover"
                @click="submitPaper"
              >
                交卷
              </button>
              <button v-else-if="submitted" class="oa-btn oa-btn-small action-btn action-btn-primary" hover-class="oa-btn-hover" @click="backToGenerate">
                返回刷题页
              </button>
              <button v-else-if="allGradedButNotSubmitted" class="oa-btn oa-btn-small action-btn action-btn-primary" hover-class="oa-btn-hover" @click="finalizeInstantFeedback">
                查看结果
              </button>
              <button v-else class="oa-btn oa-btn-small action-btn action-btn-primary" disabled>即时反馈中</button>
            </view>
          </view>
          <view class="abandon-wrap action-tier action-tier-secondary">
            <button class="abandon-btn" hover-class="abandon-btn-hover" @tap="abandonQuiz">
              <text class="abandon-icon">↩</text>
              <text class="abandon-label">本牛马不做了！</text>
            </button>
          </view>
        </view>

        <view v-if="submitted" class="oa-card">
          <view class="oa-card-head">
            <text class="oa-card-title">交卷结果</text>
            <text class="oa-note">得分 {{ score }} / {{ questionCount }}</text>
          </view>
          <view class="result-grid">
            <view
              v-for="(item, idx) in sessionQuestions"
              :key="item.id"
              class="result-chip"
              :class="questionResult(item.id)?.correct ? 'result-ok' : 'result-bad'"
              @click="jumpTo(idx)"
            >
              第{{ idx + 1 }}题 {{ questionResult(item.id)?.correct ? '✓' : '✕' }}
            </view>
          </view>
        </view>
      </view>

    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import type { StoredQuestion } from '../../utils/question-bank'
import { setQuestionWrong, submitQuestionAttempt } from '../../utils/question-bank'
import {
  PRACTICE_SESSION_UPDATED_EVENT,
  type PracticeSession,
  type PracticeFeedbackMode,
  clearActivePracticeSession,
  hydrateActivePracticeSessionFromBackend,
  loadActivePracticeSession,
} from '../../utils/practice-session'
import {
  GENERATION_JOB_UPDATED_EVENT,
  cancelGenerationJob,
  getBatchState,
  getNextLoadableBatch,
  loadGenerationJobBySession,
  restoreGenerationJobFromBackend,
  triggerGenerationBatch,
  type GenerationBatchState,
  type GenerationJob,
} from '../../utils/generation-job'
import { loadUserTags } from '../../utils/user-tags'

type QuestionType = 'single' | 'multi'
type Difficulty = 'easy' | 'medium' | 'hard'

type GradeInfo = {
  correct: boolean
  user: string
  expected: string
}

const sessionQuestions = ref<StoredQuestion[]>([])
const sessionMode = ref<'modeA' | 'modeB'>('modeA')
const feedbackMode = ref<PracticeFeedbackMode>('after_all')
const currentIndex = ref(0)
const answers = ref<Record<string, string>>({})
const submitted = ref(false)
const grading = ref<Record<string, GradeInfo>>({})
const loadError = ref('')
const activeUserTags = ref<string[]>([])
const activeSessionId = ref('')
const generationJob = ref<GenerationJob | null>(null)
const sessionHeaderTopPx = ref(64)
const sessionFixedHeightPx = ref(220)
const isMounted = ref(true)
let stopWatchCurrentIndex: () => void
let stopWatchMultiple: () => void
const sessionHeaderStyle = computed(() => ({
  paddingTop: `${sessionHeaderTopPx.value}px`,
}))
const sessionScrollStyle = computed(() => ({
  paddingTop: `${sessionFixedHeightPx.value}px`,
}))
const BATCH2_TRIGGER_INDEX = 3
const BATCH3_TRIGGER_INDEX = 15
const batchTriggerInFlight = new Set<string>()
const autoTriggeredBatchSet = new Set<string>()
let autoTriggerScopeJobId = ''

const questionCount = computed(() => sessionQuestions.value.length)
const answeredCount = computed(() =>
  sessionQuestions.value.filter((item) => String(answers.value[item.id] || '').trim().length > 0).length,
)
const progressPercent = computed(() => {
  if (questionCount.value === 0) return 0
  return ((currentIndex.value + 1) / questionCount.value) * 100
})
const currentQuestion = computed(() => sessionQuestions.value[currentIndex.value] || null)
const score = computed(() => Object.values(grading.value).filter((item) => item.correct).length)
const isInstantFeedback = computed(() => feedbackMode.value === 'instant')
const sessionModeLabel = computed(() => (sessionMode.value === 'modeA' ? '原文提取' : '知识拓展'))
const feedbackModeLabel = computed(() => (isInstantFeedback.value ? '即时反馈' : '全做再看'))
const currentQuestionTagLabel = computed(() => resolveDisplayTag(currentQuestion.value?.tag))
const multiTips = computed(() =>
  isInstantFeedback.value
    ? `可多选，选满 ${expectedMultiChoiceCount.value} 项后自动判题`
    : '可多选，再次点击可取消',
)
const expectedMultiChoiceCount = computed(() => {
  const question = currentQuestion.value
  if (!question || question.type !== 'multi') return 2
  return resolveExpectedChoiceCount(question)
})
const hasPendingGeneration = computed(() => {
  if (!generationJob.value) return false
  if (generationJob.value.status !== 'running') return false
  return questionCount.value < generationJob.value.targetCount
})
const generationHintText = computed(() => {
  const job = generationJob.value
  if (!job || !hasPendingGeneration.value) return ''

  const nextBatchIndex = getNextLoadableBatch(job)
  if (!nextBatchIndex) {
    return `后续题目加载中，已加载 ${questionCount.value}/${job.targetCount}`
  }

  const batch = getBatchState(job, nextBatchIndex)
  if (batch.status === 'loading') {
    return `后续题目加载中，已加载 ${questionCount.value}/${job.targetCount}`
  }
  if (batch.status === 'error') {
    return '后续题目加载失败，继续点击“下一题”重试'
  }
  return `后续题目加载中，已加载 ${questionCount.value}/${job.targetCount}`
})
const isNextButtonDisabled = computed(() => {
  if (questionCount.value <= 0) return true
  if (currentIndex.value < questionCount.value - 1) return false
  if (hasPendingGeneration.value) return false
  return true
})
const DEFAULT_GENERAL_TAG = '综合'
const DEFAULT_OTHER_TAG = '其他'

onLoad(() => {
  sessionHeaderTopPx.value = resolveSessionHeaderTopPadding()
  syncSessionFixedHeight()
  activeUserTags.value = loadUserTags()
  initPracticeFromLocalSession(false)
  uni.$on(PRACTICE_SESSION_UPDATED_EVENT, handlePracticeSessionUpdated)
  uni.$on(GENERATION_JOB_UPDATED_EVENT, handleGenerationJobUpdated)
  if (!sessionQuestions.value.length) {
    void hydrateActivePracticeSessionFromBackend()
      .finally(() => {
        initPracticeFromLocalSession(false)
        void syncGenerationJobFromBackend()
      })
  } else {
    void hydrateActivePracticeSessionFromBackend().finally(() => {
      initPracticeFromLocalSession(true)
      void syncGenerationJobFromBackend()
    })
  }
})

onShow(() => {
  sessionHeaderTopPx.value = resolveSessionHeaderTopPadding()
  syncSessionFixedHeight()
  activeUserTags.value = loadUserTags()
  void syncGenerationJobFromBackend().finally(() => {
    maybeTriggerBackgroundBatches()
  })
})

onUnload(() => {
  isMounted.value = false
  stopWatchCurrentIndex?.()
  stopWatchMultiple?.()
  uni.$off(PRACTICE_SESSION_UPDATED_EVENT, handlePracticeSessionUpdated)
  uni.$off(GENERATION_JOB_UPDATED_EVENT, handleGenerationJobUpdated)
})

stopWatchCurrentIndex = watch(currentIndex, () => {
  maybeTriggerBackgroundBatches()
  syncSessionFixedHeight()
})

stopWatchMultiple = watch(
  [
    () => loadError.value,
    () => generationHintText.value,
    () => answeredCount.value,
    () => questionCount.value,
  ],
  () => {
    syncSessionFixedHeight()
  },
)

function refreshGenerationJob() {
  if (!activeSessionId.value) {
    generationJob.value = null
    autoTriggerScopeJobId = ''
    autoTriggeredBatchSet.clear()
    batchTriggerInFlight.clear()
    return
  }
  const job = loadGenerationJobBySession(activeSessionId.value)
  generationJob.value = job
  syncAutoTriggerScope(job)
}

async function syncGenerationJobFromBackend(): Promise<void> {
  const session = loadActivePracticeSession()
  if (!activeSessionId.value && !session?.id) {
    refreshGenerationJob()
    return
  }

  await restoreGenerationJobFromBackend(session).catch(() => null)
  refreshGenerationJob()
}

function applySession(session: PracticeSession, preserveRuntime: boolean) {
  const previousAnswers = preserveRuntime ? answers.value : {}
  const previousGrading = preserveRuntime ? grading.value : {}

  const nextAnswers: Record<string, string> = {}
  const nextGrading: Record<string, GradeInfo> = {}
  const availableQuestionIdSet = new Set(session.questions.map((item) => item.id))

  session.questions.forEach((item) => {
    nextAnswers[item.id] = previousAnswers[item.id] || ''
    const existingGrade = previousGrading[item.id]
    if (existingGrade) {
      nextGrading[item.id] = existingGrade
    }
  })

  sessionQuestions.value = session.questions
  sessionMode.value = session.mode
  feedbackMode.value = session.feedbackMode
  answers.value = nextAnswers
  grading.value = nextGrading
  if (!preserveRuntime) {
    submitted.value = false
  } else if (submitted.value) {
    submitted.value = Object.keys(nextGrading).length >= session.questions.length
  }
  if (currentIndex.value >= session.questions.length) {
    currentIndex.value = Math.max(0, session.questions.length - 1)
  }
  if (availableQuestionIdSet.size === 0) {
    currentIndex.value = 0
  }
  loadError.value = ''
  activeSessionId.value = session.id
  refreshGenerationJob()
}

function initPracticeFromLocalSession(preserveRuntime = true) {
  const session = loadActivePracticeSession()
  if (!session || session.questions.length === 0) {
    activeSessionId.value = ''
    generationJob.value = null
    loadError.value = '请先在刷题页生成题目'
    return
  }
  applySession(session, preserveRuntime)
}

function handlePracticeSessionUpdated(payload?: { sessionId?: string }) {
  if (submitted.value) return
  const payloadSessionId = String(payload?.sessionId || '').trim()
  if (payloadSessionId && activeSessionId.value && payloadSessionId !== activeSessionId.value) {
    return
  }
  initPracticeFromLocalSession(true)
}

function handleGenerationJobUpdated(payload?: { sessionId?: string }) {
  if (submitted.value) return
  const payloadSessionId = String(payload?.sessionId || '').trim()
  if (payloadSessionId && activeSessionId.value && payloadSessionId !== activeSessionId.value) {
    return
  }
  refreshGenerationJob()
  maybeTriggerBackgroundBatches()
}

function toBatchTriggerKey(sessionId: string, batchIndex: 2 | 3): string {
  return `${sessionId}:${batchIndex}`
}

function syncAutoTriggerScope(job: GenerationJob | null) {
  const nextJobId = String(job?.jobId || '')
  if (nextJobId === autoTriggerScopeJobId) return
  autoTriggerScopeJobId = nextJobId
  autoTriggeredBatchSet.clear()
  batchTriggerInFlight.clear()
}

function shouldAutoTriggerBatch(batchIndex: 2 | 3, batch: GenerationBatchState | null): boolean {
  if (!batch) return false
  if (batch.requestedCount <= 0) return false
  const sessionId = activeSessionId.value
  if (!sessionId) return false
  const triggerKey = toBatchTriggerKey(sessionId, batchIndex)
  if (autoTriggeredBatchSet.has(triggerKey)) return false
  if (batchTriggerInFlight.has(triggerKey)) return false
  return batch.status === 'pending'
}

async function startBatchGeneration(batchIndex: 2 | 3, source: 'auto' | 'manual' = 'auto') {
  const sessionId = activeSessionId.value
  if (!sessionId) return
  const triggerKey = toBatchTriggerKey(sessionId, batchIndex)
  if (batchTriggerInFlight.has(triggerKey)) return

  const latestJob = loadGenerationJobBySession(sessionId)
  if (!latestJob || latestJob.status !== 'running') return
  const batch = getBatchState(latestJob, batchIndex)
  if (!batch || batch.requestedCount <= 0 || batch.status === 'loading' || batch.status === 'done') return
  if (source === 'auto' && autoTriggeredBatchSet.has(triggerKey)) return
  if (source === 'auto') {
    autoTriggeredBatchSet.add(triggerKey)
  }

  const anchorQuestionId = currentQuestion.value?.id || ''
  const anchorIndex = currentIndex.value
  batchTriggerInFlight.add(triggerKey)

  try {
    await triggerGenerationBatch(sessionId, batchIndex)
    if (activeSessionId.value !== sessionId) return
    initPracticeFromLocalSession(true)
    if (source === 'auto') {
      const latestJob = loadGenerationJobBySession(sessionId)
      const latestBatch = latestJob ? getBatchState(latestJob, batchIndex) : null
      if (latestBatch?.status === 'pending') {
        autoTriggeredBatchSet.delete(triggerKey)
      }
    }
    if (!anchorQuestionId) return
    const anchorAt = sessionQuestions.value.findIndex((item) => item.id === anchorQuestionId)
    if (anchorAt >= 0) {
      currentIndex.value = anchorAt
      return
    }
    if (questionCount.value > 0) {
      currentIndex.value = Math.min(Math.max(0, anchorIndex), questionCount.value - 1)
    }
  } finally {
    batchTriggerInFlight.delete(triggerKey)
  }
}

function maybeTriggerBackgroundBatches() {
  const job = generationJob.value
  if (!job || job.status !== 'running') return
  if (!activeSessionId.value || activeSessionId.value !== job.sessionId) return
  if (submitted.value) return

  const batch2 = getBatchState(job, 2)
  if (currentIndex.value >= BATCH2_TRIGGER_INDEX && shouldAutoTriggerBatch(2, batch2)) {
    void startBatchGeneration(2, 'auto')
    return
  }

  const batch3 = getBatchState(job, 3)
  const canStartBatch3 = batch2.requestedCount <= 0 || batch2.status === 'done'
  if (canStartBatch3 && currentIndex.value >= BATCH3_TRIGGER_INDEX && shouldAutoTriggerBatch(3, batch3)) {
    void startBatchGeneration(3, 'auto')
  }
}

function normalizeTag(raw: unknown): string {
  const clean = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 12)
  if (!clean || clean === '通用' || clean === '未分类') {
    return DEFAULT_GENERAL_TAG
  }
  return clean
}

function resolveDisplayTag(rawTag: unknown): string {
  const normalized = normalizeTag(rawTag)
  if (normalized === DEFAULT_GENERAL_TAG) {
    return DEFAULT_GENERAL_TAG
  }

  const matched = activeUserTags.value.find(
    (tag) => normalizeTag(tag).toLowerCase() === normalized.toLowerCase(),
  )
  return matched || DEFAULT_OTHER_TAG
}

function resolveSessionHeaderTopPadding(): number {
  try {
    const system = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null
    const statusBarHeight = Math.max(0, Number(system?.statusBarHeight || 0))
    const width = Number(system?.windowWidth || system?.screenWidth || 375)
    const extraPx = (64 * width) / 750
    return Math.round(statusBarHeight + extraPx)
  } catch {
    return 64
  }
}

function resolveSessionFixedFallbackHeight(topPx: number): number {
  try {
    const system = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null
    const width = Number(system?.windowWidth || system?.screenWidth || 375)
    const contentPx = (300 * width) / 750
    return Math.round(topPx + contentPx)
  } catch {
    return Math.round(topPx + 150)
  }
}

function syncSessionFixedHeight() {
  const fallbackHeight = resolveSessionFixedFallbackHeight(sessionHeaderTopPx.value)
  nextTick(() => {
    if (!isMounted.value) return
    const query = uni.createSelectorQuery()
    query.select('.session-fixed-shell').boundingClientRect((rect) => {
      if (!isMounted.value) return
      const node = Array.isArray(rect) ? rect[0] : rect
      const measuredHeight = Math.round(Number(node?.height || 0))
      sessionFixedHeightPx.value = measuredHeight > 0 ? measuredHeight : fallbackHeight
    })
    query.exec()
  })
}

function questionTypeLabel(type: QuestionType): string {
  return type === 'single' ? '单选题' : '多选题'
}

function difficultyLabel(value: Difficulty): string {
  if (value === 'easy') return '简单'
  if (value === 'hard') return '困难'
  return '中等'
}

function answerFor(questionId: string): string {
  return answers.value[questionId] || ''
}

function setAnswer(value: string): void {
  if (submitted.value || !currentQuestion.value) return
  answers.value = {
    ...answers.value,
    [currentQuestion.value.id]: value,
  }
}

function resolveExpectedChoiceCount(question: StoredQuestion): number {
  const expected = parseChoiceAnswers(question.answer, question.options).length
  return Math.max(2, Math.min(3, expected || 2))
}

const allGradedButNotSubmitted = computed(() =>
  isInstantFeedback.value
  && !submitted.value
  && questionCount.value > 0
  && Object.keys(grading.value).length >= questionCount.value,
)

function finalizeInstantFeedback(): void {
  if (submitted.value) return
  submitted.value = true
  if (activeSessionId.value) {
    cancelGenerationJob(activeSessionId.value)
  }
  clearActivePracticeSession()
  const correctCount = Object.values(grading.value).filter((item) => item.correct).length
  uni.showToast({
    title: `得分 ${correctCount}/${questionCount.value}`,
    icon: 'none',
  })
}

function gradeAndLockQuestion(question: StoredQuestion): void {
  if (grading.value[question.id]) return

  const userInput = answerFor(question.id)
  const result = gradeQuestion(question, userInput)
  const next = {
    ...grading.value,
    [question.id]: result,
  }

  grading.value = next
  setQuestionWrong(question.id, !result.correct, { syncBackend: false })
  void submitQuestionAttempt(question.id, result.user, feedbackMode.value).catch(() => {
    // ignore backend attempt failure
  })

  if (!isInstantFeedback.value && Object.keys(next).length >= questionCount.value) {
    submitted.value = true
    if (activeSessionId.value) {
      cancelGenerationJob(activeSessionId.value)
    }
    clearActivePracticeSession()
    const correctCount = Object.values(next).filter((item) => item.correct).length
    uni.showToast({
      title: `得分 ${correctCount}/${questionCount.value}`,
      icon: 'none',
    })
  }
}

function selectOption(optionKey: string): void {
  const question = currentQuestion.value
  if (!question || submitted.value) return
  if (isInstantFeedback.value && grading.value[question.id]) return

  const normalizedKey = normalizeSingleAnswer(optionKey, question.options)
  if (!normalizedKey) return

  if (question.type === 'single') {
    setAnswer(normalizedKey)
    if (isInstantFeedback.value) {
      gradeAndLockQuestion(question)
    }
    return
  }

  const currentSelected = parseChoiceAnswers(answerFor(question.id), question.options)
  const nextSelected = currentSelected.includes(normalizedKey)
    ? currentSelected.filter((key) => key !== normalizedKey)
    : [...currentSelected, normalizedKey]

  setAnswer(formatChoiceAnswer(nextSelected))
  if (isInstantFeedback.value && nextSelected.length >= resolveExpectedChoiceCount(question)) {
    gradeAndLockQuestion(question)
  }
}

function goPrev(): void {
  if (currentIndex.value > 0) {
    currentIndex.value -= 1
  }
}

function resolveBlockedBatchForTail(): GenerationBatchState | null {
  const job = generationJob.value
  if (!job) return null
  const batch2 = getBatchState(job, 2)
  if (batch2.requestedCount > 0 && batch2.status !== 'done') return batch2
  const batch3 = getBatchState(job, 3)
  if (batch3.requestedCount > 0 && batch3.status !== 'done') return batch3
  return null
}

function handleBlockedTailAdvance() {
  const blockedBatch = resolveBlockedBatchForTail()
  if (!blockedBatch) return

  if (blockedBatch.status === 'loading') {
    uni.showToast({
      title: '题目加载中，请稍候',
      icon: 'none',
    })
    return
  }

  if (blockedBatch.status === 'error') {
    uni.showToast({
      title: '正在重试加载，请稍候',
      icon: 'none',
    })
    if (blockedBatch.index === 2 || blockedBatch.index === 3) {
      void startBatchGeneration(blockedBatch.index, 'manual')
    }
    return
  }

  uni.showToast({
    title: '后续题目加载中',
    icon: 'none',
  })
  if (blockedBatch.index === 2 || blockedBatch.index === 3) {
    void startBatchGeneration(blockedBatch.index, 'manual')
  }
}

function goNext(): void {
  if (currentIndex.value < questionCount.value - 1) {
    currentIndex.value += 1
    return
  }

  if (hasPendingGeneration.value) {
    handleBlockedTailAdvance()
  }
}

function jumpTo(index: number): void {
  if (index < 0 || index >= questionCount.value) return
  currentIndex.value = index
}

function normalizeSingleAnswer(answer: string, options?: StoredQuestion['options']): string {
  const raw = answer.trim()
  if (!raw) return ''

  const upper = raw.toUpperCase()
  const letter = upper.match(/[A-Z]/)?.[0] || ''
  if (letter && (options || []).some((opt) => opt.key.toUpperCase() === letter)) {
    return letter
  }

  const matchedByText = (options || []).find((opt) => opt.text.trim().toLowerCase() === raw.toLowerCase())
  if (matchedByText) {
    return matchedByText.key.toUpperCase()
  }

  return upper
}

function sortChoiceKeys(keys: string[]): string[] {
  const order = ['A', 'B', 'C', 'D']
  return [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

function parseChoiceAnswers(answer: string, options?: StoredQuestion['options']): string[] {
  const raw = answer.trim()
  if (!raw) return []

  const optionKeys = new Set((options || []).map((opt) => opt.key.toUpperCase()))
  const output: string[] = []

  const pushKey = (value: string) => {
    const normalized = value.toUpperCase()
    if (!optionKeys.has(normalized)) return
    if (!output.includes(normalized)) {
      output.push(normalized)
    }
  }

  const parts = raw.split(/[|/／,，;；、\s]+/g).map((part) => part.trim()).filter(Boolean)
  if (parts.length > 1) {
    parts.forEach((part) => pushKey(normalizeSingleAnswer(part, options)))
    return sortChoiceKeys(output)
  }

  const letters = raw.toUpperCase().match(/[A-Z]/g) || []
  if (letters.length > 1) {
    letters.forEach((letter) => pushKey(letter))
    if (output.length > 0) return sortChoiceKeys(output)
  }

  pushKey(normalizeSingleAnswer(raw, options))
  return sortChoiceKeys(output)
}

function formatChoiceAnswer(keys: string[]): string {
  return sortChoiceKeys(keys.filter(Boolean)).join(',')
}

function gradeQuestion(question: StoredQuestion, userInput: string): GradeInfo {
  if (question.type === 'single') {
    const expected = normalizeSingleAnswer(question.answer, question.options)
    const user = normalizeSingleAnswer(userInput, question.options)
    return {
      correct: Boolean(user) && user === expected,
      user,
      expected,
    }
  }

  const userList = parseChoiceAnswers(userInput, question.options)
  const expectedList = parseChoiceAnswers(question.answer, question.options)
  const correct = expectedList.length > 1
    && userList.length === expectedList.length
    && userList.every((item, idx) => item === expectedList[idx])

  return {
    correct,
    user: formatChoiceAnswer(userList),
    expected: formatChoiceAnswer(expectedList),
  }
}

async function submitPaper(): Promise<void> {
  if (isInstantFeedback.value) return
  if (submitted.value || questionCount.value === 0) return

  const unanswered = questionCount.value - answeredCount.value
  if (unanswered > 0) {
    const res = await uni.showModal({
      title: '还有未作答题目',
      content: `还有 ${unanswered} 题未作答，确认现在交卷吗？`,
    })
    if (!res.confirm) {
      return
    }
  }

  const nextGrading: Record<string, GradeInfo> = {}
  sessionQuestions.value.forEach((question) => {
    const userInput = answerFor(question.id)
    const result = gradeQuestion(question, userInput)
    nextGrading[question.id] = result
    setQuestionWrong(question.id, !result.correct, { syncBackend: false })
    void submitQuestionAttempt(question.id, result.user, feedbackMode.value).catch(() => {
      // ignore backend attempt failure
    })
  })

  grading.value = nextGrading
  submitted.value = true

  uni.showToast({
    title: `得分 ${score.value}/${questionCount.value}`,
    icon: 'none',
  })

  if (activeSessionId.value) {
    cancelGenerationJob(activeSessionId.value)
  }
  clearActivePracticeSession()
}

function questionResult(questionId: string): GradeInfo | undefined {
  return grading.value[questionId]
}

function shouldShowFeedback(questionId: string): boolean {
  if (submitted.value) return true
  return isInstantFeedback.value && Boolean(grading.value[questionId])
}

function showEmpty(value: string | undefined): string {
  return value && value.trim() ? value : '未作答'
}

function choiceClass(optionKey: string): string {
  const question = currentQuestion.value
  if (!question) return ''

  const normalizedKey = optionKey.toUpperCase()
  const chosenList = parseChoiceAnswers(answerFor(question.id), question.options)

  if (!shouldShowFeedback(question.id)) {
    return chosenList.includes(normalizedKey) ? 'is-selected' : ''
  }

  const result = questionResult(question.id)
  if (!result) return ''
  const expectedList = parseChoiceAnswers(result.expected, question.options)
  const userList = parseChoiceAnswers(result.user, question.options)

  if (expectedList.includes(normalizedKey)) {
    return 'is-correct'
  }

  if (userList.includes(normalizedKey) && !expectedList.includes(normalizedKey)) {
    return 'is-wrong'
  }

  return ''
}

function backToGenerate(): void {
  if (activeSessionId.value) {
    cancelGenerationJob(activeSessionId.value)
  }
  uni.navigateBack({
    fail: () => {
      uni.reLaunch({ url: '/pages/index/index' })
    },
  })
}

function triggerAbandonVibration(): void {
  const wxApi = (globalThis as {
    wx?: {
      vibrateShort?: (options?: { type?: 'light' }) => void
    }
  }).wx

  if (wxApi?.vibrateShort) {
    try {
      wxApi.vibrateShort({ type: 'light' })
      return
    } catch {
      try {
        wxApi.vibrateShort()
        return
      } catch {
        // fallback to uni
      }
    }
  }

  try {
    uni.vibrateShort({})
  } catch {
    // ignore vibration failure
  }
}

function abandonQuiz(): void {
  triggerAbandonVibration()
  if (activeSessionId.value) {
    cancelGenerationJob(activeSessionId.value)
  }
  clearActivePracticeSession()
  generationJob.value = null
  activeSessionId.value = ''

  uni.switchTab({
    url: '/pages/index/index',
    fail: () => {
      uni.reLaunch({ url: '/pages/index/index' })
    },
  })
}
</script>

<style scoped>
.oa-page,
.oa-scroll {
  background: #F8F8F8;
}

.session-page {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  height: 100vh;
  overflow: hidden;
}

.session-fixed-shell {
  position: fixed;
  top: 0;
  left: 50%;
  right: auto;
  width: 100%;
  max-width: 600px;
  transform: translateX(-50%);
  z-index: 30;
  padding-left: 40rpx;
  padding-right: 40rpx;
  padding-bottom: 20rpx;
  background: #F8F8F8;
  box-sizing: border-box;
}

.session-scroll {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  height: 100vh;
  padding: 0 40rpx calc(env(safe-area-inset-bottom) + 24rpx);
  box-sizing: border-box;
}

.oa-bg-session .halo-a {
  width: 420rpx;
  height: 320rpx;
  left: -120rpx;
  top: 100rpx;
}

.oa-bg-session .halo-b {
  width: 340rpx;
  height: 240rpx;
  right: -100rpx;
  top: 200rpx;
}

.oa-bg-session .halo-c {
  width: 260rpx;
  height: 180rpx;
  right: 70rpx;
  top: 40rpx;
}

.oa-stack {
  gap: 26rpx;
}

.oa-stack > .oa-card {
  border-radius: 16rpx;
}

.session-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-left: 0;
  padding-right: 0;
  padding-bottom: 0;
  margin-bottom: 48rpx;
  box-sizing: border-box;
}

.session-title {
  font-family: 'MiSans', 'PingFang SC', -apple-system, 'SF Pro Text', sans-serif;
  font-size: 48rpx;
  line-height: 1.15;
  font-weight: 600;
  color: #1A1A1A;
  text-align: left;
}

.session-subtitle {
  margin-top: 12rpx;
  font-size: 26rpx;
  line-height: 1.5;
  color: #70757A;
  text-align: left;
}

.session-progress {
  padding-top: 20rpx;
  padding-bottom: 20rpx;
  border-radius: 16rpx;
  background: #FFFFFF;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.04);
}

.progress-track {
  width: 100%;
  height: 8rpx;
  border-radius: 4rpx;
  overflow: hidden;
  background: #EEEEEE;
}

.progress-bar {
  height: 8rpx;
  border-radius: 4rpx;
  background: #07C160;
  transition: width 0.3s ease-out;
}

.generation-hint {
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.45;
  color: #70757A;
}

.question-card {
  background: #FFFFFF;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.04);
  border-radius: 16rpx;
  padding-bottom: 24rpx;
}

.question-stem {
  font-size: 32rpx;
  line-height: 1.6;
  font-weight: 400;
  color: #3C4043;
}

.choice-group {
  border-radius: 16rpx;
  background: #FFFFFF;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.04);
  padding: 8rpx;
}

.choice-item {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  margin-top: 0;
  margin-bottom: 20rpx;
  border: 1rpx solid #E8EAED;
  border-radius: 16rpx;
  padding: 16rpx;
  background: #FFFFFF;
  transition: all 0.2s ease;
}

.choice-item:last-child {
  margin-bottom: 0;
}

.choice-key {
  width: 56rpx;
  height: 56rpx;
  border: 1rpx solid #E8EAED;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 700;
  color: #333333;
  background: #ffffff;
  flex: 0 0 auto;
  transition: all 0.2s ease;
}

.choice-text {
  flex: 1;
  font-size: 30rpx;
  font-weight: 400;
  line-height: 1.6;
  color: #3C4043;
}

.choice-item.is-selected {
  border: 1rpx solid #07C160;
  background: rgba(7, 193, 96, 0.1);
}

.choice-item.is-correct {
  border: 1rpx solid #07C160;
  background: rgba(7, 193, 96, 0.1);
}

.choice-item.is-wrong {
  border: 1rpx solid #d93025;
  background: rgba(217, 48, 37, 0.08);
}

.choice-item.is-selected .choice-key,
.choice-item.is-correct .choice-key {
  border-color: #07C160;
  color: #07C160;
}

.answer-panel {
  border: 1rpx solid #E8EAED;
  border-radius: 16rpx;
  padding: 14rpx 16rpx;
  font-size: 24rpx;
  line-height: 1.6;
  background: #ffffff;
}

.answer-panel.is-ok {
  color: #07C160;
}

.answer-panel.is-bad {
  color: #d93025;
}

.answer-line + .answer-line {
  margin-top: 6rpx;
}

.action-card {
  padding: 20rpx 20rpx 0;
  border-radius: 18rpx;
  border: 1rpx solid #ECEDEF;
  background: #FFFFFF;
  box-shadow: 0 10rpx 24rpx rgba(16, 24, 40, 0.06);
}

.action-tier {
  width: 100%;
}

.action-tier-primary {
  display: flex;
  align-items: center;
}

.action-row {
  width: 100%;
  flex-wrap: nowrap;
  gap: 12rpx;
}

.action-btn {
  flex: 1;
  border-radius: 16rpx;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.action-btn-secondary {
  background: #FFFFFF;
  color: #333333;
  border-color: #E8EAED;
}

.action-btn-primary {
  background: #07C160;
  color: #FFFFFF;
  border-color: #07C160;
}

.abandon-wrap {
  margin-top: 40rpx;
  margin-bottom: 0;
  padding-bottom: calc(env(safe-area-inset-bottom) + 20rpx);
  display: flex;
  justify-content: center;
  align-items: center;
}

.abandon-btn {
  width: auto;
  min-height: 68rpx;
  padding: 0 28rpx;
  border: 1rpx solid #BBBBBB;
  border-radius: 16rpx;
  background: transparent;
  color: #888888;
  font-size: 28rpx;
  line-height: 1.2;
  font-weight: 500;
  letter-spacing: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  opacity: 0.9;
  box-shadow: 0 4rpx 12rpx rgba(17, 24, 39, 0.05);
}

.abandon-icon {
  color: #888888;
  font-size: 24rpx;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.abandon-label {
  color: #888888;
  font-size: 28rpx;
  line-height: 1.2;
  display: inline-flex;
  align-items: center;
}

.abandon-btn-hover {
  opacity: 0.96;
}

.result-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.result-chip {
  padding: 10rpx 14rpx;
  border: 1rpx solid #E8EAED;
  border-radius: 8rpx;
  font-size: 23rpx;
  line-height: 1.3;
  background: #ffffff;
}

.result-ok {
  color: #07C160;
}

.result-bad {
  color: #d93025;
}
</style>
