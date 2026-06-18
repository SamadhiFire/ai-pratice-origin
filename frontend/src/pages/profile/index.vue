<template>
  <view class="page-root">
    <view class="profile-fixed-shell" :style="fixedHeaderStyle">
      <view class="title-header">
        <view class="title-wrap">
          <text class="page-title page-title-slogan">本牛马，天下第一！</text>
          <image
            class="title-deco-image"
            :src="profileTitleDecoSrc"
            mode="aspectFit"
            @error="onProfileTitleDecoError"
          />
        </view>
      </view>
    </view>

    <scroll-view class="page-scroll oa-scrollbar-stealth" :style="pageScrollStyle" :scroll-y="!goalLoading" :show-scrollbar="false">
      <view class="page-body">
        <view class="panel oa-card-surface profile-panel" :class="isGuestProfile ? 'is-clickable' : ''" @click="handleProfileCardTap">
          <button class="avatar-btn" @click.stop="handleAvatarTrigger">
            <view class="avatar-wrap">
              <image v-if="profile.avatarUrl" class="avatar-image" :src="profile.avatarUrl" mode="aspectFill" />
              <view v-else class="avatar-fallback">{{ nicknameInitial }}</view>
              <view class="avatar-badge">+</view>
            </view>
          </button>
          <view class="profile-main">
            <view class="profile-name-row" @click.stop="handleProfileNameTap">
              <text v-if="isGuestProfile" class="profile-login-title">点击登录 / 注册</text>
              <template v-else>
                <view v-if="!isNicknameEditing" class="profile-nickname-display">
                  <text class="profile-nickname-text">{{ profileNicknameDisplay }}</text>
                  <view class="profile-nickname-edit-dot" @click.stop="startNicknameEditing" />
                </view>
                <input
                  v-else
                  v-model="profileNicknameDraft"
                  class="profile-nickname-input"
                  type="text"
                  maxlength="32"
                  :focus="profileNicknameInputFocus"
                  placeholder="点击设置昵称"
                  placeholder-style="color:#BDBDBD;"
                  @focus="handleNicknameFocus"
                  @blur="handleNicknameBlur"
                  @confirm="confirmNicknameEdit"
                />
              </template>
            </view>
            <text v-if="isGuestProfile" class="profile-login-tip">点击登录 / 注册，立即同步账号与练习进度</text>
          </view>
        </view>

        <view class="panel oa-card-surface setting-panel" :class="[apiGuideHighlight ? 'is-api-guide-highlight' : '', showApiCheckRow ? 'has-api-status' : '']">
          <text class="section-title">API 配置</text>

          <view class="field-box">
            <picker mode="selector" :range="providerOptions" range-key="label" :value="providerIndex" @change="onProviderChange">
              <view class="picker-label">{{ selectedProviderLabel }}</view>
            </picker>
          </view>

          <view class="field-box api-key-box" :class="apiKeyInputFocused ? 'is-focused' : ''">
            <view class="api-key-field">
              <input
                v-model="apiKeyDraft"
                :class="['text-input', 'api-key-input', !isApiKeyVisible ? 'is-masked' : '']"
                type="text"
                :password="!isApiKeyVisible"
                :focus="apiKeyInputFocused"
                placeholder="填写当前品牌 API Key"
                placeholder-style="color:#B2B2B2;"
                @focus="handleApiKeyFocus"
                @blur="handleApiKeyBlur"
                @confirm="handleApiKeyConfirm"
              />
              <image
                v-if="apiKeyDraft.length > 0"
                class="api-key-clear-icon"
                :src="clearIconSvg"
                mode="aspectFit"
                @click.stop="handleClearApiKey"
              />
              <image
                class="api-key-visibility-icon"
                :src="isApiKeyVisible ? eyeOpenSvg : eyeClosedSvg"
                mode="aspectFit"
                @click="toggleApiKeyVisibility"
              />
            </view>
          </view>

          <view class="hint-text">当前品牌已保存：{{ maskedProviderKey }}</view>
          <view v-if="showApiCheckRow" class="api-check-row">
            <view
              class="api-check-status"
              :class="[
                apiCheckUiStatus === 'checking' ? 'is-checking' : '',
                apiCheckUiStatus === 'success' ? 'is-success' : '',
                apiCheckUiStatus === 'error' ? 'is-error' : '',
              ]"
            >
              <view v-if="apiCheckUiStatus === 'checking'" class="api-check-spinner" />
              <text>{{ apiCheckDisplayText }}</text>
            </view>
            <view
              class="api-check-btn"
              :class="apiCheckUiStatus === 'checking' ? 'is-disabled' : ''"
              @click="handleManualCheckApiKey"
            >
              {{ apiCheckUiStatus === 'checking' ? '检测中...' : '测试连接' }}
            </view>
          </view>
        </view>

        <view class="panel oa-card-surface ai-panel">
          <text class="section-title">AI 个性化题集</text>

          <view class="field-box goal-input-field">
            <view class="goal-input-wrap">
              <textarea
                v-model="goalInput"
                class="goal-textarea"
                maxlength="160"
                placeholder="在此输入你想练习的领域（如：互联网运营、Java面试），点击生成后，AI 会自动从全网库中匹配核心考点，为你生成一套个性化刷题板块~"
                placeholder-style="color:#555555;font-size:24rpx;line-height:1.6;"
              />
              <view
                v-if="goalInput.length > 0"
                class="goal-input-clear-btn"
                @click.stop="clearGoalInput"
              >
                <image
                  class="goal-input-clear-icon"
                  :src="goalClearIconSvg"
                  mode="aspectFit"
                />
              </view>
            </view>
          </view>

          <button
            class="save-btn ai-generate-btn"
            :class="guideGenerateHighlight ? 'is-guide-highlight' : ''"
            hover-class="save-btn-hover"
            :loading="goalLoading"
            :disabled="goalLoading"
            @click="generateGoalTags"
          >
            生成个性化题集分类
          </button>

          <transition name="goal-error-fade">
            <view v-if="goalError" class="hint-text goal-error">{{ goalError }}</view>
          </transition>

          <view v-if="pendingTags.length > 0" class="suggested-wrap">
            <view class="tag-list">
              <view
                v-for="item in pendingTags"
                :key="`suggest-${item.name}`"
                class="tag-chip tag-chip-selectable tag-item"
                :class="item.selected ? 'is-selected' : 'is-unselected'"
                @click="togglePendingTag(item.name)"
              >
                {{ item.name }}
              </view>
            </view>
            <view class="confirm-actions">
              <view class="confirm-btn is-primary" :class="retagLoading ? 'is-disabled' : ''" @click="acceptSuggestedTags">
                {{ retagLoading ? '归类中...' : '接受并生效' }}
              </view>
              <view
                class="confirm-btn"
                :class="goalLoading || retagLoading ? 'is-disabled' : ''"
                @click="regenerateSuggestedTags"
              >
                {{ goalLoading ? '生成中...' : '重新生成' }}
              </view>
              <view
                class="confirm-btn"
                :class="goalLoading || retagLoading ? 'is-disabled' : ''"
                @click="cancelSuggestedTags"
              >
                取消
              </view>
            </view>
          </view>
        </view>

        <view class="panel oa-card-surface tag-panel">
          <view class="tag-header" @click="toggleTagCollapse">
            <text class="section-title tag-title">已生效题集（{{ activeTags.length }}）</text>
            <text class="tag-toggle">{{ isTagCollapsed ? '展开' : '收起' }}</text>
          </view>

          <view v-if="!isTagCollapsed" class="tag-body">
            <view class="tag-list">
              <view v-for="tag in activeTags" :key="`active-${tag}`" class="tag-chip">
                <text>{{ tag }}</text>
                <text class="tag-remove" @click.stop="removeActiveTag(tag)">x</text>
              </view>
              <text v-if="activeTags.length === 0" class="hint-text">暂无标签，先让 AI 生成一套吧</text>
            </view>

            <view class="tag-add-row">
              <view class="field-box tag-add-input-wrap">
                <input
                  v-model="customTagInput"
                  class="text-input"
                  type="text"
                  maxlength="12"
                  placeholder="手动新增标签"
                  placeholder-style="color:#70757A;"
                  @confirm="addCustomTag"
                />
              </view>
              <view class="tag-add-btn" @click="addCustomTag">+ 添加</view>
            </view>
          </view>
        </view>

        <view v-if="!isGuestProfile" class="panel oa-card-surface auth-action-panel">
          <button
            class="logout-btn"
            hover-class="logout-btn-hover"
            :disabled="profileUpdating || profileAuthLoading"
            @click="handleLogout"
          >
            退出登录
          </button>
          <text class="logout-hint">退出后将回到游客模式，后台仍保留题集与配置。</text>
        </view>
      </view>
    </scroll-view>

    <WorkMaskOverlay v-if="goalLoading" @cancel="cancelGoalGeneration" />

    <transition name="dialog-fade">
      <view v-if="showAuthDialog && isGuestProfile" class="auth-dialog-backdrop" @click.self="closeAuthDialog">
        <view class="auth-dialog-card">
          <text class="auth-dialog-title">登录 / 注册</text>
          <view class="auth-dialog-form">
            <text class="auth-dialog-field-label">手机号 / 邮箱</text>
            <input
              v-model="authDialogAccountDraft"
              class="auth-dialog-input"
              type="text"
              maxlength="80"
              :disabled="profileAuthLoading"
              placeholder="请输入手机号或邮箱"
              placeholder-style="color:#A7A7A7;"
            />
          </view>
          <view class="auth-dialog-form">
            <text class="auth-dialog-field-label">密码</text>
            <input
              v-model="authDialogPasswordDraft"
              class="auth-dialog-input"
              type="text"
              :password="true"
              maxlength="64"
              :disabled="profileAuthLoading"
              placeholder="请输入密码"
              placeholder-style="color:#A7A7A7;"
              @confirm="confirmAuthDialog"
            />
          </view>
          <view v-if="authDialogMode === 'register'" class="auth-dialog-form">
            <text class="auth-dialog-field-label">确认密码</text>
            <input
              v-model="authDialogConfirmPasswordDraft"
              class="auth-dialog-input"
              type="text"
              :password="true"
              maxlength="64"
              :disabled="profileAuthLoading"
              placeholder="请再次输入密码"
              placeholder-style="color:#A7A7A7;"
              @confirm="confirmAuthDialog"
            />
          </view>
          <button
            class="auth-dialog-cta"
            :class="profileAuthLoading ? 'is-loading' : ''"
            :disabled="profileAuthLoading"
            @click="confirmAuthDialog"
          >
            {{ profileAuthLoading ? (authDialogMode === 'register' ? '注册中...' : '登录中...') : (authDialogMode === 'register' ? '立即注册' : '立即登录') }}
          </button>
          <button class="auth-dialog-cta secondary" :disabled="profileAuthLoading" @click="closeAuthDialog">
            稍后再说
          </button>
          <view v-if="authDialogMode === 'login'" class="auth-dialog-switch-row">
            <text class="auth-dialog-switch-prefix">还没有账号？点击</text>
            <text class="auth-dialog-switch-action" @click="switchToRegisterMode">立即注册</text>
          </view>
        </view>
      </view>
    </transition>

    <InsTabBar active="profile" />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import InsTabBar from '../../components/InsTabBar.vue'
