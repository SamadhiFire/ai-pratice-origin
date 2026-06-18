import type { Keypoint, Question } from '../types'
import {
  cancelGenerationJobInBackend,
  fetchActiveGenerationJobFromBackend,
  fetchGenerationJobFromBackend,
} from './backend-sync'
import { runPipeline } from './pipeline'
import {
  addGeneratedQuestions,
  buildQuestionSignature,
  loadQuestionBank,
  type PracticeMode,
  type StoredQuestion,
  upsertStoredQuestions,
} from './question-bank'
import {
  appendQuestionsToActivePracticeSession,
  bindGenerationJobToActivePracticeSession,
  loadActivePracticeSession,
  type PracticeFeedbackMode,
  type PracticeSession,
  replaceActivePracticeSession,
} from './practice-session'
import { triggerGenerationBatchInBackend } from './backend-sync'
import { BackendApiError } from './backend-api'

export type GenerationBatchIndex = 1 | 2 | 3
export type GenerationBatchStatus = 'pending' | 'loading' | 'done' | 'error'
export type GenerationJobStatus = 'running' | 'completed' | 'canceled'

export interface GenerationBatchState {
  index: GenerationBatchIndex
  requestedCount: number
  loadedCount: number
  status: GenerationBatchStatus
  attempts: number
  error: string
}

type GenerationBatchKey = 'batch1' | 'batch2' | 'batch3'

export interface GenerationJob {
  jobId: string
  sessionId: string
  material: string
  type: 'single' | 'multi'
  difficulty: 'easy' | 'medium' | 'hard'
  mode: PracticeMode
  feedbackMode: PracticeFeedbackMode
  userTags: string[]
  targetCount: number
  loadedCount: number
  keypoints: Keypoint[]
  usedStemSignatures: string[]
  status: GenerationJobStatus
  nonce: number
  batchState: Record<GenerationBatchKey, GenerationBatchState>
  createdAt: number
  updatedAt: number
}

const JOB_STORAGE_KEY = 'study_quiz_generation_job_v1'
export const GENERATION_JOB_UPDATED_EVENT = 'study_generation_job_updated'
const BATCH1_COUNT = 10
const BATCH2_COUNT = 20
const MAX_BATCH_ATTEMPTS_PER_TRIGGER = 2
const inflightJobSet = new Set<string>()
const inflightBatchPromiseMap = new Map<string, Promise<GenerationJob | null>>()

function now(): number {
  return Date.now()
}

function toQuestionSignature(question: Pick<Question, 'type' | 'stem' | 'answer'>): string {
  return buildQuestionSignature(question)
}

function batchKey(index: GenerationBatchIndex): GenerationBatchKey {
  if (index === 1) return 'batch1'
  if (index === 2) return 'batch2'
  return 'batch3'
}

function inflightBatchKey(sessionId: string, batchIndex: GenerationBatchIndex): string {
  return `${sessionId}:${batchIndex}`
}

function cloneJob(job: GenerationJob): GenerationJob {
  return {
    ...job,
    userTags: [...job.userTags],
    keypoints: [...job.keypoints],
    usedStemSignatures: [...job.usedStemSignatures],
    batchState: {
      batch1: { ...job.batchState.batch1 },
      batch2: { ...job.batchState.batch2 },
      batch3: { ...job.batchState.batch3 },
    },
  }
}

function emitGenerationJobUpdated(job: GenerationJob | null): void {
  uni.$emit(GENERATION_JOB_UPDATED_EVENT, {
    sessionId: job?.sessionId || '',
    jobId: job?.jobId || '',
    status: job?.status || 'canceled',
    loadedCount: Number(job?.loadedCount || 0),
    targetCount: Number(job?.targetCount || 0),
  })
}

function saveJob(job: GenerationJob): GenerationJob {
  const next = cloneJob({
    ...job,
    updatedAt: now(),
  })
  uni.setStorageSync(JOB_STORAGE_KEY, next)
  bindGenerationJobToActivePracticeSession(next.sessionId, next.jobId)
  emitGenerationJobUpdated(next)
  return next
}

