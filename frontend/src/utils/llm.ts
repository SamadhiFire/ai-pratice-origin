import { probeProviderApiKey } from '../services/llm-handshake-service'
import { fetchLlmConfigFromBackend, syncLlmConfigToBackend } from './backend-sync'
import { fetchLlmProvidersFromBackend, verifyLlmConfigInBackend } from './backend-sync'

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export type LlmProvider = 'qwen' | 'deepseek' | 'openai' | 'gemini'

export interface LlmConfig {
  provider: LlmProvider
  apiKey: string
  baseUrl: string
  model: string
}

export type ApiKeyValidationStatus = 'unknown' | 'success' | 'error'

export interface ApiKeyValidationSnapshot {
  status: ApiKeyValidationStatus
  message: string
  checkedAt: number
}

export interface ChatCompletionOptions {
  maxOutputTokens?: number
  temperature?: number
}

type ProviderCallMode = 'openai_chat' | 'openai_responses' | 'gemini_generate_content'

interface ProviderPreset {
  label: string
  baseUrl: string
  model: string
  callMode: ProviderCallMode
}

const PROVIDER_PRESETS: Record<LlmProvider, ProviderPreset> = {
  qwen: {
    label: '千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    callMode: 'openai_chat',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    callMode: 'openai_chat',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.2',
    callMode: 'openai_responses',
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    callMode: 'gemini_generate_content',
  },
}

export const LLM_PROVIDER_OPTIONS = (Object.keys(PROVIDER_PRESETS) as LlmProvider[]).map((value) => ({
  value,
  label: PROVIDER_PRESETS[value].label,
}))

const STORAGE_KEY = 'study_quiz_llm_config_v1'
const MANAGED_KEY_STORAGE = 'study_quiz_managed_api_keys_v1'
const API_KEY_VALIDATION_STORAGE = 'study_quiz_api_key_validation_v1'
const PROVIDER_LIST: LlmProvider[] = ['qwen', 'deepseek', 'openai', 'gemini']
const BACKEND_PROVIDER_LIST = new Set<LlmProvider>(PROVIDER_LIST)
const LLM_REQUEST_TIMEOUT_MS = 45000
const LLM_MAX_OUTPUT_TOKENS = 4096
const LLM_MIN_OUTPUT_TOKENS = 256
const LLM_DEFAULT_TEMPERATURE = 0.3
const API_KEY_CHECK_TIMEOUT_MS = 12000
const BACKEND_HYDRATE_COOLDOWN_MS = 5000

interface UniRequestSuccess<TData = unknown> {
  statusCode: number
  data: TData
}

interface UniRequestFailure {
  errMsg?: string
}

interface OpenAiResponsesPayload {
  output_text?: string
  output?: Array<{ content?: Array<{ text?: string }> }>
}

interface OpenAiChatPayload {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>
}