import WorkMaskOverlay from '../../components/WorkMaskOverlay.vue'
import {
  abortAllLlmRequests,
  chatCompletion,
  checkProviderApiKey,
  clearProviderApiKeyValidation,
  getProviderApiKeyValidation,
  hydrateLlmConfigFromBackend,
  hydrateLlmProviderOptions,
  loadLlmConfig,
  saveLlmConfig,
  getProviderApiKey,
  saveProviderApiKey,
  LLM_PROVIDER_OPTIONS,
  getProviderPreset,
  type ApiKeyValidationStatus,
  type LlmProvider,
} from '../../utils/llm'
import { resolveStatusBarTopPadding } from '../../utils/layout'
import {
  USER_TAGS_CHANGED_EVENT,
  addUserTag,
  hydrateUserTagsFromBackend,
  loadUserTags,
  removeUserTag,
  saveUserTags,
} from '../../utils/user-tags'
import { type StoredQuestion } from '../../utils/question-bank'
import { retagQuestionBankByTags } from '../../utils/tag-retag'
import {
  generateTagsInBackend,
  retagHistoricalQuestionsInBackend,
} from '../../utils/backend-sync'
import { loginWithCredential, registerWithCredential, uploadAvatarFile } from '../../utils/account'
import { BackendApiError } from '../../utils/backend-api'
import {
  clearBackendAuthState,
  ensureBackendAccount,
  fetchBackendProfile,
  loadBackendAuthState,
  saveBackendAuthState,
  type BackendAuthState,
  type BackendUserProfile,
  updateBackendProfileByPayload,
} from '../../utils/backend-user'

interface LocalUserProfile {
  avatarUrl: string
  nickname: string
}

const USER_PROFILE_KEY = 'study_quiz_user_profile_v1'
const TAG_GUIDE_DISMISSED_KEY = 'study_tag_guide_dismissed_v1'
const API_KEY_SYNC_EVENT = 'study_api_key_changed'
const PROFILE_AI_DRAFT_KEY = 'study_profile_ai_draft_v1'
const PROFILE_MANUAL_AUTH_KEY = 'study_profile_manual_auth_v1'
const GOAL_API_KEY_REQUIRED_ERROR = '请先完成 API Key 配置'
const GUIDE_HIGHLIGHT_DURATION = 8000
const API_GUIDE_HIGHLIGHT_DURATION = 3000
const API_CHECK_SUCCESS_HIDE_DURATION = 3000
const GOAL_API_KEY_ERROR_HIDE_DURATION = 5000
const RETAG_APPLY_TIMEOUT_MS = 20000
const DEFAULT_NICKNAME = '游客用户'

type AppGuideGlobalData = {
  isFromGuide?: boolean
  isFromApiGuide?: boolean
  hasDismissedTagGuide?: boolean
}

type ApiCheckUiStatus = 'idle' | 'checking' | 'success' | 'error'
type SuggestedTagState = { name: string; selected: boolean }
type ProfileAiDraftState = {
  goalInput: string
  pendingTags: SuggestedTagState[]
  goalRegenerateRound: number
}

const providerOptions = ref(LLM_PROVIDER_OPTIONS)
const provider = ref<LlmProvider>('deepseek')
const apiKeyDraft = ref('')
const isApiKeyVisible = ref(false)
const apiKeyInputFocused = ref(false)
const savedProviderKey = ref('')
const apiCheckUiStatus = ref<ApiCheckUiStatus>('idle')
const apiCheckMessage = ref('')
const apiCheckRequestNonce = ref(0)
const goalInput = ref('')
const goalLoading = ref(false)
const goalRequestNonce = ref(0)
const goalRegenerateRound = ref(0)
const goalError = ref('')
const pendingTags = ref<SuggestedTagState[]>([])
const activeTags = ref<string[]>([])
const customTagInput = ref('')
const isTagCollapsed = ref(true)
const retagLoading = ref(false)
const profileAuthLoading = ref(false)
const profileUpdating = ref(false)
const profileNicknameDraft = ref('')
const isNicknameEditing = ref(false)
const profileNicknameInputFocus = ref(false)
const manualAuthEnabled = ref(loadManualAuthEnabled())
const backendAuthState = ref<BackendAuthState | null>(loadBackendAuthState())
const guideGenerateHighlight = ref(false)
const apiGuideHighlight = ref(false)
const safeTopPx = ref(resolveStatusBarTopPadding())
const fixedHeaderHeightPx = ref(132)
const fixedHeaderStyle = computed(() => ({ paddingTop: `${safeTopPx.value}px` }))
const pageScrollStyle = computed(() => ({ paddingTop: `${fixedHeaderHeightPx.value}px` }))
const MAX_TAG_COUNT = 7
const TAG_REGENERATE_MIN_DIFFERENT = 3
const profileTitleDecoCandidates = [
  '/static/niuma13-2-lite.webp',
  '/static/niuma13-2-lite.png',
]
const profileTitleDecoIndex = ref(0)
const profileTitleDecoSrc = computed(() => profileTitleDecoCandidates[profileTitleDecoIndex.value] || profileTitleDecoCandidates[0])

const showAuthDialog = ref(false)
const authDialogSeed = ref<{ nickname?: string; avatarUrl?: string } | null>(null)
const authDialogMode = ref<'login' | 'register'>('login')
const authDialogAccountDraft = ref('')
const authDialogPasswordDraft = ref('')
const authDialogConfirmPasswordDraft = ref('')

type GenerateGoalTagsOptions = {
  regenerate?: boolean
  previousTags?: string[]
  regenerateRound?: number
}

function isGenerateGoalTagsOptions(value: unknown): value is GenerateGoalTagsOptions {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return 'regenerate' in candidate || 'previousTags' in candidate || 'regenerateRound' in candidate
}

function loadManualAuthEnabled(): boolean {
  const raw = uni.getStorageSync(PROFILE_MANUAL_AUTH_KEY)
  return raw === 1 || raw === '1' || raw === true || raw === 'true'
}

function setManualAuthEnabled(enabled: boolean) {
  manualAuthEnabled.value = enabled
  if (enabled) {
    uni.setStorageSync(PROFILE_MANUAL_AUTH_KEY, 1)
    return
  }
  uni.removeStorageSync(PROFILE_MANUAL_AUTH_KEY)
}

const profile = ref<LocalUserProfile>({
  avatarUrl: '',
  nickname: DEFAULT_NICKNAME,
})
const isGuestProfile = computed(() => !manualAuthEnabled.value || !backendAuthState.value)

const providerIndex = computed(() => {
  const idx = providerOptions.value.findIndex((item) => item.value === provider.value)
  return idx >= 0 ? idx : 0
})

const selectedProviderLabel = computed(() => providerOptions.value[providerIndex.value]?.label || '请选择品牌')

const nicknameInitial = computed(() => {
  const nick = profile.value.nickname.trim()
  if (!nick) return '我'
  return nick.slice(0, 1)
})
const profileNicknameDisplay = computed(() => normalizeNickname(profileNicknameDraft.value || profile.value.nickname))

