import type { PracticeMode, StoredQuestion } from './question-bank'
import { normalizeOptionText } from './question-bank'
import {
  clearPracticeSessionInBackend,
  fetchPracticeSessionFromBackend,
  syncPracticeSessionToBackend,
} from './backend-sync'

export type PracticeFeedbackMode = 'instant' | 'after_all'

export interface PracticeSession {
  id: string
  createdAt: number
  mode: PracticeMode
  feedbackMode: PracticeFeedbackMode
  generationJobId?: string
  questions: StoredQuestion[]
}

const ACTIVE_SESSION_KEY = 'study_quiz_active_practice_session_v1'
export const PRACTICE_SESSION_UPDATED_EVENT = 'study_practice_session_updated'

function emitPracticeSessionUpdated(sessionId: string): void {
  uni.$emit(PRACTICE_SESSION_UPDATED_EVENT, { sessionId })
}

function normalizeGenerationJobId(raw: unknown): string | undefined {
  const value = String(raw || '').trim()
  return value || undefined
}

function persistActivePracticeSession(session: PracticeSession): void {
  uni.setStorageSync(ACTIVE_SESSION_KEY, session)
  emitPracticeSessionUpdated(session.id)
  syncPracticeSessionToBackend(session).catch(() => {
    // ignore backend sync failure
  })
}

export function saveActivePracticeSession(
  questions: StoredQuestion[],
  mode: PracticeMode,
  feedbackMode: PracticeFeedbackMode = 'after_all',
): PracticeSession {
  const now = Date.now()
  const session: PracticeSession = {
    id: `session_${now}`,
    createdAt: now,
    mode,
    feedbackMode,
    generationJobId: undefined,
    questions,
  }

  persistActivePracticeSession(session)
  return session
}

export function replaceActivePracticeSession(session: PracticeSession | null): PracticeSession | null {
  if (!session || !session.id || !Array.isArray(session.questions) || session.questions.length === 0) {
    clearActivePracticeSession()
    return null
  }

  persistActivePracticeSession({
    id: String(session.id),
    createdAt: Number(session.createdAt || Date.now()),
    mode: session.mode === 'modeB' ? 'modeB' : 'modeA',
    feedbackMode: session.feedbackMode === 'instant' ? 'instant' : 'after_all',
    generationJobId: normalizeGenerationJobId(session.generationJobId),
    questions: session.questions,
  })

  return loadActivePracticeSession()
}

export function loadActivePracticeSession(): PracticeSession | null {
  const raw = uni.getStorageSync(ACTIVE_SESSION_KEY)
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const session = raw as Partial<PracticeSession>
  if (!session.id || !Array.isArray(session.questions) || session.questions.length === 0) {
    return null
  }

  return {
    id: String(session.id),
    createdAt: Number(session.createdAt || 0),
    mode: session.mode === 'modeB' ? 'modeB' : 'modeA',
    feedbackMode: session.feedbackMode === 'instant' ? 'instant' : 'after_all',
    generationJobId: normalizeGenerationJobId(session.generationJobId),
    questions: session.questions.map((item) => ({
      ...item,
      tag: String(item.tag || '综合').trim() || '综合',
      isMastered: Boolean(item.isMastered),
      options: Array.isArray(item.options)
        ? item.options
            .map((opt, idx) => {
              const key = String(opt?.key || String.fromCharCode(65 + idx)).toUpperCase()
              return {
                ...opt,
                key,
                text: normalizeOptionText(String(opt?.text || ''), key),
              }
            })
            .filter((opt) => opt.key && opt.text)
        : item.options,
    })),
  }
}

export function clearActivePracticeSession(): void {
  const current = loadActivePracticeSession()
  uni.removeStorageSync(ACTIVE_SESSION_KEY)
  if (current?.id) {
    emitPracticeSessionUpdated(current.id)
  }
  clearPracticeSessionInBackend().catch(() => {
    // ignore backend sync failure
  })
}

export function appendQuestionsToActivePracticeSession(
  sessionId: string,
  questions: StoredQuestion[],
): PracticeSession | null {
  if (!sessionId || !Array.isArray(questions) || questions.length === 0) {
    return loadActivePracticeSession()
  }

  const current = loadActivePracticeSession()
  if (!current || current.id !== sessionId) {
    return current
  }

  const seen = new Set(current.questions.map((item) => String(item.id || '').trim()))
  const appendList = questions.filter((item) => {
    const id = String(item.id || '').trim()
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })

  if (appendList.length <= 0) {
    return current
  }

  const next: PracticeSession = {
    ...current,
    questions: [...current.questions, ...appendList],
  }
  persistActivePracticeSession(next)
  return next
}

export function bindGenerationJobToActivePracticeSession(
  sessionId: string,
  generationJobId?: string,
): PracticeSession | null {
  const current = loadActivePracticeSession()
  if (!current || current.id !== String(sessionId || '').trim()) {
    return current
  }

  const nextGenerationJobId = normalizeGenerationJobId(generationJobId)
  if (current.generationJobId === nextGenerationJobId) {
    return current
  }

  const next: PracticeSession = {
    ...current,
    generationJobId: nextGenerationJobId,
  }
  persistActivePracticeSession(next)
  return next
}

export async function hydrateActivePracticeSessionFromBackend(): Promise<PracticeSession | null> {
  try {
    const localSession = loadActivePracticeSession()
    const remote = await fetchPracticeSessionFromBackend()
    if (!remote || typeof remote !== 'object') return null

    const session = remote as Partial<PracticeSession>
    if (!session.id || !Array.isArray(session.questions) || session.questions.length === 0) {
      return null
    }

    const normalized: PracticeSession = {
      id: String(session.id),
      createdAt: Number(session.createdAt || 0),
      mode: session.mode === 'modeB' ? 'modeB' : 'modeA',
      feedbackMode: session.feedbackMode === 'instant' ? 'instant' : 'after_all',
      generationJobId: normalizeGenerationJobId(session.generationJobId),
      questions: session.questions.map((item) => ({
        ...item,
        tag: String(item.tag || '综合').trim() || '综合',
        isMastered: Boolean(item.isMastered),
        options: Array.isArray(item.options)
          ? item.options
              .map((opt, idx) => {
                const key = String(opt?.key || String.fromCharCode(65 + idx)).toUpperCase()
                return {
                  ...opt,
                  key,
                  text: normalizeOptionText(String(opt?.text || ''), key),
                }
              })
              .filter((opt) => opt.key && opt.text)
          : item.options,
      })),
    }

    // 后端数据可能滞后于本地刚生成的会话，优先保留更新鲜的数据
    if (
      localSession
      && Number(localSession.createdAt || 0) > Number(normalized.createdAt || 0)
    ) {
      return localSession
    }

    persistActivePracticeSession(normalized)
    return normalized
  } catch {
    return null
  }
}

