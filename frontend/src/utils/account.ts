import { BackendApiError, apiRequest, apiUpload } from './backend-api'

export interface UserProfile {
  userId: string
  nickname: string
  avatarUrl: string
  createdAt: number
  updatedAt: number
  lastLoginAt: number
}

export interface AuthState {
  token: string
  refreshToken: string
  expiresAt: number
  userId: string
  nickname: string
  avatarUrl: string
  updatedAt: number
}

export interface GuestLoginResult {
  user: UserProfile | null
  isNew: boolean
  token: string
  refreshToken: string
  expiresIn: number
}

export interface CredentialAuthPayload {
  account: string
  password: string
  nickname?: string
  avatarUrl?: string
}

const AUTH_STORAGE_KEY = 'study_backend_auth_v1'
const DEFAULT_NICKNAME = 'Guest'

let pendingRefreshPromise: Promise<GuestLoginResult | null> | null = null
let pendingGuestLoginPromise: Promise<GuestLoginResult> | null = null

function normalizeTimestamp(raw: unknown): number {
  const num = Number(raw || 0)
  if (!Number.isFinite(num) || num <= 0) return Date.now()
  if (num > 1_000_000_000 && num < 10_000_000_000) {
    return Math.round(num * 1000)
  }
  return Math.round(num)
}

function normalizeNickname(raw: unknown): string {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 32) || DEFAULT_NICKNAME
}

function normalizeAuthAccount(raw: unknown): string {
  return String(raw || '').replace(/\s+/g, '').trim().slice(0, 80)
}

function parseAccountChannels(account: string): { email: string; phone: string } {
  const clean = normalizeAuthAccount(account)
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)
  const isPhone = /^\+?\d{6,20}$/.test(clean)
  return {
    email: isEmail ? clean : '',
    phone: isPhone ? clean : '',
  }
}

function normalizeUserProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== 'object') return null

  const source = raw as Partial<UserProfile>
  const userId = String(source.userId || '').trim()
  if (!userId) return null

  return {
    userId,
    nickname: normalizeNickname(source.nickname),
    avatarUrl: String(source.avatarUrl || '').trim(),
    createdAt: normalizeTimestamp(source.createdAt),
    updatedAt: normalizeTimestamp(source.updatedAt),
    lastLoginAt: normalizeTimestamp(source.lastLoginAt),
  }
}

function getRemainingExpiresIn(state: AuthState | null): number {
  return Math.max(0, Math.floor((Number(state?.expiresAt || 0) - Date.now()) / 1000))
}

function saveAuthResult(payload: {
  token?: unknown
  refreshToken?: unknown
  expiresIn?: unknown
  isNew?: unknown
  user?: unknown
}): GuestLoginResult {
  const user = normalizeUserProfile(payload.user)
  const token = String(payload.token || '').trim()
  if (!user || !token) {
    throw new Error('Login failed.')
  }

  const refreshToken = String(payload.refreshToken || '').trim()
  const expiresIn = Math.max(0, Number(payload.expiresIn || 0))
  saveAuthState({
    token,
    refreshToken,
    expiresIn,
    user,
  })

  return {
    user,
    isNew: Boolean(payload.isNew),
    token,
    refreshToken,
    expiresIn,
  }
}

export function loadAuthState(): AuthState | null {
  const raw = uni.getStorageSync(AUTH_STORAGE_KEY)
  if (!raw || typeof raw !== 'object') return null

  const source = raw as Partial<AuthState>
  const token = String(source.token || '').trim()
  const userId = String(source.userId || '').trim()
  if (!token || !userId) return null

  return {
    token,
    refreshToken: String(source.refreshToken || '').trim(),
    expiresAt: normalizeTimestamp(source.expiresAt),
    userId,
    nickname: normalizeNickname(source.nickname),
    avatarUrl: String(source.avatarUrl || '').trim(),
    updatedAt: normalizeTimestamp(source.updatedAt),
  }
}

export function saveAuthState(payload: {
  token: string
  refreshToken?: string
  expiresIn?: number
  user: UserProfile
}): AuthState {
  const state: AuthState = {
    token: String(payload.token || '').trim(),
    refreshToken: String(payload.refreshToken || '').trim(),
    expiresAt: Date.now() + Math.max(0, Number(payload.expiresIn || 0)) * 1000,
    userId: String(payload.user.userId || '').trim(),
    nickname: normalizeNickname(payload.user.nickname),
    avatarUrl: String(payload.user.avatarUrl || '').trim(),
    updatedAt: normalizeTimestamp(payload.user.updatedAt),
  }
  uni.setStorageSync(AUTH_STORAGE_KEY, state)
  return state
}