const maskedProviderKey = computed(() => {
  const key = String(savedProviderKey.value || '').trim()
  if (!key) return '未配置'
  if (key.length <= 8) return `${key.slice(0, 2)}****`
  return `${key.slice(0, 4)}****${key.slice(-3)}`
})
const hasApiKeyInput = computed(() => apiKeyDraft.value.trim().length > 0)
const showApiCheckRow = computed(() => hasApiKeyInput.value && apiCheckUiStatus.value !== 'idle')
const apiCheckDisplayText = computed(() => {
  if (apiCheckUiStatus.value === 'checking') return '正在检测连通性...'
  if (apiCheckUiStatus.value === 'success') return '连通成功'
  if (apiCheckUiStatus.value === 'error') return apiCheckMessage.value || 'Key值错误'
  return ''
})
const eyeClosedSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23C0C4CC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
const eyeOpenSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23C0C4CC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
const clearIconSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="%23C0C4CC" stroke-width="1.5"/><path d="M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5" stroke="%23C0C4CC" stroke-width="1.5" stroke-linecap="round"/></svg>'
const goalClearIconSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="%23CCCCCC" stroke-width="1.5"/><path d="M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5" stroke="%23CCCCCC" stroke-width="1.5" stroke-linecap="round"/></svg>'
let guideHighlightTimer: ReturnType<typeof setTimeout> | null = null
let apiGuideHighlightTimer: ReturnType<typeof setTimeout> | null = null
let apiCheckAutoHideTimer: ReturnType<typeof setTimeout> | null = null
let goalErrorAutoHideTimer: ReturnType<typeof setTimeout> | null = null
const TAG_SIGNATURE_STRIP_PATTERN = /[\s`~!@#$%^&*()\-_=+\[\]{}\\|;:'",.<>/?·！￥…（）—【】、；：‘’“”，。《》？]/g

function loadConfig() {
  const config = loadLlmConfig()
  provider.value = config.provider
  apiKeyDraft.value = getProviderApiKey(config.provider) || config.apiKey || ''
  savedProviderKey.value = String(getProviderApiKey(config.provider) || config.apiKey || '').trim()
  applyApiCheckStatus('unknown', '')
}

function normalizeDraftTag(tag: unknown): string {
  return String(tag || '').replace(/\s+/g, ' ').trim().slice(0, 12)
}

function sanitizePendingTagStates(raw: unknown): SuggestedTagState[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const output: SuggestedTagState[] = []
  raw.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const source = item as Partial<SuggestedTagState>
    const name = normalizeDraftTag(source.name)
    if (!name) return
    const signature = name.toLowerCase()
    if (seen.has(signature)) return
    seen.add(signature)
    output.push({
      name,
      selected: Boolean(source.selected),
    })
  })
  return output.slice(0, MAX_TAG_COUNT)
}

function readAiDraftState(): ProfileAiDraftState | null {
  try {
    const raw = uni.getStorageSync(PROFILE_AI_DRAFT_KEY)
    if (!raw || typeof raw !== 'object') return null
    const source = raw as Partial<ProfileAiDraftState & { suggestedTagStates?: unknown }>
    const nextGoalInput = String(source.goalInput || '').slice(0, 160)
    const nextPendingTags = sanitizePendingTagStates(
      source.pendingTags ?? source.suggestedTagStates,
    )
    const roundValue = Number(source.goalRegenerateRound)
    const nextRegenerateRound = Number.isFinite(roundValue) ? Math.max(0, Math.floor(roundValue)) : 0
    if (!nextGoalInput && nextPendingTags.length === 0 && nextRegenerateRound <= 0) {
      return null
    }
    return {
      goalInput: nextGoalInput,
      pendingTags: nextPendingTags,
      goalRegenerateRound: nextRegenerateRound,
    }
  } catch {
    return null
  }
}

function persistAiDraftState() {
  const payload: ProfileAiDraftState = {
    goalInput: String(goalInput.value || '').slice(0, 160),
    pendingTags: sanitizePendingTagStates(pendingTags.value),
    goalRegenerateRound: Math.max(0, Math.floor(Number(goalRegenerateRound.value || 0))),
  }

  if (!payload.goalInput && payload.pendingTags.length === 0 && payload.goalRegenerateRound <= 0) {
    uni.removeStorageSync(PROFILE_AI_DRAFT_KEY)
    return
  }

  uni.setStorageSync(PROFILE_AI_DRAFT_KEY, payload)
}

function restoreAiDraftState() {
  const snapshot = readAiDraftState()
  if (!snapshot) return
  goalInput.value = snapshot.goalInput
  pendingTags.value = snapshot.pendingTags
  goalRegenerateRound.value = snapshot.goalRegenerateRound
}

function clearGoalErrorAutoHideTimer() {
  if (!goalErrorAutoHideTimer) return
  clearTimeout(goalErrorAutoHideTimer)
  goalErrorAutoHideTimer = null
}

function clearGoalError() {
  clearGoalErrorAutoHideTimer()
  goalError.value = ''
}

function setGoalError(message: string, autoHideMs = 0) {
  clearGoalErrorAutoHideTimer()
  goalError.value = message
  if (!message || autoHideMs <= 0) return

  goalErrorAutoHideTimer = setTimeout(() => {
    goalErrorAutoHideTimer = null
    if (goalError.value === message) {
      goalError.value = ''
    }
  }, autoHideMs)
}

function showGoalApiKeyRequiredError() {
  setGoalError(GOAL_API_KEY_REQUIRED_ERROR, GOAL_API_KEY_ERROR_HIDE_DURATION)
}

function clearGoalApiKeyErrorIfReady() {
  if (goalError.value !== GOAL_API_KEY_REQUIRED_ERROR) return
  const key = String(apiKeyDraft.value || '').trim()
  if (!key) return
  const snapshot = getProviderApiKeyValidation(provider.value, key)
  if (snapshot.status === 'success') {
    clearGoalError()
  }
}

function syncLegacyApiKey(key: string) {
  const clean = String(key || '').trim()
  if (clean) {
    uni.setStorageSync('api_key', clean)
    return
  }
  uni.removeStorageSync('api_key')
}

function applyApiCheckStatus(status: ApiKeyValidationStatus | 'checking', message: string) {
  clearApiCheckFeedbackTimers()

  if (status === 'unknown') {
    apiCheckUiStatus.value = 'idle'
    apiCheckMessage.value = ''
    return
  }

  if (status === 'success') {
    apiCheckUiStatus.value = 'success'
    apiCheckMessage.value = '连通成功'
  } else if (status === 'error') {
    apiCheckUiStatus.value = 'error'
    apiCheckMessage.value = message || 'Key值错误'
  } else {
    apiCheckUiStatus.value = 'checking'
    apiCheckMessage.value = ''
  }

  if (status === 'checking') {
    return
  }

  if (status === 'success') {
    apiCheckAutoHideTimer = setTimeout(() => {
      apiCheckAutoHideTimer = null
      apiCheckUiStatus.value = 'idle'
      apiCheckMessage.value = ''
    }, API_CHECK_SUCCESS_HIDE_DURATION)
  }
}

function clearApiCheckFeedbackTimers() {
  if (apiCheckAutoHideTimer) {
    clearTimeout(apiCheckAutoHideTimer)
    apiCheckAutoHideTimer = null
  }
}

function persistApiConfig() {
  const key = apiKeyDraft.value.trim()
  apiKeyDraft.value = key
  saveProviderApiKey(provider.value, key)
  saveProviderConfig(false)
  syncLegacyApiKey(key)
  savedProviderKey.value = key
  uni.$emit(API_KEY_SYNC_EVENT)
}

function flushApiKeyDraftIfNeeded() {
  const normalized = String(apiKeyDraft.value || '').trim()
  const saved = String(savedProviderKey.value || '').trim()
  if (normalized === saved) return
  apiKeyDraft.value = normalized
  persistApiConfig()
}

async function runApiKeyConnectivityCheck() {
  const key = apiKeyDraft.value.trim()
  apiKeyDraft.value = key
  persistApiConfig()

  if (!key) {
    clearProviderApiKeyValidation(provider.value)
    applyApiCheckStatus('unknown', '')
    uni.$emit(API_KEY_SYNC_EVENT)
    return false
  }

  const requestNonce = apiCheckRequestNonce.value + 1
  apiCheckRequestNonce.value = requestNonce
  applyApiCheckStatus('checking', '')

  const snapshot = await checkProviderApiKey(provider.value, key)
  if (requestNonce !== apiCheckRequestNonce.value) return false

  applyApiCheckStatus(snapshot.status, snapshot.message)
  clearGoalApiKeyErrorIfReady()
  uni.$emit(API_KEY_SYNC_EVENT)
  return snapshot.status === 'success'
}

function loadUserProfile() {
  manualAuthEnabled.value = loadManualAuthEnabled()
  backendAuthState.value = loadBackendAuthState()

  if (backendAuthState.value && !manualAuthEnabled.value) {
    const backendNickname = normalizeNickname(backendAuthState.value.nickname)
    const hasCustomizedProfile = backendNickname !== DEFAULT_NICKNAME
      || String(backendAuthState.value.avatarUrl || '').trim().length > 0
    if (hasCustomizedProfile) {
      setManualAuthEnabled(true)
    }
  }

  if (backendAuthState.value) {
    profile.value = {
      avatarUrl: backendAuthState.value.avatarUrl || '',
      nickname: backendAuthState.value.nickname || DEFAULT_NICKNAME,
    }
    return
  }

  const raw = uni.getStorageSync(USER_PROFILE_KEY)
  if (raw && typeof raw === 'object') {
    const source = raw as Partial<LocalUserProfile>
    const avatarUrl = String(source.avatarUrl || '')
    const nickname = String(source.nickname || '').trim()

    profile.value = {
      avatarUrl,
      nickname: nickname || DEFAULT_NICKNAME,
    }
    return
  }

  profile.value = {
    avatarUrl: '',
    nickname: DEFAULT_NICKNAME,
  }
}

function saveLocalUserProfile(next: LocalUserProfile) {
  profile.value = {
    avatarUrl: String(next.avatarUrl || '').trim(),
    nickname: String(next.nickname || '').trim() || DEFAULT_NICKNAME,
  }
  uni.setStorageSync(USER_PROFILE_KEY, profile.value)
}

function saveBackendAndLocalProfile(next: {
  userId: string
  nickname: string
  avatarUrl: string
  createdAt: number
  updatedAt: number
  lastLoginAt: number
}) {
  saveBackendAuthState(next)
  backendAuthState.value = loadBackendAuthState()
  saveLocalUserProfile({
    avatarUrl: next.avatarUrl || '',
    nickname: next.nickname || DEFAULT_NICKNAME,
  })
}

function normalizeNickname(raw: string): string {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 32) || DEFAULT_NICKNAME
}

function normalizeAuthAccount(raw: string): string {
  return String(raw || '').replace(/\s+/g, '').trim().slice(0, 80)
}

function isEmailAccount(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
}

function isPhoneAccount(raw: string): boolean {
  return /^\+?\d{6,20}$/.test(raw)
}

async function ensureBackendUser(profileSeed?: { nickname?: string; avatarUrl?: string }) {
  const remote = await fetchBackendProfile().catch(() => null)
  if (remote) {
    saveBackendAndLocalProfile(remote)
    return {
      user: remote,
      isNew: false,
    }
  }

  const result = await ensureBackendAccount({
    nickname: normalizeNickname(profileSeed?.nickname || profile.value.nickname),
    avatarUrl: String(profileSeed?.avatarUrl || profile.value.avatarUrl || '').trim(),
  })

  if (!result.user) {
    throw new Error('账号创建失败，请稍后重试')
  }

  saveBackendAndLocalProfile(result.user)
  return result
}

function openAuthDialog(seed?: { nickname?: string; avatarUrl?: string }) {
  if (profileAuthLoading.value || !isGuestProfile.value) return
  authDialogSeed.value = seed || null
  authDialogMode.value = 'login'
  authDialogAccountDraft.value = ''
  authDialogPasswordDraft.value = ''
  authDialogConfirmPasswordDraft.value = ''
  showAuthDialog.value = true
}

function switchToRegisterMode() {
  if (profileAuthLoading.value) return
  authDialogMode.value = 'register'
  authDialogConfirmPasswordDraft.value = ''
}

function closeAuthDialog() {
  showAuthDialog.value = false
  authDialogMode.value = 'login'
  authDialogAccountDraft.value = ''
  authDialogPasswordDraft.value = ''
  authDialogConfirmPasswordDraft.value = ''
}

function startNicknameEditing() {
  if (isGuestProfile.value || profileUpdating.value || profileAuthLoading.value) return
  profileNicknameDraft.value = normalizeNickname(profileNicknameDraft.value || profile.value.nickname)
  isNicknameEditing.value = true
  nextTick(() => {
    profileNicknameInputFocus.value = true
  })
}

function stopNicknameEditing() {
  profileNicknameInputFocus.value = false
  isNicknameEditing.value = false
}

function confirmNicknameEdit() {
  profileNicknameInputFocus.value = false
}

function resolveCredentialAuthError(error: unknown, mode: 'login' | 'register'): string {
  if (error instanceof BackendApiError && (error.statusCode === 404 || error.code === 40400)) {
    return '后端未开通登录注册接口'
  }
  if (error instanceof Error && error.message) return error.message
  return mode === 'register' ? '注册失败，请重试' : '登录失败，请重试'
}

async function performProfileAuth(
  profileSeed?: { nickname?: string; avatarUrl?: string },
  credentialPayload?: {
    mode: 'login' | 'register'
    account: string
    password: string
  },
) {
  if (profileAuthLoading.value) return null
  profileAuthLoading.value = true
  showAuthDialog.value = false
  try {
    const nicknameSeed = normalizeNickname(profileSeed?.nickname || profile.value.nickname)
    const avatarSeed = String(profileSeed?.avatarUrl || profile.value.avatarUrl || '').trim()
    let result: { user: BackendUserProfile | null; isNew: boolean }
    if (credentialPayload) {
      const account = credentialPayload.account
      const password = credentialPayload.password
      const actionLabel = credentialPayload.mode === 'register' ? '注册' : '登录'
      const authResult = credentialPayload.mode === 'register'
        ? await registerWithCredential({
            account,
            password,
            nickname: nicknameSeed,
            avatarUrl: avatarSeed,
          })
        : await loginWithCredential({
            account,
            password,
          })

      if (!authResult.user) {
        throw new Error(actionLabel === '注册' ? '注册失败，请稍后重试' : '登录失败，请稍后重试')
      }
      saveBackendAndLocalProfile(authResult.user)
      result = {
        user: authResult.user,
        isNew: actionLabel === '注册' ? true : Boolean(authResult.isNew),
      }
    } else {
      result = await ensureBackendUser({
        nickname: nicknameSeed,
        avatarUrl: avatarSeed,
      })
    }

    setManualAuthEnabled(true)
    profileNicknameDraft.value = normalizeNickname(loadBackendAuthState()?.nickname || result.user?.nickname || nicknameSeed)
    uni.showToast({
      title: credentialPayload ? (credentialPayload.mode === 'register' ? '注册成功' : '登录成功') : (result.isNew ? '账号已可用' : '账号已连接'),
      icon: 'success',
    })
    return result
  } catch (error) {
    if (credentialPayload) {
      showAuthDialog.value = true
    }
    const message = credentialPayload
      ? resolveCredentialAuthError(error, credentialPayload.mode)
      : (error instanceof Error ? error.message : '登录失败')
    uni.showToast({
      title: message.length > 15 ? '登录失败，请重试' : message,
      icon: 'none',
    })
    return null
  } finally {
    profileAuthLoading.value = false
  }
}

async function confirmAuthDialog() {
  const account = normalizeAuthAccount(authDialogAccountDraft.value)
  if (!account) {
    uni.showToast({
      title: '请输入手机号或邮箱',
      icon: 'none',
    })
    return
  }
  if (!isEmailAccount(account) && !isPhoneAccount(account)) {
    uni.showToast({
      title: '账号格式不正确',
      icon: 'none',
    })
    return
  }
  const password = String(authDialogPasswordDraft.value || '').trim()
  if (!password) {
    uni.showToast({
      title: '请输入密码',
      icon: 'none',
    })
    return
  }
  if (password.length < 6) {
    uni.showToast({
      title: '密码至少 6 位',
      icon: 'none',
    })
    return
  }
  if (authDialogMode.value === 'register') {
    const confirmPassword = String(authDialogConfirmPasswordDraft.value || '').trim()
    if (!confirmPassword) {
      uni.showToast({
        title: '请再次输入密码',
        icon: 'none',
      })
      return
    }
    if (confirmPassword !== password) {
      uni.showToast({
        title: '两次密码不一致',
        icon: 'none',
      })
      return
    }
  }

  const seed = authDialogSeed.value || {}
  await performProfileAuth({
    ...seed,
    nickname: normalizeNickname(seed.nickname || profile.value.nickname),
  }, {
    mode: authDialogMode.value,
    account,
    password,
  })
  authDialogSeed.value = null
  authDialogMode.value = 'login'
  authDialogAccountDraft.value = ''
  authDialogPasswordDraft.value = ''
  authDialogConfirmPasswordDraft.value = ''
}

async function chooseAvatarImage(): Promise<string> {
  const result = await uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
  })
  const filePath = String(result.tempFilePaths?.[0] || '').trim()
  if (!filePath) {
    throw new Error('未选择头像图片')
  }
  return filePath
}

async function uploadAvatarToBackend(localPath: string, userKey: string) {
  const safeUserKey = String(userKey || '').trim()
  if (!safeUserKey) {
    throw new Error('未获取到账号信息，无法上传头像')
  }

  const url = await uploadAvatarFile(localPath)
  if (!url) {
    throw new Error('头像上传失败，请重试')
  }
  return url
}

async function refreshBackendProfile() {
  try {
    const remote = await fetchBackendProfile()
    if (!remote) return
    saveBackendAndLocalProfile(remote)
    profileNicknameDraft.value = remote.nickname || DEFAULT_NICKNAME
  } catch {
    // keep local fallback
  }
}

function getGuideGlobalData(): AppGuideGlobalData {
  const app = getApp<{ globalData?: AppGuideGlobalData }>()
  if (!app.globalData) {
    app.globalData = {}
  }
  return app.globalData
}

function markTagGuideDismissed() {
  const globalData = getGuideGlobalData()
  globalData.hasDismissedTagGuide = true
  uni.setStorageSync(TAG_GUIDE_DISMISSED_KEY, 1)
}

function clearGuideHighlightTimer() {
  if (!guideHighlightTimer) return
  clearTimeout(guideHighlightTimer)
  guideHighlightTimer = null
}

function clearApiGuideHighlightTimer() {
  if (!apiGuideHighlightTimer) return
  clearTimeout(apiGuideHighlightTimer)
  apiGuideHighlightTimer = null
}

function stopGuideHighlight() {
  clearGuideHighlightTimer()
  guideGenerateHighlight.value = false
}

function startGuideHighlight() {
  clearGuideHighlightTimer()
  guideGenerateHighlight.value = true
  guideHighlightTimer = setTimeout(() => {
    guideHighlightTimer = null
    guideGenerateHighlight.value = false
  }, GUIDE_HIGHLIGHT_DURATION)
}

function startApiGuideHighlight() {
  clearApiGuideHighlightTimer()
  apiGuideHighlight.value = true
  apiGuideHighlightTimer = setTimeout(() => {
    apiGuideHighlightTimer = null
    apiGuideHighlight.value = false
  }, API_GUIDE_HIGHLIGHT_DURATION)
}

function consumeGuideEntryState() {
  const globalData = getGuideGlobalData()
  if (!globalData.isFromGuide) return
  globalData.isFromGuide = false
  startGuideHighlight()
}

function consumeApiGuideEntryState() {
  const globalData = getGuideGlobalData()
  if (!globalData.isFromApiGuide) return
  globalData.isFromApiGuide = false
  startApiGuideHighlight()
}

function resolveFixedHeaderFallbackHeight(topPx: number): number {
  try {
    const system = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null
    const width = Number(system?.windowWidth || system?.screenWidth || 375)
    const headerPx = (136 * width) / 750
    return Math.round(topPx + headerPx)
  } catch {
    return Math.round(topPx + 68)
  }
}

function syncFixedHeaderHeight() {
  const fallbackHeight = resolveFixedHeaderFallbackHeight(safeTopPx.value)
  nextTick(() => {
    const query = uni.createSelectorQuery()
    query.select('.profile-fixed-shell').boundingClientRect((rect) => {
      const node = Array.isArray(rect) ? rect[0] : rect
      const measuredHeight = Math.round(Number(node?.height || 0))
      fixedHeaderHeightPx.value = measuredHeight > 0 ? measuredHeight : fallbackHeight
    })
    query.exec()
  })
}

onShow(() => {
  stopNicknameEditing()
  safeTopPx.value = resolveStatusBarTopPadding()
  syncFixedHeaderHeight()
  loadConfig()
  loadUserProfile()
  profileNicknameDraft.value = isGuestProfile.value ? '' : normalizeNickname(profile.value.nickname)
  restoreAiDraftState()
  activeTags.value = loadUserTags()
  consumeGuideEntryState()
  consumeApiGuideEntryState()
  clearGoalApiKeyErrorIfReady()
  void hydrateProviderOptions()
  refreshBackendProfile()
  hydrateProfileDataFromBackend()
})

onHide(() => {
  flushApiKeyDraftIfNeeded()
  persistAiDraftState()
})

onUnload(() => {
  flushApiKeyDraftIfNeeded()
  persistAiDraftState()
  goalRequestNonce.value += 1
  goalLoading.value = false
  clearGoalErrorAutoHideTimer()
  profileUpdating.value = false
  apiCheckRequestNonce.value += 1
  clearApiCheckFeedbackTimers()
  applyApiCheckStatus('unknown', '')
  clearGuideHighlightTimer()
  clearApiGuideHighlightTimer()
})

watch(apiKeyDraft, (next, prev) => {
  if (next === prev) return
  if (apiCheckUiStatus.value === 'checking') return
  if (!String(next || '').trim()) {
    applyApiCheckStatus('unknown', '')
    return
  }
  if (apiCheckUiStatus.value === 'success') {
    applyApiCheckStatus('unknown', '')
  }
  clearGoalApiKeyErrorIfReady()
})

watch(provider, () => {
  clearGoalApiKeyErrorIfReady()
})

watch([goalInput, pendingTags, goalRegenerateRound], () => {
  persistAiDraftState()
}, { deep: true })

async function hydrateProfileDataFromBackend() {
  const [llmHydrated, tagsHydrated] = await Promise.all([
    hydrateLlmConfigFromBackend(),
    hydrateUserTagsFromBackend(),
  ])

  if (llmHydrated) {
    loadConfig()
  }
  if (tagsHydrated) {
    activeTags.value = loadUserTags()
  }
}

async function hydrateProviderOptions() {
  const options = await hydrateLlmProviderOptions().catch(() => LLM_PROVIDER_OPTIONS)
  providerOptions.value = options
}

async function handleProfileCardTap() {
  if (!isGuestProfile.value || profileAuthLoading.value || profileUpdating.value) return
  openAuthDialog({
    nickname: normalizeNickname(profileNicknameDraft.value || profile.value.nickname),
    avatarUrl: profile.value.avatarUrl,
  })
  return
}

function handleProfileNameTap() {
  if (!isGuestProfile.value || profileAuthLoading.value || profileUpdating.value) return
  openAuthDialog({
    nickname: normalizeNickname(profileNicknameDraft.value || profile.value.nickname),
    avatarUrl: profile.value.avatarUrl,
  })
}

async function handleAvatarChosen(localAvatarPath: string) {
  if (!localAvatarPath || profileUpdating.value || profileAuthLoading.value) return

  profileUpdating.value = true
  try {
    const account = await ensureBackendUser({
      nickname: normalizeNickname(profileNicknameDraft.value || profile.value.nickname),
      avatarUrl: profile.value.avatarUrl,
    })
    if (!account.user) {
      throw new Error('请先启用账号')
    }

    const userKey = String(account.user.userId || '').trim()
    const avatarUrl = await uploadAvatarToBackend(localAvatarPath, userKey)

    const updated = await updateBackendProfileByPayload({
      nickname: normalizeNickname(profileNicknameDraft.value || account.user.nickname),
      avatarUrl,
    })
    if (!updated.user) {
      throw new Error('资料更新失败，请重试')
    }

    saveBackendAndLocalProfile(updated.user)
    profileNicknameDraft.value = updated.user.nickname || DEFAULT_NICKNAME

    uni.showToast({
      title: '资料已同步',
      icon: 'success',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '资料更新失败，请重试'
    uni.showToast({
      title: message.length > 15 ? '资料更新失败，请重试' : message,
      icon: 'none',
    })
  } finally {
    profileUpdating.value = false
  }
}

async function handleAvatarTrigger() {
  if (profileUpdating.value || profileAuthLoading.value) return
  if (isGuestProfile.value) {
    openAuthDialog({
      nickname: normalizeNickname(profileNicknameDraft.value || profile.value.nickname),
      avatarUrl: profile.value.avatarUrl,
    })
    return
  }

  try {
    const localAvatarPath = await chooseAvatarImage()
    await handleAvatarChosen(localAvatarPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message || /cancel/i.test(message)) return
    uni.showToast({
      title: message.length > 15 ? '头像选择失败，请重试' : message,
      icon: 'none',
    })
  }
}

async function handleNicknameFocus() {
  if (profileUpdating.value || profileAuthLoading.value) return
  if (!isGuestProfile.value) return
  openAuthDialog({
    nickname: normalizeNickname(profileNicknameDraft.value || profile.value.nickname),
    avatarUrl: profile.value.avatarUrl,
  })
}

async function handleNicknameBlur() {
  if (profileUpdating.value || profileAuthLoading.value) return

  if (isGuestProfile.value) {
    profileNicknameDraft.value = String(profileNicknameDraft.value || '').replace(/\s+/g, ' ').trim().slice(0, 32)
    stopNicknameEditing()
    return
  }

  const nickname = normalizeNickname(profileNicknameDraft.value)
  profileNicknameDraft.value = nickname
  if (nickname === normalizeNickname(profile.value.nickname)) {
    stopNicknameEditing()
    return
  }

  profileUpdating.value = true

  try {
    const updated = await updateBackendProfileByPayload({
      nickname,
      avatarUrl: profile.value.avatarUrl,
    })

    if (!updated.user) {
      throw new Error('资料更新失败，请重试')
    }

    saveBackendAndLocalProfile(updated.user)
    profileNicknameDraft.value = updated.user.nickname || DEFAULT_NICKNAME

    uni.showToast({
      title: '资料已同步',
      icon: 'success',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '资料更新失败，请重试'
    uni.showToast({
      title: message.length > 15 ? '资料更新失败，请重试' : message,
      icon: 'none',
    })
  } finally {
    profileUpdating.value = false
    stopNicknameEditing()
  }
}

async function handleLogout() {
  if (profileUpdating.value || profileAuthLoading.value || isGuestProfile.value) return

  const modal = await uni.showModal({
    title: '退出登录',
    content: '确认退出当前账号？退出后将回到游客模式。',
    confirmText: '退出',
    confirmColor: '#D64545',
    cancelText: '取消',
  })
  if (!modal.confirm) return

  clearBackendAuthState()
  setManualAuthEnabled(false)
  backendAuthState.value = null
  authDialogSeed.value = null
  showAuthDialog.value = false
  saveLocalUserProfile({
    avatarUrl: '',
    nickname: DEFAULT_NICKNAME,
  })
  profileNicknameDraft.value = ''
  stopNicknameEditing()

  uni.showToast({
    title: '已退出登录',
    icon: 'none',
  })
}

function saveProviderConfig(showToast = false) {
  const preset = getProviderPreset(provider.value)
  const providerKey = getProviderApiKey(provider.value)

  saveLlmConfig({
    provider: provider.value,
    apiKey: providerKey,
    baseUrl: preset.baseUrl,
    model: preset.model,
  })

  if (showToast) {
    uni.showToast({
      title: `已切换到${preset.label}`,
      icon: 'success',
    })
  }
}

function onProviderChange(event: { detail?: { value?: string | number } }) {
  const index = Number(event?.detail?.value)
  if (!Number.isFinite(index)) return
  const item = providerOptions.value[index]
  if (!item) return

  apiCheckRequestNonce.value += 1
  clearApiCheckFeedbackTimers()
  provider.value = item.value
  apiKeyDraft.value = String(getProviderApiKey(item.value) || '').trim()
  savedProviderKey.value = apiKeyDraft.value
  persistApiConfig()
  applyApiCheckStatus('unknown', '')
}

function toggleApiKeyVisibility() {
  isApiKeyVisible.value = !isApiKeyVisible.value
}

function handleApiKeyFocus() {
  apiKeyInputFocused.value = true
}

function handleApiKeyBlur() {
  apiKeyInputFocused.value = false
  if (apiCheckUiStatus.value === 'checking') return
  void runApiKeyConnectivityCheck()
}

function handleApiKeyConfirm() {
  apiKeyInputFocused.value = false
  if (apiCheckUiStatus.value === 'checking') return
  void runApiKeyConnectivityCheck()
}

function handleManualCheckApiKey() {
  if (apiCheckUiStatus.value === 'checking') return
  void runApiKeyConnectivityCheck()
}

function handleClearApiKey() {
  apiKeyDraft.value = ''
  apiKeyInputFocused.value = false
  uni.hideKeyboard?.()
  apiCheckRequestNonce.value += 1
  clearProviderApiKeyValidation(provider.value)
  persistApiConfig()
  applyApiCheckStatus('unknown', '')

  uni.showToast({
    title: '配置已清除',
    icon: 'none',
  })
}

function clearGoalInput() {
  goalInput.value = ''
  clearGoalError()
  pendingTags.value = []
  goalRegenerateRound.value = 0

  const wxApi = (
    globalThis as {
      wx?: {
        vibrateShort?: (options?: { type?: 'light' | 'medium' | 'heavy'; fail?: () => void }) => void
      }
    }
  ).wx

  if (wxApi?.vibrateShort) {
    wxApi.vibrateShort({
      type: 'light',
      fail: () => {},
    })
    return
  }

  uni.vibrateShort?.({
    type: 'light',
    fail: () => {},
  })
}

function toggleTagCollapse() {
  isTagCollapsed.value = !isTagCollapsed.value
}

function normalizeTag(tag: unknown): string {
  return String(tag || '').replace(/\s+/g, ' ').trim().slice(0, 12)
}

function normalizeTagSignature(tag: unknown): string {
  const clean = normalizeTag(tag)
  if (!clean) return ''
  const stripped = clean.replace(TAG_SIGNATURE_STRIP_PATTERN, '').toLowerCase()
  return stripped || clean.toLowerCase()
}

function uniqueTagList(tags: unknown[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  tags.forEach((item) => {
    const clean = normalizeTag(item)
    if (!clean) return
    const signature = normalizeTagSignature(clean)
    if (seen.has(signature)) return
    seen.add(signature)
    output.push(clean)
  })

  return output.slice(0, MAX_TAG_COUNT)
}

function isSameTagSet(a: string[], b: string[]): boolean {
  const aSig = uniqueTagList(a).map((item) => normalizeTagSignature(item)).sort().join('|')
  const bSig = uniqueTagList(b).map((item) => normalizeTagSignature(item)).sort().join('|')
  return !!aSig && aSig === bSig
}

function hasTagBySignature(tags: string[], target: unknown): boolean {
  const signature = normalizeTagSignature(target)
  if (!signature) return false
  return tags.some((item) => normalizeTagSignature(item) === signature)
}

function mergeTagLists(baseTags: string[], incomingTags: string[]): string[] {
  const merged = uniqueTagList(baseTags)
  incomingTags.forEach((item) => {
    const clean = normalizeTag(item)
    if (!clean) return
    if (hasTagBySignature(merged, clean)) return
    if (merged.length >= MAX_TAG_COUNT) return
    merged.push(clean)
  })
  return uniqueTagList(merged)
}

function buildGoalFallbackPool(goal: string, excludedTags: string[], regenerateRound: number): string[] {
  const excluded = new Set(uniqueTagList(excludedTags).map((item) => item.toLowerCase()))
  const compactGoal = normalizeTag(String(goal || '').replace(/[\s，,。；;：:、|]/g, ''))
  const domain = compactGoal && compactGoal.length <= 8 ? compactGoal : ''

  const pool = uniqueTagList([
    ...(domain
      ? [
          `${domain}基础`,
          `${domain}进阶`,
          `${domain}实战`,
          `${domain}案例`,
          `${domain}方法`,
        ]
      : []),
    '核心概念',
    '高频考点',
    '方法论',
    '场景应用',
    '指标分析',
    '实战案例',
    '常见误区',
    '项目实操',
    '进阶训练',
    '面试高频',
  ]).filter((item) => !excluded.has(item.toLowerCase()))

  if (pool.length <= 1) return pool

  const step = Math.max(0, regenerateRound) % pool.length
  return [...pool.slice(step), ...pool.slice(0, step)]
}

function ensureRegeneratedTags(candidateTags: string[], previousTags: string[], goal: string, regenerateRound: number): string[] {
  const previous = uniqueTagList(previousTags)
  const previousSet = new Set(previous.map((item) => item.toLowerCase()))
  const candidate = uniqueTagList(candidateTags)
  const different = candidate.filter((item) => !previousSet.has(item.toLowerCase()))
  const targetCount = Math.max(4, Math.min(MAX_TAG_COUNT, Math.max(previous.length, 5)))
  const minDifferent = Math.min(TAG_REGENERATE_MIN_DIFFERENT, Math.max(1, previous.length))

  const next = uniqueTagList(different)
  if (next.length < targetCount || next.length < minDifferent) {
    const fallbackPool = buildGoalFallbackPool(goal, [...previous, ...next], regenerateRound)
    fallbackPool.forEach((item) => {
      if (next.length >= targetCount) return
      if (!next.some((tag) => tag.toLowerCase() === item.toLowerCase())) {
        next.push(item)
      }
    })
  }

  if (next.length === 0) {
    return buildGoalFallbackPool(goal, previous, regenerateRound).slice(0, Math.max(4, minDifferent))
  }

  if (isSameTagSet(next, previous)) {
    const fallbackPool = buildGoalFallbackPool(goal, [...previous, ...next], regenerateRound + 1)
    if (fallbackPool.length > 0) {
      const replaced = [...next.slice(0, Math.max(0, next.length - 1)), fallbackPool[0]]
      return uniqueTagList(replaced)
    }
  }

  return uniqueTagList(next)
}

function parseTagResult(raw: string): string[] {
  const text = String(raw || '').trim()
  if (!text) return []

  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const objectMatch = clean.match(/\{[\s\S]*\}/)
  const tryJson = objectMatch ? objectMatch[0] : clean

  try {
    const parsed = JSON.parse(tryJson) as { tags?: unknown }
    if (Array.isArray(parsed?.tags)) {
      return uniqueTagList(parsed.tags)
    }
  } catch {
    // fallback to plain-text parsing
  }

  return uniqueTagList(
    clean
    .split(/[,\n，、|]/g)
      .map((item) => normalizeTag(item)),
  )
}

function parseLooseJson(raw: string): unknown {
  let clean = String(raw || '').trim()
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    return JSON.parse(clean)
  } catch {
    const objectMatch = clean.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      return JSON.parse(objectMatch[0])
    }
    const arrayMatch = clean.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0])
    }
  }

  throw new Error('模型返回格式不可解析')
}

function pickAllowedTag(rawTag: unknown, allowedTags: string[]): string {
  const clean = normalizeTag(rawTag)
  if (!clean || allowedTags.length === 0) return ''

  const exact = allowedTags.find((item) => item.toLowerCase() === clean.toLowerCase())
  if (exact) return exact

  const fuzzy = allowedTags.find((item) => {
    const a = item.toLowerCase()
    const b = clean.toLowerCase()
    return a.includes(b) || b.includes(a)
  })
  return fuzzy || ''
}

function parseRetagResult(raw: string, allowedTags: string[]): Record<string, string> {
  const parsed = parseLooseJson(raw) as
    | { items?: Array<{ id?: unknown; tag?: unknown }>; results?: Array<{ id?: unknown; tag?: unknown }> }
    | Array<{ id?: unknown; tag?: unknown }>

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed?.results)
        ? parsed.results
        : []

  const output: Record<string, string> = {}
  list.forEach((item) => {
    const id = String(item?.id || '').trim()
    const tag = pickAllowedTag(item?.tag, allowedTags)
    if (!id || !tag) return
    output[id] = tag
  })

  return output
}

function chunkQuestions(list: StoredQuestion[], size: number): StoredQuestion[][] {
  if (size <= 0) return [list]
  const output: StoredQuestion[][] = []
  for (let i = 0; i < list.length; i += size) {
    output.push(list.slice(i, i + size))
  }
  return output
}

function isGeneralTag(rawTag: unknown): boolean {
  const tag = normalizeTag(rawTag)
  return !tag || tag === '综合' || tag === '通用' || tag === '其他'
}

async function classifyQuestionBatch(batch: StoredQuestion[], allowedTags: string[]): Promise<Record<string, string>> {
  const compactQuestions = batch.map((q) => ({
    id: q.id,
    stem: String(q.stem || '').replace(/^\s*题目\s*[:：]\s*/, '').trim().slice(0, 120),
    options: (q.options || [])
      .map((opt) => `${String(opt.key || '').trim()}. ${String(opt.text || '').trim()}`)
      .join(' | ')
      .slice(0, 180),
  }))

  const systemPrompt = [
    '你是题目分类助手。',
    '请仅根据题目内容，为每道题从给定标签中选择一个最匹配标签。',
    '只返回 JSON：{"items":[{"id":"题目id","tag":"标签"}]}。',
    `tag 必须严格来自 allowed_tags：${JSON.stringify(allowedTags)}。`,
    '禁止输出额外解释。',
  ].join(' ')

  const userPrompt = [
    `allowed_tags: ${JSON.stringify(allowedTags)}`,
    `questions: ${JSON.stringify(compactQuestions)}`,
  ].join('\n\n')

  const content = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ])

  return parseRetagResult(content, allowedTags)
}

function buildQuestionSearchText(question: StoredQuestion): string {
  const stem = String(question.stem || '').replace(/^\s*题目\s*[:：]\s*/, '').trim()
  const optionText = (question.options || [])
    .map((opt) => String(opt.text || '').trim())
    .filter(Boolean)
    .join(' ')
  return `${stem} ${optionText}`.toLowerCase()
}

function scoreTagByContent(content: string, tag: string): number {
  const normalizedTag = normalizeTag(tag).toLowerCase()
  if (!normalizedTag) return 0

  let score = 0
  if (content.includes(normalizedTag)) {
    score += normalizedTag.length * 3
  }

  const tokenList = normalizedTag.split(/[\s/、，,._-]+/g).filter(Boolean)
  tokenList.forEach((token) => {
    if (token && content.includes(token)) {
      score += token.length
    }
  })

  return score
}

function fallbackTagForQuestion(question: StoredQuestion, allowedTags: string[], index: number): string {
  if (allowedTags.length === 0) return ''

  const content = buildQuestionSearchText(question)
  let bestTag = ''
  let bestIndex = 0
  let bestScore = -1

  allowedTags.forEach((tag, tagIndex) => {
    const score = scoreTagByContent(content, tag)
    if (score > bestScore) {
      bestScore = score
      bestTag = tag
      bestIndex = tagIndex
      return
    }

    if (score === bestScore && score > 0 && tagIndex < bestIndex) {
      bestTag = tag
      bestIndex = tagIndex
    }
  })

  if (bestTag) return bestTag
  return allowedTags[index % allowedTags.length]
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('RETAG_TIMEOUT'))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function retagHistoricalQuestions(selectedTags: string[]): Promise<number> {
  const remoteSummary = await retagHistoricalQuestionsInBackend(selectedTags, true).catch(() => null)
  if (remoteSummary) {
    return Math.max(0, Number(remoteSummary.updatedCount || 0))
  }

  try {
    const summary = await withTimeout(
      retagQuestionBankByTags(selectedTags, { force: true, useAi: true }),
      RETAG_APPLY_TIMEOUT_MS,
    )
    return summary.updatedCount
  } catch {
    const fallbackSummary = await retagQuestionBankByTags(selectedTags, { force: true, useAi: false })
    return fallbackSummary.updatedCount
  }
}

async function requestGoalTagCandidates(
  goal: string,
  options: {
    regenerate: boolean
    previousTags: string[]
    regenerateRound: number
    strictDifferent: boolean
  },
): Promise<string[]> {
  const { regenerate, previousTags, regenerateRound, strictDifferent } = options
  if (!regenerate) {
    const remoteTags = await generateTagsInBackend(goal).catch(() => null)
    if (remoteTags && remoteTags.length > 0) {
      return uniqueTagList(remoteTags)
    }
  }

  const minDifferent = Math.min(TAG_REGENERATE_MIN_DIFFERENT, Math.max(1, previousTags.length))
  const systemPrompt = [
    '你是学习规划助手。',
    '请根据用户学习目标输出 5-7 个核心知识标签。',
    '只输出 JSON：{"tags":["标签1","标签2"]}。',
    '标签要短、可用于题目分类，并且避免重复。',
    regenerate
      ? strictDifferent
        ? `这是“重新生成”请求，禁止输出 previous_tags 中的任意标签：${JSON.stringify(previousTags)}。`
        : `这是“重新生成”请求，请换一个角度输出标签，至少 ${minDifferent} 个标签不能与 previous_tags 重复。`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const userPrompt = [
    `学习目标：${goal}`,
    regenerate ? `previous_tags：${JSON.stringify(previousTags)}` : '',
    regenerate ? `regenerate_round：${regenerateRound}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const content = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    undefined,
    {
      maxOutputTokens: 720,
      temperature: regenerate ? 0.95 : 0.55,
    },
  )

  return parseTagResult(content)
}

