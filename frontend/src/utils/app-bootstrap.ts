import { fetchCurrentUser, loadAuthState, loginAsGuest, refreshAuthToken, type UserProfile } from './account'
import { restoreGenerationJobFromBackend, type GenerationJob } from './generation-job'
import { hydrateLlmConfigFromBackend } from './llm'
import { hydrateActivePracticeSessionFromBackend, loadActivePracticeSession, type PracticeSession } from './practice-session'
import { hydrateUserTagsFromBackend } from './user-tags'

export interface AppBootstrapResult {
  authSource: 'refresh' | 'guest' | 'existing' | 'none'
  user: UserProfile | null
  session: PracticeSession | null
  generationJob: GenerationJob | null
}

let pendingBootstrapPromise: Promise<AppBootstrapResult> | null = null

function buildSnapshot(
  authSource: AppBootstrapResult['authSource'],
  user: UserProfile | null,
  session: PracticeSession | null,
  generationJob: GenerationJob | null,
): AppBootstrapResult {
  return {
    authSource,
    user,
    session,
    generationJob,
  }
}

async function hydrateStartupState(user: UserProfile | null, authSource: 'refresh' | 'existing'): Promise<AppBootstrapResult> {
  const currentUser = await fetchCurrentUser().catch(() => user)
  await hydrateUserTagsFromBackend().catch(() => false)
  await hydrateLlmConfigFromBackend().catch(() => false)
  const session = await hydrateActivePracticeSessionFromBackend().catch(() => null)
  const generationJob = await restoreGenerationJobFromBackend(session).catch(() => null)
  return buildSnapshot(authSource, currentUser, loadActivePracticeSession() || session, generationJob)
}

function toExistingSnapshot(): AppBootstrapResult {
  const state = loadAuthState()
  return buildSnapshot(
    state?.token ? 'existing' : 'none',
    null,
    loadActivePracticeSession(),
    null,
  )
}

async function bootstrapByGuestFallback(): Promise<AppBootstrapResult> {
  const guest = await loginAsGuest().catch(() => null)
  if (!guest) {
    return buildSnapshot('none', null, loadActivePracticeSession(), null)
  }

  return buildSnapshot('guest', guest.user, loadActivePracticeSession(), null)
}

async function runBootstrap(): Promise<AppBootstrapResult> {
  const state = loadAuthState()
  const refreshToken = String(state?.refreshToken || '').trim()
  if (!refreshToken) {
    return bootstrapByGuestFallback()
  }

  try {
    const refreshed = await refreshAuthToken()
    if (refreshed?.token) {
      return hydrateStartupState(refreshed.user, 'refresh')
    }

    return bootstrapByGuestFallback()
  } catch {
    return toExistingSnapshot()
  }
}

export function bootstrapBackendRecovery(): Promise<AppBootstrapResult> {
  if (!pendingBootstrapPromise) {
    pendingBootstrapPromise = runBootstrap().finally(() => {
      pendingBootstrapPromise = null
    })
  }

  return pendingBootstrapPromise
}
