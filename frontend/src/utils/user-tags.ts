import { fetchUserTagsFromBackend, syncUserTagsToBackend } from './backend-sync'

const USER_TAGS_KEY = 'study_quiz_user_tags_v1'
const USER_TAGS_COMPAT_KEY = 'user_tags'
const MAX_USER_TAGS = 7
const BACKEND_HYDRATE_COOLDOWN_MS = 5000
export const USER_TAGS_CHANGED_EVENT = 'study_user_tags_changed'
let backendSyncingTags = false
let pendingBackendTags: string[] | null = null
let pendingUserTagsHydrationPromise: Promise<boolean> | null = null
let lastUserTagsHydrationAt = 0
const TAG_SIGNATURE_STRIP_PATTERN = /[\s`~!@#$%^&*()\-_=+\[\]{}\\|;:'",.<>/?·！￥…（）—【】、；：‘’“”，。《》？]/g

function normalizeTag(raw: unknown): string {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 12)
}

function normalizeTagSignature(raw: unknown): string {
  const clean = normalizeTag(raw)
  if (!clean) return ''
  const stripped = clean.replace(TAG_SIGNATURE_STRIP_PATTERN, '').toLowerCase()
  return stripped || clean.toLowerCase()
}

function writeUserTagsStorage(tags: string[]): void {
  const next = [...tags]
  uni.setStorageSync(USER_TAGS_KEY, next)
  const wxApi = (
    globalThis as {
      wx?: {
        setStorageSync?: (key: string, data: unknown) => void
      }
    }
  ).wx
  if (wxApi?.setStorageSync) {
    try {
      wxApi.setStorageSync(USER_TAGS_KEY, next)
    } catch {
      // ignore wx storage fallback failure
    }
  }
}

function uniqueTags(list: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  for (const item of list) {
    const tag = normalizeTag(item)
    if (!tag) continue
    const signature = normalizeTagSignature(tag)
    if (seen.has(signature)) continue
    seen.add(signature)
    output.push(tag)
    if (output.length >= MAX_USER_TAGS) break
  }

  return output
}

export function loadUserTags(): string[] {
  const raw = uni.getStorageSync(USER_TAGS_KEY)
  if (Array.isArray(raw)) {
    return uniqueTags(raw.map((item) => String(item || '')))
  }

  const legacyRaw = uni.getStorageSync(USER_TAGS_COMPAT_KEY)
  if (!Array.isArray(legacyRaw)) return []

  const migrated = uniqueTags(legacyRaw.map((item) => String(item || '')))
  if (migrated.length > 0) {
    writeUserTagsStorage(migrated)
  }
  uni.removeStorageSync(USER_TAGS_COMPAT_KEY)
  return migrated
}

export function saveUserTags(tags: string[]): string[] {
  const next = uniqueTags(tags)
  writeUserTagsStorage(next)
  uni.removeStorageSync(USER_TAGS_COMPAT_KEY)
  uni.$emit(USER_TAGS_CHANGED_EVENT)
  pushUserTagsToBackend(next)
  return next
}

export function addUserTag(tag: string): string[] {
  const current = loadUserTags()
  return saveUserTags([...current, tag])
}

export function removeUserTag(tag: string): string[] {
  const target = normalizeTagSignature(tag)
  if (!target) return loadUserTags()

  const next = loadUserTags().filter((item) => normalizeTagSignature(item) !== target)
  return saveUserTags(next)
}

export function getUserTagsStorageKey(): string {
  return USER_TAGS_KEY
}

function pushUserTagsToBackend(tags: string[]): void {
  pendingBackendTags = [...tags]
  flushUserTagsBackendSync()
}

function flushUserTagsBackendSync(): void {
  if (backendSyncingTags) return
  if (!pendingBackendTags) return

  const next = pendingBackendTags
  pendingBackendTags = null
  backendSyncingTags = true

  syncUserTagsToBackend(next)
    .catch(() => {
      // ignore backend sync failure
    })
    .finally(() => {
      backendSyncingTags = false
      if (pendingBackendTags) {
        flushUserTagsBackendSync()
      }
    })
}

export async function hydrateUserTagsFromBackend(): Promise<boolean> {
  if (pendingUserTagsHydrationPromise) {
    return pendingUserTagsHydrationPromise
  }

  const now = Date.now()
  if (lastUserTagsHydrationAt > 0 && now - lastUserTagsHydrationAt < BACKEND_HYDRATE_COOLDOWN_MS) {
    return false
  }

  pendingUserTagsHydrationPromise = (async () => {
    try {
      const backendTags = await fetchUserTagsFromBackend()
      lastUserTagsHydrationAt = Date.now()
      if (!Array.isArray(backendTags)) return false

      const next = uniqueTags(backendTags)
      if (next.length === 0) return false

      writeUserTagsStorage(next)
      uni.removeStorageSync(USER_TAGS_COMPAT_KEY)
      return true
    } catch {
      return false
    }
  })().finally(() => {
    pendingUserTagsHydrationPromise = null
  })

  return pendingUserTagsHydrationPromise
}