async function generateGoalTags(options?: GenerateGoalTagsOptions | Event) {
  const normalizedOptions = isGenerateGoalTagsOptions(options) ? options : {}
  if (goalLoading.value) return
  markTagGuideDismissed()
  stopGuideHighlight()
  clearGoalError()
  const previousTags = uniqueTagList(normalizedOptions.previousTags || pendingTags.value.map((item) => item.name))
  const isRegenerate = Boolean(normalizedOptions.regenerate) && previousTags.length > 0
  const regenerateRound = Number(normalizedOptions.regenerateRound || 0)
  if (!isRegenerate) {
    goalRegenerateRound.value = 0
  }
  pendingTags.value = []
  const requestNonce = goalRequestNonce.value + 1
  goalRequestNonce.value = requestNonce

  const goal = goalInput.value.trim()
  if (!goal) {
    setGoalError('请先输入学习目标', GOAL_API_KEY_ERROR_HIDE_DURATION)
    return
  }

  const config = loadLlmConfig()
  if (!config.apiKey.trim()) {
    showGoalApiKeyRequiredError()
    return
  }

  const validation = getProviderApiKeyValidation(config.provider, config.apiKey.trim())
  if (validation.status !== 'success') {
    const isConnected = await runApiKeyConnectivityCheck()
    if (!isConnected) {
      showGoalApiKeyRequiredError()
      return
    }
  } else {
    clearGoalApiKeyErrorIfReady()
  }

  if (!String(apiKeyDraft.value || '').trim()) {
    showGoalApiKeyRequiredError()
    return
  }

  goalLoading.value = true
  try {
    let tags = await requestGoalTagCandidates(goal, {
      regenerate: isRegenerate,
      previousTags,
      regenerateRound,
      strictDifferent: false,
    })
    if (requestNonce !== goalRequestNonce.value) return

    if (isRegenerate && (tags.length === 0 || isSameTagSet(tags, previousTags))) {
      tags = await requestGoalTagCandidates(goal, {
        regenerate: true,
        previousTags,
        regenerateRound,
        strictDifferent: true,
      })
      if (requestNonce !== goalRequestNonce.value) return
    }

    if (isRegenerate) {
      tags = ensureRegeneratedTags(tags, previousTags, goal, regenerateRound)
    } else {
      tags = uniqueTagList(tags)
    }

    if (tags.length === 0) {
      setGoalError('标签生成失败，请重试')
      return
    }

    if (isRegenerate && isSameTagSet(tags, previousTags)) {
      uni.showToast({
        title: '已尽量生成新标签，可补充目标词后再试',
        icon: 'none',
      })
    }

    pendingTags.value = tags.map((tag) => ({ name: tag, selected: true }))
  } catch (error) {
    if (requestNonce !== goalRequestNonce.value) return
    setGoalError(error instanceof Error ? error.message : '标签生成失败，请重试')
  } finally {
    if (requestNonce !== goalRequestNonce.value) return
    goalLoading.value = false
  }
}