interface GeminiGenerateContentPayload {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

type ProviderValidationRecord = {
  keyFingerprint: string
  status: Exclude<ApiKeyValidationStatus, 'unknown'>
  message: string
  checkedAt: number
}

let backendSyncingLlmConfig = false
let pendingLlmConfigHydrationPromise: Promise<boolean> | null = null
let lastLlmConfigHydrationAt = 0
type LlmBackendSyncPayload = {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
  managedKeys: Record<string, string>
}
let pendingLlmBackendPayload: LlmBackendSyncPayload | null = null

function loadManagedKeys(): Partial<Record<LlmProvider, string>> {
  const raw = uni.getStorageSync(MANAGED_KEY_STORAGE)
  if (!raw || typeof raw !== 'object') return {}

  const source = raw as Record<string, unknown>
  const managed: Partial<Record<LlmProvider, string>> = {}
  for (const provider of PROVIDER_LIST) {
    managed[provider] = String(source[provider] || '').trim()
  }
  return managed
}

function buildKeyFingerprint(key: string): string {
  const clean = String(key || '').trim()
  if (!clean) return ''
  if (clean.length <= 8) return `${clean.length}:${clean}`
  return `${clean.length}:${clean.slice(0, 4)}:${clean.slice(-4)}`
}

function loadValidationMap(): Partial<Record<LlmProvider, ProviderValidationRecord>> {
  const raw = uni.getStorageSync(API_KEY_VALIDATION_STORAGE)
  if (!raw || typeof raw !== 'object') return {}
  const source = raw as Record<string, unknown>
  const result: Partial<Record<LlmProvider, ProviderValidationRecord>> = {}
  for (const provider of PROVIDER_LIST) {
    const candidate = source[provider]
    if (!candidate || typeof candidate !== 'object') continue
    const record = candidate as Partial<ProviderValidationRecord>
    const statusText = String(record.status || '').trim().toLowerCase()
    if (statusText !== 'success' && statusText !== 'error') continue
    const checkedAt = Number(record.checkedAt || 0)
    result[provider] = {
      keyFingerprint: String(record.keyFingerprint || '').trim(),
      status: statusText as ProviderValidationRecord['status'],
      message: String(record.message || '').trim(),
      checkedAt: Number.isFinite(checkedAt) ? checkedAt : 0,
    }
  }
  return result
}

function saveValidationMap(map: Partial<Record<LlmProvider, ProviderValidationRecord>>): void {
  uni.setStorageSync(API_KEY_VALIDATION_STORAGE, map)
}

export function clearProviderApiKeyValidation(provider?: LlmProvider): void {
  if (!provider) {
    uni.removeStorageSync(API_KEY_VALIDATION_STORAGE)
    return
  }
  const current = loadValidationMap()
  if (!current[provider]) return
  delete current[provider]
  saveValidationMap(current)
}

export function getProviderApiKeyValidation(provider: LlmProvider, apiKey: string): ApiKeyValidationSnapshot {
  const cleanKey = String(apiKey || '').trim()
  if (!cleanKey) {
    return {
      status: 'unknown',
      message: '',
      checkedAt: 0,
    }
  }

  const current = loadValidationMap()
  const record = current[provider]
  if (!record) {
    return {
      status: 'unknown',
      message: '',
      checkedAt: 0,
    }
  }

  const keyFingerprint = buildKeyFingerprint(cleanKey)
  if (!keyFingerprint || record.keyFingerprint !== keyFingerprint) {
    return {
      status: 'unknown',
      message: '',
      checkedAt: 0,
    }
  }

  return {
    status: record.status,
    message: record.message,
    checkedAt: record.checkedAt,
  }
}

function saveProviderApiKeyValidation(
  provider: LlmProvider,
  apiKey: string,
  status: Exclude<ApiKeyValidationStatus, 'unknown'>,
  message: string,
): void {
  const keyFingerprint = buildKeyFingerprint(apiKey)
  if (!keyFingerprint) {
    clearProviderApiKeyValidation(provider)
    return
  }

  const current = loadValidationMap()
  current[provider] = {
    keyFingerprint,
    status,
    message: String(message || '').trim(),
    checkedAt: Date.now(),
  }
  saveValidationMap(current)
}

export async function checkProviderApiKey(
  provider: LlmProvider,
  apiKey: string,
): Promise<ApiKeyValidationSnapshot> {
  const cleanKey = String(apiKey || '').trim()
  if (!cleanKey) {
    clearProviderApiKeyValidation(provider)
    return {
      status: 'error',
      message: 'Key值错误',
      checkedAt: Date.now(),
    }
  }

  const remoteSnapshot = await verifyLlmConfigInBackend(provider, cleanKey).catch(() => null)
  if (remoteSnapshot) {
    if (remoteSnapshot.status === 'success' || remoteSnapshot.status === 'error') {
      saveProviderApiKeyValidation(provider, cleanKey, remoteSnapshot.status, remoteSnapshot.message)
    }
    return remoteSnapshot
  }

  const probe = await probeProviderApiKey(
    provider,
    cleanKey,
    API_KEY_CHECK_TIMEOUT_MS,
    (request) => requestWithAbort(request),
  )

  saveProviderApiKeyValidation(provider, cleanKey, probe.status, probe.message)
  return {
    status: probe.status,
    message: probe.message,
    checkedAt: Date.now(),
  }
}

export async function hydrateLlmProviderOptions(): Promise<Array<{ value: LlmProvider; label: string }>> {
  const remoteOptions = await fetchLlmProvidersFromBackend().catch(() => null)
  return remoteOptions && remoteOptions.length > 0 ? remoteOptions : LLM_PROVIDER_OPTIONS
}

function pushLlmConfigToBackend(): void {
  const config = loadLlmConfig()
  const managed = loadManagedKeys()

  pendingLlmBackendPayload = {
    provider: config.provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    managedKeys: {
      qwen: String(managed.qwen || ''),
      deepseek: String(managed.deepseek || ''),
      openai: String(managed.openai || ''),
      gemini: String(managed.gemini || ''),
    },
  }

  flushLlmConfigBackendSync()
}

function flushLlmConfigBackendSync(): void {
  if (backendSyncingLlmConfig) return
  if (!pendingLlmBackendPayload) return

  const payload = pendingLlmBackendPayload
  pendingLlmBackendPayload = null
  backendSyncingLlmConfig = true

  void syncLlmConfigToBackend(payload).finally(() => {
    backendSyncingLlmConfig = false
    if (pendingLlmBackendPayload) {
      flushLlmConfigBackendSync()
    }
  })
}

function resolveApiKey(provider: LlmProvider, fallbackApiKey: string): string {
  const managed = loadManagedKeys()
  return managed[provider] || fallbackApiKey
}

export function getProviderApiKey(provider: LlmProvider): string {
  return loadManagedKeys()[provider] || ''
}

export function saveProviderApiKey(provider: LlmProvider, apiKey: string): void {
  const current = loadManagedKeys()
  const nextKey = apiKey.trim()
  const prevKey = String(current[provider] || '').trim()
  current[provider] = nextKey
  uni.setStorageSync(MANAGED_KEY_STORAGE, current)
  if (prevKey !== nextKey) {
    clearProviderApiKeyValidation(provider)
  }
  pushLlmConfigToBackend()
}

export function loadProviderApiKeys(): Partial<Record<LlmProvider, string>> {
  return loadManagedKeys()
}

function normalizeProvider(rawProvider: unknown, rawBaseUrl: unknown): LlmProvider {
  const providerText = String(rawProvider || '').trim().toLowerCase()
  if (providerText === 'qwen' || providerText === 'deepseek' || providerText === 'openai' || providerText === 'gemini') {
    return providerText
  }

  const baseUrl = String(rawBaseUrl || '').toLowerCase()
  if (baseUrl.includes('dashscope.aliyuncs.com')) return 'qwen'
  if (baseUrl.includes('api.deepseek.com')) return 'deepseek'
  if (baseUrl.includes('generativelanguage.googleapis.com')) return 'gemini'
  return 'openai'
}

export function getProviderPreset(provider: LlmProvider): ProviderPreset {
  return PROVIDER_PRESETS[provider]
}

export function loadLlmConfig(): LlmConfig {
  const raw = uni.getStorageSync(STORAGE_KEY)
  if (raw && typeof raw === 'object') {
    const source = raw as {
      provider?: unknown
      apiKey?: unknown
      baseUrl?: unknown
      model?: unknown
    }
    const provider = normalizeProvider(source.provider, source.baseUrl)
    const preset = PROVIDER_PRESETS[provider]

    return {
      provider,
      apiKey: resolveApiKey(provider, String(source.apiKey || '')),
      baseUrl: String(source.baseUrl || preset.baseUrl),
      model: String(source.model || preset.model),
    }
  }

  const preset = PROVIDER_PRESETS.deepseek
  return {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: preset.baseUrl,
    model: preset.model,
  }
}

export function saveLlmConfig(config: LlmConfig): void {
  uni.setStorageSync(STORAGE_KEY, config)
  pushLlmConfigToBackend()
}

export async function hydrateLlmConfigFromBackend(): Promise<boolean> {
  if (pendingLlmConfigHydrationPromise) {
    return pendingLlmConfigHydrationPromise
  }

  const now = Date.now()
  if (lastLlmConfigHydrationAt > 0 && now - lastLlmConfigHydrationAt < BACKEND_HYDRATE_COOLDOWN_MS) {
    return false
  }

  pendingLlmConfigHydrationPromise = (async () => {
    const backendConfig = await fetchLlmConfigFromBackend()
    lastLlmConfigHydrationAt = Date.now()
    if (!backendConfig) return false

    const providerRaw = String(backendConfig.provider || '').trim().toLowerCase()
    const provider = BACKEND_PROVIDER_LIST.has(providerRaw as LlmProvider)
      ? (providerRaw as LlmProvider)
      : 'deepseek'

    const mergedManaged = {
      qwen: String(backendConfig.managedKeys?.qwen || '').trim(),
      deepseek: String(backendConfig.managedKeys?.deepseek || '').trim(),
      openai: String(backendConfig.managedKeys?.openai || '').trim(),
      gemini: String(backendConfig.managedKeys?.gemini || '').trim(),
    }
    uni.setStorageSync(MANAGED_KEY_STORAGE, mergedManaged)

    const preset = PROVIDER_PRESETS[provider]
    const nextConfig: LlmConfig = {
      provider,
      apiKey: String(backendConfig.apiKey || '').trim(),
      baseUrl: String(backendConfig.baseUrl || preset.baseUrl).trim() || preset.baseUrl,
      model: String(backendConfig.model || preset.model).trim() || preset.model,
    }
    uni.setStorageSync(STORAGE_KEY, nextConfig)
    return true
  })().finally(() => {
    pendingLlmConfigHydrationPromise = null
  })

  return pendingLlmConfigHydrationPromise
}

export function hasLlmConfig(config?: Partial<LlmConfig>): boolean {
  const target = config ? { ...loadLlmConfig(), ...config } : loadLlmConfig()
  return !!target.apiKey.trim()
}

function normalizeMaxOutputTokens(raw: unknown): number {
  const candidate = Math.floor(Number(raw || 0))
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return LLM_MAX_OUTPUT_TOKENS
  }
  return Math.max(LLM_MIN_OUTPUT_TOKENS, Math.min(LLM_MAX_OUTPUT_TOKENS, candidate))
}