function clearJobStorage(): void {
  uni.removeStorageSync(JOB_STORAGE_KEY)
  emitGenerationJobUpdated(null)
}

export function replaceGenerationJob(job: GenerationJob | null): GenerationJob | null {
  if (!job) {
    clearJobStorage()
    return null
  }

  const normalized = normalizeJob(job)
  if (!normalized) {
    clearJobStorage()
    return null
  }

  return saveJob(normalized)
}

function normalizeBatchState(raw: unknown, fallbackIndex: GenerationBatchIndex): GenerationBatchState {
  const source = (raw || {}) as Partial<GenerationBatchState>
  const statusText = String(source.status || 'pending')
  const status: GenerationBatchStatus = ['pending', 'loading', 'done', 'error'].includes(statusText)
    ? (statusText as GenerationBatchStatus)
    : 'pending'
  const requestedCount = Math.max(0, Math.floor(Number(source.requestedCount || 0)))
  const loadedCount = Math.max(0, Math.floor(Number(source.loadedCount || 0)))
  const attempts = Math.max(0, Math.floor(Number(source.attempts || 0)))

  return {
    index: [1, 2, 3].includes(Number(source.index)) ? (Number(source.index) as GenerationBatchIndex) : fallbackIndex,
    requestedCount,
    loadedCount,
    status,
    attempts,
    error: String(source.error || ''),
  }
}

function normalizeJob(raw: unknown): GenerationJob | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Partial<GenerationJob>
  const sessionId = String(source.sessionId || '').trim()
  const material = String(source.material || '').trim()
  const jobId = String(source.jobId || '').trim()
  if (!sessionId || !material || !jobId) return null

  const type = source.type === 'multi' ? 'multi' : 'single'
  const difficulty = ['easy', 'medium', 'hard'].includes(String(source.difficulty))
    ? (source.difficulty as 'easy' | 'medium' | 'hard')
    : 'medium'
  const mode = source.mode === 'modeB' ? 'modeB' : 'modeA'
  const feedbackMode = source.feedbackMode === 'instant' ? 'instant' : 'after_all'
  const targetCount = Math.max(1, Math.floor(Number(source.targetCount || 1)))
  const loadedCount = Math.max(0, Math.floor(Number(source.loadedCount || 0)))
  const statusText = String(source.status || 'running')
  const status: GenerationJobStatus = ['running', 'completed', 'canceled'].includes(statusText)
    ? (statusText as GenerationJobStatus)
    : 'running'

  return {
    jobId,
    sessionId,
    material,
    type,
    difficulty,
    mode,
    feedbackMode,
    userTags: Array.isArray(source.userTags)
      ? source.userTags.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 7)
      : [],
    targetCount,
    loadedCount,
    keypoints: Array.isArray(source.keypoints) ? (source.keypoints as Keypoint[]) : [],
    usedStemSignatures: Array.isArray(source.usedStemSignatures)
      ? source.usedStemSignatures.map((item) => String(item || '')).filter(Boolean)
      : [],
    status,
    nonce: Math.max(0, Math.floor(Number(source.nonce || 0))),
    batchState: {
      batch1: normalizeBatchState(source.batchState?.batch1, 1),
      batch2: normalizeBatchState(source.batchState?.batch2, 2),
      batch3: normalizeBatchState(source.batchState?.batch3, 3),
    },
    createdAt: Math.max(0, Math.floor(Number(source.createdAt || 0))),
    updatedAt: Math.max(0, Math.floor(Number(source.updatedAt || 0))),
  }
}

function mergeUsedSignatures(
  current: string[],
  questions: Array<Pick<Question, 'type' | 'stem' | 'answer'>>,
): string[] {
  const seen = new Set(current.map((item) => String(item || '').trim()).filter(Boolean))
  questions.forEach((question) => {
    const signature = toQuestionSignature(question)
    if (signature) seen.add(signature)
  })
  return [...seen]
}