function togglePendingTag(tag: string) {
  pendingTags.value = pendingTags.value.map((item) => {
    if (item.name !== tag) return item
    return {
      ...item,
      selected: !item.selected,
    }
  })
}

async function acceptSuggestedTags() {
  if (retagLoading.value) return
  if (pendingTags.value.length === 0) return
  markTagGuideDismissed()

  const selectedTags = pendingTags.value
    .filter((item) => item.selected)
    .map((item) => item.name)

  if (selectedTags.length === 0) {
    uni.showToast({
      title: '请至少选择 1 个标签',
      icon: 'none',
    })
    return
  }

  const currentActiveTags = loadUserTags()
  const mergedActiveTags = mergeTagLists(currentActiveTags, selectedTags)
  pendingTags.value = []
  if (mergedActiveTags.length === currentActiveTags.length) {
    activeTags.value = currentActiveTags
    uni.showToast({
      title: '该分类已在列表中',
      icon: 'none',
    })
    return
  }

  retagLoading.value = true
  const loadingGuardTimer = setTimeout(() => {
    retagLoading.value = false
  }, RETAG_APPLY_TIMEOUT_MS + 3000)
  try {
    activeTags.value = saveUserTags(mergedActiveTags)
    const retaggedCount = await retagHistoricalQuestions(mergedActiveTags)
    uni.$emit(USER_TAGS_CHANGED_EVENT)
    isTagCollapsed.value = false
    uni.showToast({
      title: retaggedCount > 0 ? `已生效，回溯归类 ${retaggedCount} 题` : '标签方案已生效',
      icon: 'success',
    })
  } catch {
    uni.showToast({
      title: '标签已生效，历史归类失败',
      icon: 'none',
    })
  } finally {
    clearTimeout(loadingGuardTimer)
    retagLoading.value = false
  }
}