function normalizeTemperature(raw: unknown): number {
  const candidate = Number(raw)
  if (!Number.isFinite(candidate)) return LLM_DEFAULT_TEMPERATURE
  return Math.max(0, Math.min(1.2, candidate))
}

type RequestTaskWithAbort = {
  abort?: () => void
}

const pendingLlmRequests = new Set<RequestTaskWithAbort>()

type UniRequestOptions = Omit<Parameters<typeof uni.request>[0], 'success' | 'fail'>

function requestWithAbort<TData = unknown>(options: UniRequestOptions): Promise<UniRequestSuccess<TData>> {
  return new Promise((resolve, reject) => {
    let task: RequestTaskWithAbort | null = null
    const cleanup = () => {
      if (!task) return
      pendingLlmRequests.delete(task)
    }

    task = uni.request({
      ...options,
      success: (response) => {
        cleanup()
        resolve(response as unknown as UniRequestSuccess<TData>)
      },
      fail: (error) => {
        cleanup()
        reject(error as UniRequestFailure)
      },
    }) as unknown as RequestTaskWithAbort

    if (task) {
      pendingLlmRequests.add(task)
    }
  })
}

export function abortAllLlmRequests(): void {
  pendingLlmRequests.forEach((task) => {
    try {
      task.abort?.()
    } catch {
      // ignore abort failures
    }
  })
  pendingLlmRequests.clear()
}