function mergeKeypoints(base: Keypoint[], next: Keypoint[]): Keypoint[] {
  const output: Keypoint[] = []
  const seen = new Set<string>()
  ;[...base, ...next].forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const key = String(item.id || '').trim() || `${index}_${String(item.title || '').trim()}`
    if (!key || seen.has(key)) return
    seen.add(key)
    output.push(item)
  })
  return output
}

function currentLoadedCountFromSession(sessionId: string): number {
  const session = loadActivePracticeSession()
  if (!session || session.id !== sessionId) return 0
  return session.questions.length
}

function markJobCompletedIfNeeded(job: GenerationJob): GenerationJob {
  const loaded = Math.max(job.loadedCount, currentLoadedCountFromSession(job.sessionId))
  job.loadedCount = loaded
  if (loaded >= job.targetCount) {
    job.status = 'completed'
  }
  return job
}

export function loadGenerationJob(): GenerationJob | null {
  const raw = uni.getStorageSync(JOB_STORAGE_KEY)
  return normalizeJob(raw)
}

export function loadGenerationJobBySession(sessionId: string): GenerationJob | null {
  const job = loadGenerationJob()
  if (!job || job.sessionId !== sessionId) return null
  return job
}

async function fetchRecoveryGenerationJob(session: PracticeSession | null): Promise<GenerationJob | null> {
  const hintedJobId = String(session?.generationJobId || '').trim()
  if (hintedJobId) {
    const hintedJob = await fetchGenerationJobFromBackend(hintedJobId).catch(() => null)
    if (hintedJob) {
      return hintedJob
    }
  }

  const activePayload = await fetchActiveGenerationJobFromBackend().catch(() => null)
  if (!activePayload) return null

  if (activePayload.session) {
    replaceActivePracticeSession(activePayload.session)
  }

  return activePayload.generationJob
}

export async function hydrateGenerationJobFromBackend(sessionId?: string): Promise<GenerationJob | null> {
  const localJob = sessionId ? loadGenerationJobBySession(sessionId) : loadGenerationJob()
  if (!localJob?.jobId) return localJob

  const remoteJob = await fetchGenerationJobFromBackend(localJob.jobId).catch(() => null)
  if (!remoteJob) return localJob

  const normalizedRemote = normalizeJob(remoteJob)
  if (!normalizedRemote || normalizedRemote.sessionId !== localJob.sessionId) {
    return localJob
  }

  if (Number(localJob.updatedAt || 0) > Number(normalizedRemote.updatedAt || 0)) {
    return localJob
  }

  return replaceGenerationJob(normalizedRemote)
}

export async function restoreGenerationJobFromBackend(session?: PracticeSession | null): Promise<GenerationJob | null> {
  const initialSession = session || loadActivePracticeSession()
  const remoteJob = await fetchRecoveryGenerationJob(initialSession)
  const targetSession = loadActivePracticeSession() || initialSession
  const targetSessionId = String(targetSession?.id || '').trim()

  if (!remoteJob) {
    return targetSessionId ? hydrateGenerationJobFromBackend(targetSessionId) : hydrateGenerationJobFromBackend()
  }

  const normalizedRemote = normalizeJob(remoteJob)
  if (!normalizedRemote) {
    return targetSessionId ? loadGenerationJobBySession(targetSessionId) : loadGenerationJob()
  }

  if (targetSessionId && normalizedRemote.sessionId !== targetSessionId) {
    return loadGenerationJobBySession(targetSessionId)
  }

  const localJob = targetSessionId ? loadGenerationJobBySession(targetSessionId) : loadGenerationJob()
  if (
    localJob
    && !String(initialSession?.generationJobId || '').trim()
    && Number(localJob.updatedAt || 0) > Number(normalizedRemote.updatedAt || 0)
  ) {
    return localJob
  }

  return replaceGenerationJob(normalizedRemote)
}

export function clearGenerationJob(sessionId?: string): void {
  const job = loadGenerationJob()
  if (!job) return
  if (sessionId && job.sessionId !== sessionId) return
  clearJobStorage()
}