export function clearAuthState(): void {
  uni.removeStorageSync(AUTH_STORAGE_KEY)
}

export function hasAuthState(): boolean {
  return !!loadAuthState()?.token
}

export function buildUserProfileFromAuth(state: AuthState | null): UserProfile | null {
  if (!state) return null

  const updatedAt = normalizeTimestamp(state.updatedAt)
  return {
    userId: state.userId,
    nickname: normalizeNickname(state.nickname),
    avatarUrl: String(state.avatarUrl || '').trim(),
    createdAt: updatedAt,
    updatedAt,
    lastLoginAt: updatedAt,
  }
}

function handleAuthError(error: unknown): never {
  if (error instanceof BackendApiError && error.code === 40100) {
    clearAuthState()
  }
  throw error
}

async function retryWithRefresh<T>(runner: (token: string) => Promise<T>): Promise<T> {
  const state = loadAuthState()
  const token = String(state?.token || '').trim()
  if (!token) {
    throw new Error('Authentication is required.')
  }

  try {
    return await runner(token)
  } catch (error) {
    const shouldRefresh = error instanceof BackendApiError
      && error.code === 40100
      && String(state?.refreshToken || '').trim()
    if (!shouldRefresh) {
      handleAuthError(error)
    }

    const refreshed = await refreshAuthToken().catch(() => null)
    const nextToken = String(refreshed?.token || loadAuthState()?.token || '').trim()
    if (!nextToken) {
      handleAuthError(error)
    }

    try {
      return await runner(nextToken)
    } catch (retryError) {
      handleAuthError(retryError)
    }
  }
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const state = loadAuthState()
  if (!state?.token) return null

  const data = await retryWithRefresh((token) => apiRequest<UserProfile>({
    path: '/users/me',
    token,
  }))
  const user = normalizeUserProfile(data)
  if (!user) return null

  const nextState = loadAuthState() || state
  saveAuthState({
    token: nextState.token,
    refreshToken: nextState.refreshToken,
    expiresIn: getRemainingExpiresIn(nextState),
    user,
  })
  return user
}

export async function loginAsGuest(profile?: {
  nickname?: string
  avatarUrl?: string
}): Promise<GuestLoginResult> {
  if (!pendingGuestLoginPromise) {
    pendingGuestLoginPromise = apiRequest<{
      token?: unknown
      refreshToken?: unknown
      expiresIn?: unknown
      isNew?: unknown
      user?: unknown
    }>({
      path: '/auth/guest',
      method: 'POST',
      data: {
        nickname: normalizeNickname(profile?.nickname),
        avatarUrl: String(profile?.avatarUrl || '').trim(),
      },
    }).then((data) => saveAuthResult(data))
      .finally(() => {
        pendingGuestLoginPromise = null
      })
  }

  return pendingGuestLoginPromise
}

async function authenticateByCredential(
  path: '/auth/login' | '/auth/register',
  payload: CredentialAuthPayload,
): Promise<GuestLoginResult> {
  const account = normalizeAuthAccount(payload.account)
  const password = String(payload.password || '').trim()
  if (!account) {
    throw new Error('请输入手机号或邮箱')
  }
  if (!password) {
    throw new Error('请输入密码')
  }

  const channels = parseAccountChannels(account)
  try {
    const data = await apiRequest<{
      token?: unknown
      refreshToken?: unknown
      expiresIn?: unknown
      isNew?: unknown
      user?: unknown
    }>({
      path,
      method: 'POST',
      data: {
        account,
        email: channels.email,
        phone: channels.phone,
        password,
        nickname: normalizeNickname(payload.nickname),
        avatarUrl: String(payload.avatarUrl || '').trim(),
      },
    })
    return saveAuthResult(data)
  } catch (error) {
    throw error
  }
}

export async function loginWithCredential(payload: Pick<CredentialAuthPayload, 'account' | 'password'>): Promise<GuestLoginResult> {
  return authenticateByCredential('/auth/login', payload as CredentialAuthPayload)
}