function extractTextFromOpenAiResponses(data: unknown): string {
  const payload = data as OpenAiResponsesPayload

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  for (const block of payload.output || []) {
    for (const piece of block.content || []) {
      const text = String(piece?.text || '').trim()
      if (text) return text
    }
  }

  return ''
}

function extractTextFromOpenAiChat(data: unknown): string {
  const payload = data as OpenAiChatPayload

  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((item) => String(item?.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  return ''
}

function buildPrompt(messages: ChatMessage[]): string {
  return messages
    .map((msg) => `${msg.role === 'system' ? '[SYSTEM]' : '[USER]'} ${msg.content}`)
    .join('\n\n')
}

export async function chatCompletion(
  messages: ChatMessage[],
  config?: Partial<LlmConfig>,
  options?: ChatCompletionOptions,
): Promise<string> {
  const merged = { ...loadLlmConfig(), ...(config || {}) }
  const provider = normalizeProvider(merged.provider, merged.baseUrl)
  const preset = PROVIDER_PRESETS[provider]
  const maxOutputTokens = normalizeMaxOutputTokens(options?.maxOutputTokens)
  const temperature = normalizeTemperature(options?.temperature)

  const apiKey = resolveApiKey(provider, merged.apiKey?.trim() || '')
  const baseUrl = (merged.baseUrl || preset.baseUrl).replace(/\/$/, '')
  const model = (merged.model || preset.model).trim()

  if (!apiKey) {
    throw new Error('请先填写 API Key')
  }

  if (preset.callMode === 'openai_responses') {
    const response = await requestWithAbort<OpenAiResponsesPayload>({
      url: `${baseUrl}/responses`,
      method: 'POST',
      timeout: LLM_REQUEST_TIMEOUT_MS,
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      data: {
        model,
        input: buildPrompt(messages),
        max_output_tokens: maxOutputTokens,
      },
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`LLM 请求失败(${preset.label}): ${response.statusCode} ${JSON.stringify(response.data)}`)
    }

    const content = extractTextFromOpenAiResponses(response.data)
    if (content) return content
    throw new Error(`${preset.label} 返回内容为空`)
  }

  if (preset.callMode === 'gemini_generate_content') {
    const response = await requestWithAbort<GeminiGenerateContentPayload>({
      url: `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      method: 'POST',
      timeout: LLM_REQUEST_TIMEOUT_MS,
      header: {
        'Content-Type': 'application/json',
      },
      data: {
        contents: [
          {
            role: 'user',
            parts: [{ text: buildPrompt(messages) }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens,
        },
      },
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`LLM 请求失败(${preset.label}): ${response.statusCode} ${JSON.stringify(response.data)}`)
    }

    const parts = response.data?.candidates?.[0]?.content?.parts || []
    const text = parts
      .map((item) => String(item?.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim()

    if (text) return text
    throw new Error(`${preset.label} 返回内容为空`)
  }

  const response = await requestWithAbort<OpenAiChatPayload>({
    url: `${baseUrl}/chat/completions`,
    method: 'POST',
    timeout: LLM_REQUEST_TIMEOUT_MS,
    header: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    data: {
      model,
      messages,
      temperature,
      max_tokens: maxOutputTokens,
    },
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`LLM 请求失败(${preset.label}): ${response.statusCode} ${JSON.stringify(response.data)}`)
  }

  const content = extractTextFromOpenAiChat(response.data)
  if (content) return content
  throw new Error(`${preset.label} 返回内容为空`)
}