async function regenerateSuggestedTags() {
  if (goalLoading.value || retagLoading.value) return
  const previousTags = uniqueTagList(pendingTags.value.map((item) => item.name))
  goalRegenerateRound.value += 1
  await generateGoalTags({
    regenerate: true,
    previousTags,
    regenerateRound: goalRegenerateRound.value,
  })
}

function cancelGoalGeneration() {
  if (!goalLoading.value) return
  goalRequestNonce.value += 1
  goalLoading.value = false
  clearGoalError()
  pendingTags.value = []
  abortAllLlmRequests()
}

function cancelSuggestedTags() {
  if (goalLoading.value || retagLoading.value) return
  clearGoalError()
  pendingTags.value = []
}

function removeActiveTag(tag: string) {
  activeTags.value = removeUserTag(tag)
}

function addCustomTag() {
  const nextTag = normalizeTag(customTagInput.value)
  if (!nextTag) return

  const pendingNames = pendingTags.value.map((item) => item.name)
  if (hasTagBySignature(activeTags.value, nextTag) || hasTagBySignature(pendingNames, nextTag)) {
    uni.showToast({
      title: '该分类已在列表中',
      icon: 'none',
    })
    return
  }

  if (activeTags.value.length >= MAX_TAG_COUNT) {
    uni.showToast({
      title: `最多保留 ${MAX_TAG_COUNT} 个标签`,
      icon: 'none',
    })
    return
  }

  activeTags.value = addUserTag(nextTag)
  customTagInput.value = ''
}