export function cancelGenerationJob(sessionId: string): GenerationJob | null {
  const job = loadGenerationJobBySession(sessionId)
  if (!job) return null
  const next = cloneJob(job)
  next.status = 'canceled'
  next.nonce += 1
  next.batchState.batch1.status = next.batchState.batch1.status === 'done' ? 'done' : 'error'
  next.batchState.batch2.status = next.batchState.batch2.status === 'done' ? 'done' : 'error'
  next.batchState.batch3.status = next.batchState.batch3.status === 'done' ? 'done' : 'error'
  void cancelGenerationJobInBackend(next.jobId).catch(() => {
    // ignore backend cancel failure
  })
  return saveJob(next)
}

export function createGenerationJobAfterInitial(input: {
  sessionId: string
  material: string
  type: 'single' | 'multi'
  difficulty: 'easy' | 'medium' | 'hard'
  mode: PracticeMode
  feedbackMode: PracticeFeedbackMode
  userTags: string[]
  targetCount: number
  initialQuestions: StoredQuestion[]
  keypoints: Keypoint[]
}): GenerationJob {
  const targetCount = Math.max(1, Math.floor(Number(input.targetCount || 1)))
  const initialQuestions = Array.isArray(input.initialQuestions) ? input.initialQuestions : []
  const loadedCount = Math.min(targetCount, Math.max(initialQuestions.length, currentLoadedCountFromSession(input.sessionId)))
  const batch1Count = Math.min(BATCH1_COUNT, targetCount)
  const remainAfterInitial = Math.max(0, targetCount - loadedCount)
  const batch2Count = Math.min(BATCH2_COUNT, remainAfterInitial)
  const batch3Count = Math.max(0, remainAfterInitial - batch2Count)

  const job: GenerationJob = {
    jobId: `job_${now()}`,
    sessionId: String(input.sessionId || '').trim(),
    material: String(input.material || '').trim(),
    type: input.type === 'multi' ? 'multi' : 'single',
    difficulty: input.difficulty,
    mode: input.mode === 'modeB' ? 'modeB' : 'modeA',
    feedbackMode: input.feedbackMode === 'instant' ? 'instant' : 'after_all',
    userTags: Array.isArray(input.userTags) ? input.userTags.slice(0, 7) : [],
    targetCount,
    loadedCount,
    keypoints: Array.isArray(input.keypoints) ? [...input.keypoints] : [],
    usedStemSignatures: mergeUsedSignatures([], initialQuestions),
    status: loadedCount >= targetCount ? 'completed' : 'running',
    nonce: 0,
    batchState: {
      batch1: {
        index: 1,
        requestedCount: batch1Count,
        loadedCount: Math.min(batch1Count, loadedCount),
        status: 'done',
        attempts: 1,
        error: '',
      },
      batch2: {
        index: 2,
        requestedCount: batch2Count,
        loadedCount: 0,
        status: batch2Count > 0 ? 'pending' : 'done',
        attempts: 0,
        error: '',
      },
      batch3: {
        index: 3,
        requestedCount: batch3Count,
        loadedCount: 0,
        status: batch3Count > 0 ? 'pending' : 'done',
        attempts: 0,
        error: '',
      },
    },
    createdAt: now(),
    updatedAt: now(),
  }

  if (!job.sessionId || !job.material) {
    clearJobStorage()
    return job
  }

  return saveJob(job)
}

function filterFreshQuestions(
  candidates: Question[],
  usedSignatures: string[],
  maxCount: number,
): Question[] {
  if (!Array.isArray(candidates) || candidates.length === 0 || maxCount <= 0) return []
  const seen = new Set(usedSignatures)
  const output: Question[] = []
  candidates.forEach((item) => {
    if (output.length >= maxCount) return
    const signature = toQuestionSignature(item)
    if (!signature || seen.has(signature)) return
    seen.add(signature)
    output.push(item)
  })
  return output
}

function resolveBatchTemperature(batchIndex: GenerationBatchIndex, attempt: number): number {
  if (batchIndex === 1) return 0.55
  if (attempt <= 1) return 0.65
  return 0.75
}

function nextBatchStatusIfNoRequest(batch: GenerationBatchState): GenerationBatchStatus {
  if (batch.requestedCount <= 0) return 'done'
  return batch.status
}

