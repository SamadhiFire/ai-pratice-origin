import {
  buildUserProfileFromAuth,
  clearAuthState,
  ensureAuthenticated,
  fetchCurrentUser,
  loadAuthState,
  saveAuthState,
  updateCurrentUserProfile,
  type UserProfile,
} from './account'

export interface BackendUserProfile extends UserProfile {}

export interface BackendAuthState {
  userId: string
  nickname: string
  avatarUrl: string
  updatedAt: number
}

export function loadBackendAuthState(): BackendAuthState | null {
  const state = loadAuthState()
  if (!state) return null
  return {
    userId: state.userId,
    nickname: String(state.nickname || '').trim(),
    avatarUrl: String(state.avatarUrl || '').trim(),
    updatedAt: Number(state.updatedAt || Date.now()),
  }
}

export function saveBackendAuthState(profile: BackendUserProfile): void {
  const state = loadAuthState()
  if (!state) return
  saveAuthState({
    token: state.token,
    refreshToken: state.refreshToken,
    expiresIn: Math.max(0, Math.floor((state.expiresAt - Date.now()) / 1000)),
    user: {
      userId: String(profile.userId || state.userId || '').trim(),
      nickname: String(profile.nickname || state.nickname || '').trim(),
      avatarUrl: String(profile.avatarUrl || state.avatarUrl || '').trim(),
      createdAt: Number(profile.createdAt || Date.now()),
      updatedAt: Number(profile.updatedAt || Date.now()),
      lastLoginAt: Number(profile.lastLoginAt || Date.now()),
    },
  })
}

export function clearBackendAuthState(): void {
  clearAuthState()
}

export async function fetchBackendProfile(): Promise<BackendUserProfile | null> {
  return fetchCurrentUser().catch(() => null)
}

export async function ensureBackendAccount(profile?: {
  nickname?: string
  avatarUrl?: string
}): Promise<{ user: BackendUserProfile | null; isNew: boolean }> {
  const result = await ensureAuthenticated(profile)
  return {
    user: result.user,
    isNew: Boolean(result.isNew),
  }
}

export async function updateBackendProfileByPayload(profile: {
  nickname?: string
  avatarUrl?: string
}): Promise<{ user: BackendUserProfile | null; isNew: boolean }> {
  const state = loadAuthState()
  if (!state) {
    return {
      user: buildUserProfileFromAuth(null),
      isNew: false,
    }
  }

  const user = await updateCurrentUserProfile(profile).catch(() => null)
  return {
    user,
    isNew: false,
  }
}