function onProfileTitleDecoError() {
  if (profileTitleDecoIndex.value >= profileTitleDecoCandidates.length - 1) return
  profileTitleDecoIndex.value += 1
}

</script>

<style scoped>
.page-root {
  min-height: 100vh;
  height: 100vh;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  overflow: hidden;
  position: relative;
  background: #F8F8F8;
  color: #1A1A1A;
  font-family: 'MiSans', 'PingFang SC', -apple-system, 'SF Pro Text', sans-serif;
  --oa-card-radius: 8rpx;
}

.profile-fixed-shell {
  position: fixed;
  top: 0;
  left: 50%;
  right: auto;
  width: 100%;
  max-width: 600px;
  transform: translateX(-50%);
  z-index: 60;
  background: #FFFFFF;
}

.page-scroll {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  height: 100vh;
  min-height: 0;
  box-sizing: border-box;
  padding-bottom: calc(env(safe-area-inset-bottom) + 112rpx);
}

.page-root :deep(.oa-tab-wrap) {
  left: 50%;
  right: auto;
  width: 100%;
  max-width: 600px;
  transform: translateX(-50%);
}

.page-body {
  padding: 0 40rpx 20rpx;
}

.title-header {
  width: 100%;
  margin-left: 0;
  min-height: 136rpx;
  border-bottom: 1rpx solid #E8EAED;
  background: #FFFFFF;
  padding: 0 40rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.title-wrap {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  position: relative;
  width: 100%;
  min-height: 136rpx;
  padding-right: 220rpx;
  padding-bottom: 0;
}

.page-title {
  display: block;
  font-family: 'MiSans', 'PingFang SC', -apple-system, 'SF Pro Text', sans-serif;
  font-size: 40rpx;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0;
  text-align: left;
}

.page-title-slogan {
  /* Brand-consistent green spectrum */
  background-image: linear-gradient(90deg, #07C160 0%, #80C924 46%, #3FDF7C 100%);
  background-repeat: no-repeat;
  background-size: 100% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: #07C160;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 2rpx 4rpx rgba(7, 193, 96, 0.16);
}

.title-deco-image {
  position: absolute;
  right: 146rpx;
  top: 50%;
  transform: translateY(-50%) scale(1.2);
  width: 240rpx;
  height: 144rpx;
  margin-left: 0;
  flex: 0 0 240rpx;
  opacity: 0.92;
  will-change: transform;
}

.page-subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #70757A;
  text-align: left;
}

.profile-panel {
  margin-top: 48rpx;
  padding: 32rpx;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start;
  gap: 24rpx;
}

.profile-panel.is-clickable {
  cursor: pointer;
}

.avatar-btn {
  width: 108rpx !important;
  height: 108rpx !important;
  min-height: 108rpx !important;
  flex: 0 0 108rpx !important;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-btn::after {
  border: 0;
}

.avatar-wrap {
  position: relative !important;
  width: 100rpx !important;
  height: 100rpx !important;
  border: 1rpx solid #F2F2F2;
  border-radius: 50% !important;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden !important;
}

.avatar-image {
  width: 96rpx !important;
  height: 96rpx !important;
  border-radius: 50% !important;
}

.avatar-badge {
  position: absolute;
  right: -6rpx;
  bottom: -6rpx;
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  border: 2rpx solid #ffffff;
  background: #07C160;
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-fallback {
  font-size: 52rpx;
  line-height: 1;
  font-weight: 600;
  color: #3C4043;
}

.profile-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8rpx;
}

.profile-name-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10rpx;
}

.profile-login-title {
  font-size: 34rpx;
  line-height: 1.2;
  font-weight: 600;
  color: #1A1A1A;
}

.profile-nickname-input {
  min-width: 0;
  flex: 1;
  height: 44rpx;
  min-height: 44rpx;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: 'MiSans', 'PingFang SC', -apple-system, 'SF Pro Text', sans-serif;
  font-size: 32rpx;
  line-height: 44rpx;
  font-weight: 500;
  color: #1A1A1A;
}

.profile-nickname-display {
  min-width: 0;
  display: flex;
  align-items: center;
  column-gap: 12rpx;
}

.profile-nickname-text {
  max-width: 380rpx;
  font-size: 32rpx;
  line-height: 1.35;
  font-weight: 500;
  color: #1A1A1A;
}

.profile-nickname-edit-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #07C160;
  opacity: 0.62;
  flex: 0 0 16rpx;
}

.profile-login-tip {
  font-size: 22rpx;
  line-height: 1.4;
  color: #70757A;
}

.setting-panel {
  margin-top: 32rpx;
  margin-bottom: 32rpx;
  padding: 40rpx 40rpx 32rpx;
  transition: all 0.5s ease;
}

.setting-panel.has-api-status {
  padding-bottom: 40rpx;
}

.setting-panel.is-api-guide-highlight {
  animation: apiGuideShake 360ms ease-in-out infinite, apiGuideGlow 1.2s ease-in-out infinite;
}

@keyframes apiGuideShake {
  0%,
  100% {
    transform: translateX(-5rpx);
  }

  50% {
    transform: translateX(5rpx);
  }
}

@keyframes apiGuideGlow {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(7, 193, 96, 0.08);
  }

  50% {
    box-shadow: 0 0 0 8rpx rgba(7, 193, 96, 0.12);
  }
}

.ai-panel,
.tag-panel {
  padding: 40rpx;
}