export function getBatchState(job: GenerationJob, batchIndex: GenerationBatchIndex): GenerationBatchState {
  return job.batchState[batchKey(batchIndex)]
}

export function getNextLoadableBatch(job: GenerationJob): GenerationBatchIndex | null {
  const batch2 = job.batchState.batch2
  if (batch2.requestedCount > 0 && (batch2.status === 'pending' || batch2.status === 'error')) {
    return 2
  }
  const batch3 = job.batchState.batch3
  if (batch3.requestedCount > 0 && (batch3.status === 'pending' || batch3.status === 'error')) {
    return 3
  }
  return null
}

function canStartBatch(job: GenerationJob, batchIndex: GenerationBatchIndex): boolean {
  if (batchIndex !== 3) return true
  const batch2 = job.batchState.batch2
  if (batch2.requestedCount <= 0) return true
  return batch2.status === 'done'
}

export async function triggerGenerationBatch(
  sessionId: string,
  batchIndex: GenerationBatchIndex,
): Promise<GenerationJob | null> {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) return null

  const promiseKey = inflightBatchKey(normalizedSessionId, batchIndex)
  const inflightPromise = inflightBatchPromiseMap.get(promiseKey)
  if (inflightPromise) {
    return inflightPromise
  }

  const runner = (async (): Promise<GenerationJob | null> => {
    const current = loadGenerationJobBySession(normalizedSessionId)
    if (!current) return null
    if (current.status !== 'running') return current
    if (!canStartBatch(current, batchIndex)) return current
    if (inflightJobSet.has(current.jobId)) {
      return loadGenerationJobBySession(normalizedSessionId) || current
    }

    const key = batchKey(batchIndex)
    const batch = current.batchState[key]
    if (!batch) return current
    if (batch.requestedCount <= 0) {
      const next = cloneJob(current)
      next.batchState[key].status = nextBatchStatusIfNoRequest(next.batchState[key])
      return saveJob(markJobCompletedIfNeeded(next))
    }
    if (batch.status === 'loading' || batch.status === 'done') return current

    const loadingJob = cloneJob(current)
    loadingJob.batchState[key].status = 'loading'
    loadingJob.batchState[key].error = ''
    saveJob(loadingJob)

    inflightJobSet.add(current.jobId)
    let workingJob = loadingJob
    const nonceAtStart = workingJob.nonce
    let lastError = ''

    try {
      for (let step = 0; step < MAX_BATCH_ATTEMPTS_PER_TRIGGER; step += 1) {
        const latest = loadGenerationJobBySession(normalizedSessionId)
        if (!latest) return null
        if (latest.nonce !== nonceAtStart || latest.status !== 'running') {
          return latest
        }
        if (!canStartBatch(latest, batchIndex)) {
          return latest
        }

        workingJob = cloneJob(latest)
        workingJob.batchState[key].attempts += 1
        saveJob(workingJob)

        const remainingForJob = Math.max(0, workingJob.targetCount - workingJob.loadedCount)
        const requestedCount = Math.min(workingJob.batchState[key].requestedCount, remainingForJob)
        if (requestedCount <= 0) {
          workingJob.batchState[key].status = 'done'
          workingJob.batchState[key].loadedCount = 0
          return saveJob(markJobCompletedIfNeeded(workingJob))
        }

        const seed = `${workingJob.jobId}:${key}:nonce${workingJob.nonce}:attempt${workingJob.batchState[key].attempts}`
        const bankSignatures = loadQuestionBank()
          .map((item) => buildQuestionSignature(item))
          .filter(Boolean)
        const excludeSignatures = [...new Set([...workingJob.usedStemSignatures, ...bankSignatures])]

        const runLocalFallback = () => runPipeline(
          workingJob.material,
          workingJob.type,
          requestedCount,
          workingJob.difficulty,
          workingJob.mode,
          workingJob.userTags,
          {
            skipResultCache: true,
            cacheKeySuffix: seed,
            generationSeed: seed,
            temperature: resolveBatchTemperature(batchIndex, workingJob.batchState[key].attempts),
            excludeSignatures,
          },
        )

        if (batchIndex === 2 || batchIndex === 3) {
          const remotePayload = await triggerGenerationBatchInBackend(
            workingJob.jobId,
            batchIndex,
          )

          if (!remotePayload) {
            lastError = '后端返回空结果'
            continue
          }

          if (!remotePayload.session || !remotePayload.generationJob) {
            lastError = '后端返回无效数据'
            continue
          }

          const latestQuestions = Array.isArray(remotePayload.questions) && remotePayload.questions.length > 0
            ? remotePayload.questions
            : remotePayload.session.questions
          upsertStoredQuestions(latestQuestions, { syncBackend: false })
          replaceActivePracticeSession(remotePayload.session)
          return replaceGenerationJob(remotePayload.generationJob)
        }

        const result = await runLocalFallback()
        if (!result.success || !result.output) {
          lastError = result.error || '生成失败，请重试'
          continue
        }

        const freshQuestions = filterFreshQuestions(
          result.output.questions,
          workingJob.usedStemSignatures,
          requestedCount,
        )
        if (freshQuestions.length <= 0) {
          lastError = '当前批次未生成新题，请重试'
          continue
        }

        const sessionBefore = loadActivePracticeSession()
        if (!sessionBefore || sessionBefore.id !== workingJob.sessionId) {
          lastError = '练习会话已失效，请重新生成'
          break
        }

        const savedQuestions = addGeneratedQuestions(freshQuestions, workingJob.mode)
        if (savedQuestions.length <= 0) {
          lastError = '当前批次未生成新题，请重试'
          continue
        }

        const sessionAfter = appendQuestionsToActivePracticeSession(workingJob.sessionId, savedQuestions)
        if (!sessionAfter || sessionAfter.id !== workingJob.sessionId) {
          lastError = '练习会话已失效，请重新生成'
          break
        }

        const loadedDelta = Math.max(0, sessionAfter.questions.length - sessionBefore.questions.length)
        if (loadedDelta <= 0) {
          lastError = '当前批次未生成新题，请重试'
          continue
        }

        const latestBeforeCommit = loadGenerationJobBySession(normalizedSessionId)
        if (!latestBeforeCommit || latestBeforeCommit.nonce !== nonceAtStart || latestBeforeCommit.status !== 'running') {
          return latestBeforeCommit
        }

        const doneJob = cloneJob(latestBeforeCommit)
        doneJob.loadedCount = Math.min(
          doneJob.targetCount,
          Math.max(doneJob.loadedCount + loadedDelta, sessionAfter.questions.length),
        )
        doneJob.keypoints = mergeKeypoints(doneJob.keypoints, result.output.keypoints || [])
        doneJob.usedStemSignatures = mergeUsedSignatures(doneJob.usedStemSignatures, savedQuestions)
        const batchState = doneJob.batchState[key]
        const batchTarget = Math.max(0, Number(batchState.requestedCount || 0))
        const previousBatchLoaded = Math.max(0, Number(batchState.loadedCount || 0))
        const nextBatchLoaded = Math.min(batchTarget, previousBatchLoaded + loadedDelta)
        batchState.loadedCount = nextBatchLoaded
        batchState.error = ''
        batchState.status = nextBatchLoaded >= batchTarget ? 'done' : 'pending'
        return saveJob(markJobCompletedIfNeeded(doneJob))
      }

      const latestErrorJob = loadGenerationJobBySession(normalizedSessionId)
      if (!latestErrorJob) return null
      if (latestErrorJob.nonce !== nonceAtStart || latestErrorJob.status !== 'running') {
        return latestErrorJob
      }
      const failed = cloneJob(latestErrorJob)
      failed.batchState[key].status = 'error'
      failed.batchState[key].error = lastError || '生成失败，请重试'
      return saveJob(failed)
    } finally {
      inflightJobSet.delete(current.jobId)
    }
  })()

  inflightBatchPromiseMap.set(promiseKey, runner)
  try {
    return await runner
  } finally {
    inflightBatchPromiseMap.delete(promiseKey)
  }
}