export async function registerWithCredential(payload: CredentialAuthPayload): Promise<GuestLoginResult> {
  return authenticateByCredential('/auth/register', payload)
}

export async function refreshAuthToken(): Promise<GuestLoginResult | null> {
  const state = loadAuthState()
  const refreshToken = String(state?.refreshToken || '').trim()
  if (!refreshToken) return null

  if (!pendingRefreshPromise) {
    pendingRefreshPromise = apiRequest<{
      token?: unknown
      refreshToken?: unknown
      expiresIn?: unknown
      user?: unknown
    }>({
      path: '/auth/refresh',
      method: 'POST',
      data: { refreshToken },
    }).then((data) => saveAuthResult({
      token: data.token,
      refreshToken: data.refreshToken || refreshToken,
      expiresIn: data.expiresIn,
      isNew: false,
      user: data.user ?? buildUserProfileFromAuth(state),
    })).catch((error) => {
      if (error instanceof BackendApiError && error.code === 40100) {
        clearAuthState()
        return null
      }
      throw error
    }).finally(() => {
      pendingRefreshPromise = null
    })
  }

  return pendingRefreshPromise
}

export async function ensureAuthenticated(profile?: {
  nickname?: string
  avatarUrl?: string
}): Promise<GuestLoginResult | { user: UserProfile | null; isNew: false; token: string; refreshToken: string; expiresIn: number }> {
  const state = loadAuthState()
  const refreshToken = String(state?.refreshToken || '').trim()

  if (refreshToken) {
    try {
      const refreshed = await refreshAuthToken()
      if (refreshed?.token) {
        return refreshed
      }
    } catch (error) {
      if (state?.token) {
        const user = await fetchCurrentUser().catch(() => buildUserProfileFromAuth(loadAuthState() || state))
        const nextState = loadAuthState() || state
        if (nextState.token) {
          return {
            user,
            isNew: false,
            token: nextState.token,
            refreshToken: nextState.refreshToken,
            expiresIn: getRemainingExpiresIn(nextState),
          }
        }
      }
      throw error
    }
  }

  const nextState = loadAuthState()
  if (nextState?.token) {
    const user = await fetchCurrentUser().catch(() => buildUserProfileFromAuth(loadAuthState() || nextState))
    const latestState = loadAuthState() || nextState
    if (latestState.token) {
      return {
        user,
        isNew: false,
        token: latestState.token,
        refreshToken: latestState.refreshToken,
        expiresIn: getRemainingExpiresIn(latestState),
      }
    }
  }

  return loginAsGuest(profile)
}

export async function updateCurrentUserProfile(payload: {
  nickname?: string
  avatarUrl?: string
}): Promise<UserProfile | null> {
  const state = loadAuthState()
  if (!state?.token) return null

  const data = await retryWithRefresh((token) => apiRequest<UserProfile>({
    path: '/users/me',
    method: 'PATCH',
    token,
    data: {
      nickname: normalizeNickname(payload.nickname ?? state.nickname),
      avatarUrl: String(payload.avatarUrl ?? (state.avatarUrl || '')).trim(),
    },
  }))
  const user = normalizeUserProfile(data)
  if (!user) return null

  const nextState = loadAuthState() || state
  saveAuthState({
    token: nextState.token,
    refreshToken: nextState.refreshToken,
    expiresIn: getRemainingExpiresIn(nextState),
    user,
  })
  return user
}

export async function uploadAvatarFile(filePath: string): Promise<string> {
  const state = loadAuthState()
  if (!state?.token) {
    throw new Error('Please sign in first.')
  }

  const data = await retryWithRefresh((token) => apiUpload<{
    url?: unknown
    user?: unknown
  }>({
    path: '/files/avatar',
    filePath,
    token,
  }))
  const url = String(data.url || '').trim()
  if (!url) {
    throw new Error('Avatar upload failed.')
  }

  const nextState = loadAuthState() || state
  const normalizedUser = normalizeUserProfile(data.user)
  const fallbackUser = buildUserProfileFromAuth(nextState)
  const user = normalizedUser || (fallbackUser
    ? {
      ...fallbackUser,
      avatarUrl: url,
      updatedAt: Date.now(),
    }
    : null)

  if (user) {
    saveAuthState({
      token: nextState.token,
      refreshToken: nextState.refreshToken,
      expiresIn: getRemainingExpiresIn(nextState),
      user,
    })
  }

  return url
}