.ai-panel {
  margin-top: 0;
  margin-bottom: 32rpx;
  padding: 40rpx;
}

.ai-panel .section-title {
  margin-bottom: 32rpx;
}

.tag-panel {
  margin-top: 0;
}

.section-title {
  display: block;
  margin-bottom: 16rpx;
  font-size: 28rpx;
  line-height: 1.3;
  font-weight: 600;
  color: #1A1A1A;
}

.field-box {
  border: 1rpx solid #E8EAED;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 0 14rpx;
}

.api-key-box {
  border: 1rpx solid #EEEEEE;
  border-radius: 12rpx;
  background: #FAFAFA;
  transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.api-key-box.is-focused {
  background: #FFFFFF;
  border-color: #E8F5ED;
  box-shadow: 0 0 8rpx rgba(7, 193, 96, 0.08);
}

.ai-panel .field-box {
  border: 0;
  background: #F8F9FA;
  border-radius: 8rpx;
  padding: 24rpx;
  margin-bottom: 48rpx;
}

.goal-input-field {
  position: relative;
}

.goal-input-wrap {
  position: relative;
  width: 100%;
  min-height: 220rpx;
}

.goal-textarea {
  width: 100%;
  min-height: 220rpx;
  height: 220rpx;
  padding: 0 76rpx 0 0;
  box-sizing: border-box;
  font-size: 26rpx;
  line-height: 1.6;
  color: #555555;
  background: #F8F9FA;
  border-radius: 8rpx;
}

.goal-input-clear-btn {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 40rpx;
  height: 40rpx;
  padding: 12rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.goal-input-clear-icon {
  width: 40rpx;
  height: 40rpx;
}

.field-box + .field-box {
  margin-top: 32rpx;
}

.picker-label,
.text-input {
  width: 100%;
  min-height: 70rpx;
  font-size: 26rpx;
  line-height: 1.45;
  color: #3C4043;
  display: flex;
  align-items: center;
}

.api-key-field {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  min-height: 72rpx;
}

.api-key-input {
  flex: 1;
  min-width: 0;
  width: auto;
  padding-right: 140rpx;
  box-sizing: border-box;
  font-size: 28rpx;
  line-height: 1.4;
  color: #4A4A4A;
  font-weight: 400;
}

.api-key-input.is-masked {
  letter-spacing: 3rpx;
}

.api-key-clear-icon {
  position: absolute;
  right: 92rpx;
  top: 50%;
  width: 36rpx;
  height: 36rpx;
  padding: 8rpx;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.92;
}

.api-key-visibility-icon {
  position: absolute;
  right: 32rpx;
  top: 50%;
  width: 36rpx;
  height: 36rpx;
  transform: translateY(-50%);
  opacity: 0.92;
}

.hint-text {
  margin-top: 24rpx;
  font-size: 22rpx;
  line-height: 1.45;
  color: #B2B2B2;
}

.setting-panel .hint-text {
  margin-top: 32rpx;
}

.api-check-row {
  margin-top: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  transition: all 0.5s ease;
}

.api-check-status {
  min-height: 44rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #999999;
  transition: all 0.5s ease;
}

.api-check-status.is-checking {
  color: #999999;
}

.api-check-status.is-success {
  color: #07C160;
}

.api-check-status.is-error {
  color: #FA5151;
}

.api-check-spinner {
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;
  border: 2rpx solid rgba(153, 153, 153, 0.22);
  border-top-color: #999999;
  animation: api-check-spin 0.7s linear infinite;
}

.api-check-btn {
  min-height: 44rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  border: 1rpx solid #E8EAED;
  background: #FFFFFF;
  color: #555555;
  font-size: 22rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.api-check-btn.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}

@keyframes api-check-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.goal-error {
  color: #d14b4b;
  width: 100%;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.5s ease;
}

.goal-error-fade-enter-active,
.goal-error-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.goal-error-fade-enter-from,
.goal-error-fade-leave-to {
  opacity: 0;
  transform: translateY(-8rpx);
}

.save-btn {
  width: 85%;
  height: 80rpx;
  min-height: 80rpx;
  margin: 32rpx auto 0;
  border: 1rpx solid #07C160;
  border-radius: 12rpx;
  background: #ffffff;
  color: #07C160;
  font-size: 28rpx;
  font-weight: 500;
  letter-spacing: 2rpx;
  transform: scale(1);
  box-shadow: 0 0 0 rgba(7, 193, 96, 0);
  transition: transform 220ms ease, box-shadow 220ms ease, opacity 220ms ease;
}

.save-btn-hover {
  opacity: 0.92;
}

.ai-generate-btn {
  margin-top: 0;
  margin-bottom: 0;
}

.ai-panel .save-btn {
  width: 100%;
  margin: 0;
  border-radius: 16rpx;
}

.ai-generate-btn.is-guide-highlight {
  animation: guidePulse 2s ease-in-out infinite;
}

@keyframes guidePulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(7, 193, 96, 0.08);
  }

  50% {
    transform: scale(1.02);
    box-shadow: 0 10rpx 24rpx rgba(7, 193, 96, 0.18);
  }
}

.suggested-wrap {
  margin-top: 32rpx;
  width: 100%;
  overflow: visible;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.suggested-wrap .tag-list {
  justify-content: flex-start;
  align-items: flex-start;
  align-content: flex-start;
  gap: 0;
  width: 100%;
}

.tag-chip {
  min-height: 56rpx;
  padding: 0 20rpx;
  border-radius: 40rpx;
  background: #F0F9F4;
  color: #07C160;
  font-size: 24rpx;
  line-height: 1.2;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.tag-item {
  margin: 12rpx 10rpx;
  min-height: 0;
  padding: 10rpx 24rpx;
  font-size: 24rpx;
  border-radius: 30rpx;
  border: 1rpx solid #07C160;
  background-color: rgba(7, 193, 96, 0.08);
  color: #06A954;
  animation: sway 3s ease-in-out infinite alternate;
  transform-origin: center center;
  will-change: transform;
}

.tag-item:nth-child(odd) {
  animation-delay: -0.5s;
}

.tag-item:nth-child(even) {
  animation-delay: -1.2s;
}

.tag-chip-selectable.is-selected {
  background-color: rgba(7, 193, 96, 0.08);
  border: 1rpx solid #07C160;
  color: #06A954;
}

.tag-chip-selectable.is-unselected {
  background-color: rgba(7, 193, 96, 0.08);
  border: 1rpx solid #07C160;
  color: #06A954;
  opacity: 0.5;
}

@keyframes sway {
  0% {
    transform: translateX(-2rpx) rotate(-1.5deg);
  }

  100% {
    transform: translateX(2rpx) rotate(1.5deg);
  }
}

.confirm-actions {
  margin-top: 48rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.confirm-btn {
  width: 31%;
  height: 72rpx;
  min-height: 72rpx;
  padding: 0;
  border-radius: 8rpx;
  font-size: 26rpx;
  color: #70757A;
  background: #f7f8fa;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-btn.is-primary {
  color: #07C160;
  background: #F0F9F4;
}

.confirm-btn.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}

.tag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tag-title {
  margin-bottom: 0;
}

.tag-toggle {
  font-size: 24rpx;
  color: #70757A;
}

.tag-body {
  margin-top: 20rpx;
}

.tag-remove {
  color: #07C160;
  font-size: 24rpx;
  line-height: 1;
}

.tag-add-row {
  margin-top: 20rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.tag-add-input-wrap {
  flex: 1;
}

.tag-add-btn {
  min-height: 70rpx;
  padding: 0 20rpx;
  border-radius: 8rpx;
  background: #F0F9F4;
  color: #07C160;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-action-panel {
  margin-top: 32rpx;
  margin-bottom: 8rpx;
  padding: 28rpx 32rpx;
}

.logout-btn {
  width: 100%;
  min-height: 78rpx;
  border-radius: 14rpx;
  border: 1rpx solid #E8EAED;
  background: #FFFFFF;
  color: #D64545;
  font-size: 28rpx;
  font-weight: 600;
}

.logout-btn[disabled] {
  opacity: 0.6;
}

.logout-btn-hover {
  opacity: 0.88;
}

.logout-hint {
  display: block;
  margin-top: 16rpx;
  text-align: center;
  font-size: 22rpx;
  line-height: 1.45;
  color: #9AA0A6;
}

.auth-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(18, 18, 18, 0.48);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 40rpx;
}

.auth-dialog-card {
  width: 100%;
  max-width: 520rpx;
  padding: 40rpx;
  border-radius: 32rpx;
  background: #ffffff;
  box-shadow: 0 30rpx 60rpx rgba(0, 0, 0, 0.12);
  text-align: center;
}

.auth-dialog-title {
  font-size: 34rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #1A1A1A;
  margin-bottom: 24rpx;
}

.auth-dialog-form {
  width: 100%;
  text-align: left;
  margin-bottom: 24rpx;
}

.auth-dialog-field-label {
  display: block;
  margin-bottom: 10rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #70757A;
}

.auth-dialog-input {
  width: 100%;
  min-height: 74rpx;
  padding: 0 20rpx;
  border: 1rpx solid #E8EAED;
  border-radius: 14rpx;
  background: #FAFAFA;
  color: #1A1A1A;
  font-size: 26rpx;
  line-height: 1.45;
  box-sizing: border-box;
}

.auth-dialog-description {
  font-size: 26rpx;
  line-height: 1.5;
  color: #555555;
  margin-bottom: 32rpx;
}

.auth-dialog-cta {
  width: 100%;
  min-height: 74rpx;
  border-radius: 18rpx;
  border: 1rpx solid #07C160;
  background: #07C160;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 18rpx;
}

.auth-dialog-cta.secondary {
  border-color: #E8EAED;
  background: #F8F9FA;
  color: #5B5B5B;
}

.auth-dialog-cta.is-loading {
  opacity: 0.85;
  pointer-events: none;
}

.auth-dialog-switch-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  column-gap: 6rpx;
  margin-top: 6rpx;
}

.auth-dialog-switch-prefix {
  font-size: 22rpx;
  color: #8A8F96;
  line-height: 1.5;
}

.auth-dialog-switch-action {
  font-size: 26rpx;
  font-weight: 700;
  color: #07C160;
  line-height: 1.4;
}

.auth-dialog-hint {
  font-size: 22rpx;
  color: #7C7C7C;
  margin-top: 4rpx;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 200ms ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

</style>




