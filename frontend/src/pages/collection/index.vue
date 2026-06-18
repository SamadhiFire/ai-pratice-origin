<template>
  <view class="page-root">
    <view class="sticky-header collection-fixed-shell" :style="fixedHeaderStyle">
      <view class="tabs-header">
        <view class="filter-tabs" :style="{ width: tabSafeWidth }">
          <view
            class="filter-tab"
            :class="activeTab === 'all' ? 'is-active' : ''"
            @click="switchFilter('all')"
          >
            全部
          </view>
          <view
            class="filter-tab"
            :class="activeTab === 'wrong' ? 'is-active' : ''"
            @click="switchFilter('wrong')"
          >
            错题
          </view>
          <view
            class="filter-tab"
            :class="activeTab === 'mastered' ? 'is-active' : ''"
            @click="switchFilter('mastered')"
          >
            掌握
          </view>
        </view>
      </view>

      <view class="sticky-header-body">
        <view v-if="tagRibbonTags.length > 0" class="tag-ribbon-row">
          <view class="tag-ribbon-main">
            <view class="tag-ribbon-fixed">
              <view
                v-for="tag in fixedTagRibbon"
                :key="`fixed-${tag}`"
                class="tag-pill"
                :class="selectedTag === tag ? 'is-active' : ''"
                @click="selectTag(tag)"
              >
                {{ tag }}
              </view>
            </view>

            <view class="tag-ribbon-content">
              <view v-if="shouldShowTagGuide" class="tag-guide-inline" @click="handleGoToTagGuide">
                <text class="tag-guide-text">
                  让AI创建个性化的题集分类，
                  <text class="tag-guide-link">点击去生成</text>
                  ~
                </text>
              </view>

              <view v-else class="tag-scroll-shell">
                <scroll-view
                  :scroll-x="!isTagSortMode"
                  enhanced
                  :show-scrollbar="false"
                  :scroll-left="tagScrollBindingLeft"
                  scroll-with-animation
                  class="tag-scroll-view"
                  @scroll="handleTagRibbonScroll"
                  @touchmove="handleTagRibbonTouchMove"
                  @touchend="finishTagDragSort"
                  @touchcancel="finishTagDragSort"
                >
                  <view class="tag-scroll-track" :class="isTagSortMode ? 'is-sort-mode' : ''">
                    <view
                      v-for="item in scrollTagItems"
                      :key="item.key"
                      class="tag-pill tag-scroll-pill"
                      :class="tagPillClass(item)"
                      :style="tagPillStyle(item)"
                      @click="handleTagPillClick(item.name)"
                      @longpress="beginTagSort(item, $event)"
                    >
                      {{ item.name }}
                    </view>
                  </view>
                </scroll-view>
                <view class="tag-scroll-fade" :class="showTagScrollHint ? 'is-visible' : 'is-hidden'" />
                <view
                  class="tag-scroll-arrow-btn is-right"
                  :class="showTagScrollHint ? 'is-visible' : 'is-hidden'"
                  @tap.stop="scrollTagRibbonBy(TAG_SCROLL_STEP_RPX)"
                >
                  ›
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <scroll-view class="page-scroll oa-scrollbar-stealth" :style="pageScrollStyle" scroll-y :show-scrollbar="false">
      <view class="page-body">
        <view v-if="quizList.length > 0" class="study-dashboard-block">
          <view class="study-dashboard">
            <text class="dashboard-left">
              {{ `第 ${currentDisplayIndex} / ${totalQuizCount} 题` }}
            </text>
            <view class="dashboard-right-wrap">
              <view class="dashboard-clear-btn" hover-class="dashboard-clear-btn-hover" @click="handleClearByCurrentCategory">
                <image class="dashboard-clear-icon" :src="trashRedIcon" mode="aspectFit" />
                <text>清空</text>
              </view>
              <text
                class="dashboard-right"
                :class="dashboardRightClass"
              >
                {{ dashboardRightText }}
              </text>
            </view>
          </view>
          <view class="dashboard-progress-track">
            <view class="dashboard-progress-fill" :style="{ width: `${progressPercent}%` }"></view>
          </view>
        </view>

        <view v-if="quizList.length === 0" class="empty-zone">
          <view class="empty-content">
            <image class="empty-icon" :src="emptyStateSvg" mode="aspectFit" />
            <text class="empty-title">暂无生成的题目</text>
            <text class="empty-subtitle">去“刷题”页面粘贴材料试试吧~</text>
            <button
              class="empty-cta"
              hover-class="empty-cta-hover"
              @click="handleGoToPractice"
            >
              立即去刷题
            </button>
          </view>
        </view>

        <view v-else class="viewer-zone">
          <view class="card-shell">
            <view class="arrow-panel" :class="leftArrowPressed ? 'is-active' : ''" @click="prevQuiz">
              <view class="arrow-circle">
                <text class="arrow-icon" :class="leftArrowPressed ? 'is-active' : ''">‹</text>
              </view>
            </view>

            <view class="quiz-card">
              <view class="quiz-meta-row">
                <text class="quiz-meta-item">{{ currentQuestionTypeLabel }}</text>
                <text class="quiz-meta-item">{{ currentDifficultyLabel }}</text>
              </view>

              <view class="question-block">{{ currentStemText }}</view>

              <view
                v-for="item in cardOptions"
                :key="item.key"
                class="option-item"
                :class="optionClass(item.key)"
                @click="selectOption(item.key)"
              >
                <text class="option-key">{{ item.key }}</text>
                <text class="option-text">{{ item.text || '—' }}</text>
              </view>

              <view v-if="activeTab === 'mastered'" class="mastered-actions">
                <view class="master-remove-btn" @click="removeCurrentFromMastered">
                  ❌ 移出【掌握】
                </view>
              </view>

              <view class="analysis-wrap" :class="currentQuiz?.showAnalysis ? 'is-visible' : ''">
                <view class="analysis-title">题目解析</view>
                <view class="analysis-text">{{ currentQuiz?.explanation || '暂无解析' }}</view>
                <view class="analysis-actions">
                  <view
                    v-if="currentQuiz?.isAnswered && activeTab !== 'mastered'"
                    class="master-add-btn"
                    @click="markCurrentAsMastered"
                  >
                    <text class="master-add-prefix">✅ 这题懂了，</text>
                    <text class="master-add-emphasis">加入【掌握】</text>
                  </view>
                  <view class="next-btn" @click="nextAfterFeedback">下一题</view>
                </view>
              </view>
            </view>

            <view class="arrow-panel" :class="rightArrowPressed ? 'is-active' : ''" @click="nextQuiz">
              <view class="arrow-circle">
                <text class="arrow-icon" :class="rightArrowPressed ? 'is-active' : ''">›</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <view
      v-if="showClearConfirmModal"
      class="clear-modal-mask oa-modal-mask"
      @click="closeClearConfirmModal"
    >
      <view class="clear-modal oa-modal-panel" @click.stop>
        <text class="clear-modal-title">确认清空</text>
        <text class="clear-modal-content">{{ clearConfirmContent }}</text>
        <view class="clear-modal-actions">
          <view class="clear-modal-btn is-cancel" @click="closeClearConfirmModal">取消</view>
          <view class="clear-modal-btn is-confirm" @click="confirmClearByCurrentCategory">确定</view>
        </view>
      </view>
    </view>

    <InsTabBar active="collection" />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import InsTabBar from '../../components/InsTabBar.vue'
import trashRedIcon from '../../assets/images/icon-trash-red.svg'
import {
  hydrateQuestionBankFromBackend,
  loadQuestionBank,
  removeQuestionsByIds,
  setQuestionCategoryOrderByTagOrder,
  setQuestionMastered,
  submitQuestionAttempt,
  setQuestionWrong,
  type StoredQuestion,
} from '../../utils/question-bank'
import { resolveStatusBarTopPadding } from '../../utils/layout'
import { USER_TAGS_CHANGED_EVENT, hydrateUserTagsFromBackend, loadUserTags, saveUserTags } from '../../utils/user-tags'
import { retagQuestionBankByStoredTags } from '../../utils/tag-retag'

type QuizRuntime = StoredQuestion & {
  isAnswered: boolean
  showAnalysis: boolean
  userChoice: string | null
}

type CollectionFilterTab = 'all' | 'wrong' | 'mastered'

type CollectionRuntimeSnapshot = {
  id: string
  isAnswered: boolean
  showAnalysis: boolean
  userChoice: string | null
}

type CollectionViewState = {
  activeTab: CollectionFilterTab
  selectedTag: string
  currentIndex: number
  runtime: CollectionRuntimeSnapshot[]
}

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const
const DIFFICULTY_LABEL: Record<'easy' | 'medium' | 'hard', string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}
const FOCUS_MATERIAL_ONCE_KEY = 'study_quiz_focus_material_once'
const COLLECTION_VIEW_STATE_KEY = 'study_collection_view_state_v1'
const TAG_ORDER_STORAGE_KEY = 'study_collection_tag_order_v1'
const DEFAULT_GENERAL_TAG = '综合'
const DEFAULT_OTHER_TAG = '其他'
const MAX_COLLECTION_RUNTIME_SNAPSHOT = 96
const TAG_SCROLL_STEP_RPX = 200
const emptyStateSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" fill="none"><rect x="20" y="16" width="80" height="88" rx="12" stroke="%23D1D1D6" stroke-width="1.5" stroke-dasharray="4 4"/><path d="M44 48h32M44 64h32M44 80h22" stroke="%23D1D1D6" stroke-width="1.5" stroke-linecap="round"/></svg>'

type AppGuideGlobalData = {
  isFromGuide?: boolean
  hasDismissedTagGuide?: boolean
}

type ScrollTagItem = {
  key: string
  name: string
  sortable: boolean
  customIndex: number
}

const activeTab = ref<CollectionFilterTab>('all')
const tabSafeWidth = ref('60%')
const TAG_GUIDE_DISMISSED_KEY = 'study_tag_guide_dismissed_v1'
const tagGuideDismissed = ref(false)
const sourceQuizList = ref<QuizRuntime[]>([])
const quizList = ref<QuizRuntime[]>([])
const currentIndex = ref(0)
const selectedTag = ref(DEFAULT_GENERAL_TAG)
const activeUserTags = ref<string[]>([])
const customOrderedTags = ref<string[]>([])
const showClearConfirmModal = ref(false)
const clearConfirmCategoryName = ref(DEFAULT_GENERAL_TAG)
const clearConfirmTargetIds = ref<string[]>([])
const leftArrowPressed = ref(false)
const rightArrowPressed = ref(false)
const tagScrollLeft = ref(0)
const tagScrollTargetLeft = ref(-1)
const tagScrollViewportWidth = ref(0)
const tagScrollContentWidth = ref(0)
const tagScrollMeasured = ref(false)
const retagSyncing = ref(false)
const isTagSortMode = ref(false)
const draggingTagName = ref('')
const draggingCustomIndex = ref(-1)
const draggingOffsetX = ref(0)
const draggingOffsetY = ref(0)
const tagOrderDirty = ref(false)
const skipNextUserTagsChanged = ref(false)
const sortableTagCenters = ref<number[]>([])
const sortableTagRects = ref<Array<{ left: number; right: number; width: number }>>([])
const ignoreTagClickUntil = ref(0)
let leftArrowTimer: ReturnType<typeof setTimeout> | null = null
let rightArrowTimer: ReturnType<typeof setTimeout> | null = null
let tagScrollControlTimer: ReturnType<typeof setTimeout> | null = null
const safeTopPx = ref(resolveStatusBarTopPadding())
const fixedHeaderHeightPx = ref(132)
const fixedHeaderStyle = computed(() => ({ paddingTop: `${safeTopPx.value}px` }))
const pageScrollStyle = computed(() => ({ paddingTop: `${fixedHeaderHeightPx.value}px` }))
const tagScrollBindingLeft = computed<number | undefined>(() => (
  tagScrollTargetLeft.value >= 0 ? tagScrollTargetLeft.value : undefined
))
const totalQuizCount = computed(() => quizList.value.length)
const currentDisplayIndex = computed(() => {
  if (quizList.value.length === 0) return 0
  return currentIndex.value + 1
})
const currentPracticeCount = computed(() => Math.max(0, Number(currentQuiz.value?.practiceCount || 0)))
const currentWrongCount = computed(() => Math.max(0, Number(currentQuiz.value?.wrongCount || 0)))
const masteredCount = computed(() => sourceQuizList.value.filter((item) => item.isMastered).length)
const hasPersonalizedTags = computed(() =>
  customOrderedTags.value.length > 0,
)
const customTagSetForFilter = computed(() => {
  return new Set(
    customOrderedTags.value.map((tag) => normalizeTagText(tag).toLowerCase()),
  )
})
const shouldShowTagGuide = computed(
  () => !hasPersonalizedTags.value,
)
const clearConfirmContent = computed(
  () => `确定要清空 [${clearConfirmCategoryName.value}] 下的所有题目吗？此操作不可撤销`,
)
const tagRibbonTags = computed(() => {
  return [DEFAULT_GENERAL_TAG, ...customOrderedTags.value, DEFAULT_OTHER_TAG]
})
const fixedTagRibbon = computed(() => {
  return [DEFAULT_GENERAL_TAG]
})
const scrollTagItems = computed<ScrollTagItem[]>(() => {
  const customItems = customOrderedTags.value.map((tag, idx) => ({
    key: `custom-${tag.toLowerCase()}`,
    name: tag,
    sortable: true,
    customIndex: idx,
  }))
  return [
    ...customItems,
    {
      key: 'other-anchor',
      name: DEFAULT_OTHER_TAG,
      sortable: false,
      customIndex: -1,
    },
  ]
})
const hasTagScrollOverflow = computed(() => {
  if (shouldShowTagGuide.value) return false
  if (!tagScrollMeasured.value) return false
  return tagScrollContentWidth.value - tagScrollViewportWidth.value > 2
})
const showTagScrollHint = computed(() => {
  if (!hasTagScrollOverflow.value) return false
  const maxScrollLeft = Math.max(0, tagScrollContentWidth.value - tagScrollViewportWidth.value)
  return tagScrollLeft.value < maxScrollLeft - 2
})
const dashboardRightText = computed(() => (
  activeTab.value === 'wrong'
    ? `已错 ${currentWrongCount.value} 次`
    : activeTab.value === 'mastered'
      ? `已消灭 ${masteredCount.value} 道难关`
      : `已练习 ${currentPracticeCount.value} 次`
))
const dashboardRightClass = computed(() => (activeTab.value === 'wrong' ? 'is-wrong' : 'is-practice'))
const progressPercent = computed(() => {
  const total = totalQuizCount.value
  if (total <= 0) {
    return 0
  }

  const current = Math.min(total, Math.max(1, currentIndex.value + 1))
  return (current / total) * 100
})

const currentQuiz = computed(() => quizList.value[currentIndex.value] || null)
const currentQuestionTypeLabel = computed(() => (currentQuiz.value?.type === 'multi' ? '多选题' : '单选题'))
const currentDifficultyLabel = computed(() => {
  const difficulty = currentQuiz.value?.difficulty
  if (!difficulty) return '中等'
  return DIFFICULTY_LABEL[difficulty] || '中等'
})
const currentStemText = computed(() => {
  const raw = String(currentQuiz.value?.stem || '').trim()
  return raw.replace(/^\s*题目\s*[:：]\s*/, '')
})

const cardOptions = computed(() => {
  const question = currentQuiz.value
  const optionMap = new Map(
    (question?.options || []).map((opt) => [String(opt.key || '').toUpperCase(), String(opt.text || '').trim()]),
  )

  return OPTION_KEYS.map((key) => ({
    key,
    text: optionMap.get(key) || '',
  }))
})

function parseAnswerKeys(answer: string, options?: StoredQuestion['options']): string[] {
  const optionKeys = new Set((options || []).map((opt) => String(opt.key || '').toUpperCase()))
  const raw = String(answer || '').trim()
  if (!raw) return []

  const out: string[] = []
  const push = (key: string) => {
    const normalized = key.toUpperCase()
    if (!optionKeys.has(normalized) || out.includes(normalized)) return
    out.push(normalized)
  }

  const parts = raw.split(/[|/／,，;；、\s]+/g).map((item) => item.trim()).filter(Boolean)
  if (parts.length > 1) {
    parts.forEach((item) => {
      const letter = item.toUpperCase().match(/[A-D]/)?.[0]
      if (letter) push(letter)
    })
  }

  if (out.length === 0) {
    const letters = raw.toUpperCase().match(/[A-D]/g) || []
    letters.forEach((letter) => push(letter))
  }

  return out
}

function normalizeTagText(raw: unknown): string {
  const clean = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 12)
  if (!clean) return DEFAULT_GENERAL_TAG
  if (clean === '通用' || clean === '未分类') return DEFAULT_GENERAL_TAG
  return clean
}

function readLatestUserTags(): string[] {
  return normalizeCustomTagOrder(loadUserTags())
}

function normalizeCustomTagOrder(tags: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  tags.forEach((raw) => {
    const tag = normalizeTagText(raw)
    if (!tag || tag === DEFAULT_GENERAL_TAG || tag === DEFAULT_OTHER_TAG) return
    const signature = tag.toLowerCase()
    if (seen.has(signature)) return
    seen.add(signature)
    output.push(tag)
  })
  return output
}

function readStoredCustomTagOrder(): string[] {
  const raw = uni.getStorageSync(TAG_ORDER_STORAGE_KEY)
  if (Array.isArray(raw)) {
    return normalizeCustomTagOrder(raw.map((item) => String(item || '')))
  }
  return []
}

function persistTagOrderStorage(order: string[]): void {
  const normalized = normalizeCustomTagOrder(order)
  uni.setStorageSync(TAG_ORDER_STORAGE_KEY, normalized)

  const wxApi = (globalThis as {
    wx?: {
      setStorageSync?: (key: string, data: unknown) => void
    }
  }).wx
  if (wxApi?.setStorageSync) {
    try {
      wxApi.setStorageSync(TAG_ORDER_STORAGE_KEY, normalized)
    } catch {
      // ignore and keep uni storage fallback
    }
  }
}

function syncCustomOrderedTags(sourceTags: string[]): string[] {
  const latest = normalizeCustomTagOrder(sourceTags)
  const storedOrder = readStoredCustomTagOrder()
  if (storedOrder.length === 0) return latest

  const latestSet = new Set(latest.map((tag) => tag.toLowerCase()))
  const output = storedOrder.filter((tag) => latestSet.has(tag.toLowerCase()))
  latest.forEach((tag) => {
    if (!output.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      output.push(tag)
    }
  })
  return output
}

function resolveTagOrderIndex(rawTag: unknown): number {
  const tag = normalizeTagText(rawTag)
  if (tag === DEFAULT_GENERAL_TAG) return 0
  const customIndex = customOrderedTags.value.findIndex((item) => item.toLowerCase() === tag.toLowerCase())
  if (customIndex >= 0) return customIndex + 1
  return customOrderedTags.value.length + 1
}

function sortByTagOrder(list: QuizRuntime[]): QuizRuntime[] {
  return [...list].sort((a, b) => {
    const timeDiff = Number(b.createdAt || 0) - Number(a.createdAt || 0)
    if (timeDiff !== 0) return timeDiff

    return String(b.id || '').localeCompare(String(a.id || ''))
  })
}

function matchesSelectedTag(itemTag: unknown, currentTag: string): boolean {
  const currentTagName = String(currentTag || '').trim()
  const normalizedCurrentTag = normalizeTagText(currentTagName).trim()

  const rawItemTag = String(itemTag || '').trim()
  const normalizedItemTag = normalizeTagText(rawItemTag).trim()
  if (normalizedCurrentTag === DEFAULT_GENERAL_TAG) {
    // “综合”作为聚合视图：展示当前主Tab下所有题目（包含全部子类目）。
    return true
  }

  if (normalizedCurrentTag === DEFAULT_OTHER_TAG) {
    const customTagSet = customTagSetForFilter.value
    if (customTagSet.size === 0) {
      // 无自定义标签时，“其他”退化为“全量”，与“综合”保持一致。
      return true
    }
    if (!rawItemTag) return true
    return !customTagSet.has(normalizedItemTag.toLowerCase())
  }

  return normalizedItemTag === normalizedCurrentTag
}

function toRuntime(item: StoredQuestion): QuizRuntime {
  return {
    ...item,
    isAnswered: false,
    showAnalysis: false,
    userChoice: null,
  }
}

function snapshotRuntimeState(list: QuizRuntime[]): CollectionRuntimeSnapshot[] {
  return list
    .filter((item) => item.isAnswered || item.showAnalysis || item.userChoice)
    .slice(-MAX_COLLECTION_RUNTIME_SNAPSHOT)
    .map((item) => ({
      id: String(item.id || ''),
      isAnswered: Boolean(item.isAnswered),
      showAnalysis: Boolean(item.showAnalysis),
      userChoice: item.userChoice ? String(item.userChoice).toUpperCase() : null,
    }))
}

function applyRuntimeState(list: QuizRuntime[], runtime: CollectionRuntimeSnapshot[]): QuizRuntime[] {
  if (runtime.length === 0) return list
  const runtimeMap = new Map(runtime.map((item) => [item.id, item]))
  return list.map((item) => {
    const state = runtimeMap.get(item.id)
    if (!state) return item
    return {
      ...item,
      isAnswered: state.isAnswered,
      showAnalysis: state.showAnalysis,
      userChoice: state.userChoice,
    }
  })
}

function normalizeActiveTab(raw: unknown): CollectionFilterTab {
  if (raw === 'wrong') return 'wrong'
  if (raw === 'mastered') return 'mastered'
  return 'all'
}

function readCollectionViewState(): CollectionViewState | null {
  try {
    const raw = uni.getStorageSync(COLLECTION_VIEW_STATE_KEY)
    if (!raw || typeof raw !== 'object') return null

    const source = raw as Partial<CollectionViewState>
    const runtimeRaw = Array.isArray(source.runtime)
      ? source.runtime.slice(-MAX_COLLECTION_RUNTIME_SNAPSHOT)
      : []
    const runtime = runtimeRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const runtimeItem = item as Partial<CollectionRuntimeSnapshot>
        const id = String(runtimeItem.id || '').trim()
        if (!id) return null
        return {
          id,
          isAnswered: Boolean(runtimeItem.isAnswered),
          showAnalysis: Boolean(runtimeItem.showAnalysis),
          userChoice: runtimeItem.userChoice ? String(runtimeItem.userChoice).toUpperCase() : null,
        } satisfies CollectionRuntimeSnapshot
      })
      .filter((item): item is CollectionRuntimeSnapshot => Boolean(item))

    const selected = normalizeTagText(source.selectedTag)
    const indexNumber = Number(source.currentIndex)
    const currentIndexValue = Number.isFinite(indexNumber) ? Math.max(0, Math.floor(indexNumber)) : 0

    return {
      activeTab: normalizeActiveTab(source.activeTab),
      selectedTag: selected || DEFAULT_GENERAL_TAG,
      currentIndex: currentIndexValue,
      runtime,
    }
  } catch {
    return null
  }
}

function persistCollectionViewState() {
  const payload: CollectionViewState = {
    activeTab: activeTab.value,
    selectedTag: normalizeTagText(selectedTag.value),
    currentIndex: Math.max(0, Math.floor(Number(currentIndex.value || 0))),
    runtime: snapshotRuntimeState(sourceQuizList.value),
  }

  if (
    payload.activeTab === 'all'
    && payload.selectedTag === DEFAULT_GENERAL_TAG
    && payload.currentIndex === 0
    && payload.runtime.length === 0
  ) {
    uni.removeStorageSync(COLLECTION_VIEW_STATE_KEY)
    return
  }

  uni.setStorageSync(COLLECTION_VIEW_STATE_KEY, payload)
}

function restoreCollectionViewState() {
  const saved = readCollectionViewState()
  if (!saved) {
    selectedTag.value = tagRibbonTags.value.includes(selectedTag.value) ? selectedTag.value : DEFAULT_GENERAL_TAG
    applyFilter(currentIndex.value)
    return
  }

  activeTab.value = saved.activeTab
  selectedTag.value = tagRibbonTags.value.includes(saved.selectedTag) ? saved.selectedTag : DEFAULT_GENERAL_TAG
  sourceQuizList.value = applyRuntimeState(sourceQuizList.value, saved.runtime)
  applyFilter(saved.currentIndex)
}

function reloadQuizList() {
  sourceQuizList.value = loadQuestionBank().map((item) => toRuntime(item))
  const latestTags = readLatestUserTags()
  const syncedOrder = syncCustomOrderedTags(latestTags)
  activeUserTags.value = [...syncedOrder]
  customOrderedTags.value = [...syncedOrder]
  persistTagOrderStorage(syncedOrder)
  if (selectedTag.value && !tagRibbonTags.value.includes(selectedTag.value)) {
    selectedTag.value = DEFAULT_GENERAL_TAG
  }
  applyFilter()
  measureTagRibbonOverflow()
}

function resetTagRibbonOverflowState() {
  tagScrollLeft.value = 0
  if (tagScrollControlTimer) {
    clearTimeout(tagScrollControlTimer)
    tagScrollControlTimer = null
  }
  tagScrollTargetLeft.value = -1
  tagScrollViewportWidth.value = 0
  tagScrollContentWidth.value = 0
  tagScrollMeasured.value = false
}

function resolveWindowWidthPx(): number {
  try {
    const system = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null
    const width = Number(system?.windowWidth || system?.screenWidth || 375)
    if (Number.isFinite(width) && width > 0) return width
  } catch {
    // ignore and fallback
  }
  return 375
}

function rpxToPx(value: number): number {
  return (Number(value || 0) * resolveWindowWidthPx()) / 750
}

function clampTagScrollLeft(nextLeft: number): number {
  const maxScrollLeft = Math.max(0, tagScrollContentWidth.value - tagScrollViewportWidth.value)
  if (!Number.isFinite(nextLeft)) return 0
  if (nextLeft < 0) return 0
  if (nextLeft > maxScrollLeft) return maxScrollLeft
  return nextLeft
}

function releaseTagScrollControl(delayMs = 0) {
  if (tagScrollControlTimer) {
    clearTimeout(tagScrollControlTimer)
    tagScrollControlTimer = null
  }
  if (delayMs <= 0) {
    tagScrollTargetLeft.value = -1
    return
  }
  tagScrollControlTimer = setTimeout(() => {
    tagScrollTargetLeft.value = -1
    tagScrollControlTimer = null
  }, delayMs)
}

function syncTagScrollPosition(nextLeft: number, options?: { programmatic?: boolean }): void {
  const clamped = Math.round(clampTagScrollLeft(nextLeft))
  tagScrollLeft.value = clamped
  if (options?.programmatic) {
    tagScrollTargetLeft.value = clamped
    releaseTagScrollControl(260)
  }
}

function measureTagRibbonOverflow() {
  if (shouldShowTagGuide.value || customOrderedTags.value.length === 0) {
    resetTagRibbonOverflowState()
    return
  }

  nextTick(() => {
    const query = uni.createSelectorQuery()
    query.select('.tag-scroll-view').boundingClientRect()
    query.select('.tag-scroll-track').boundingClientRect()
    query.exec((result) => {
      const viewRect = (Array.isArray(result) ? result[0] : null) as { width?: number } | null
      const trackRect = (Array.isArray(result) ? result[1] : null) as { width?: number } | null
      const viewportWidth = Number(viewRect?.width || 0)
      const contentWidth = Number(trackRect?.width || 0)

      if (!Number.isFinite(viewportWidth) || !Number.isFinite(contentWidth) || viewportWidth <= 0) {
        resetTagRibbonOverflowState()
        return
      }

      tagScrollViewportWidth.value = viewportWidth
      tagScrollContentWidth.value = contentWidth
      tagScrollMeasured.value = true

      const clamped = Math.round(clampTagScrollLeft(tagScrollLeft.value))
      if (Math.abs(clamped - tagScrollLeft.value) > 1) {
        syncTagScrollPosition(clamped, { programmatic: true })
      } else {
        syncTagScrollPosition(clamped)
      }
    })
  })
}

function handleTagRibbonScroll(event: { detail?: { scrollLeft?: number } }) {
  const scrollLeft = Number(event?.detail?.scrollLeft || 0)
  if (!Number.isFinite(scrollLeft)) return
  syncTagScrollPosition(scrollLeft)
}

function scrollTagRibbonBy(deltaRpx: number) {
  if (shouldShowTagGuide.value) return
  if (!hasTagScrollOverflow.value) return
  if (isTagSortMode.value) return
  const next = tagScrollLeft.value + rpxToPx(deltaRpx)
  syncTagScrollPosition(next, { programmatic: true })
}

function resolveTouchPoint(event: unknown): { x: number; y: number } | null {
  const source = event as {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    detail?: { x?: number; y?: number }
  }

  const point = source?.touches?.[0] || source?.changedTouches?.[0]
  const x = Number(point?.clientX ?? point?.x ?? source?.detail?.x ?? 0)
  const y = Number(point?.clientY ?? point?.y ?? source?.detail?.y ?? 0)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function measureSortableTagPositions() {
  nextTick(() => {
    const query = uni.createSelectorQuery()
    query.selectAll('.tag-scroll-pill.is-sortable').boundingClientRect((rects) => {
      const list = Array.isArray(rects) ? rects : []
      sortableTagRects.value = list.map((item) => {
        const left = Number(item?.left || 0)
        const width = Number(item?.width || 0)
        return {
          left,
          width,
          right: left + width,
        }
      })
      sortableTagCenters.value = sortableTagRects.value.map((item) => item.left + item.width / 2)
    })
    query.exec()
  })
}

function findSwapTargetIndex(pointX: number): number {
  const centers = sortableTagCenters.value
  if (centers.length <= 0) return draggingCustomIndex.value

  let target = centers.length - 1
  for (let i = 0; i < centers.length; i += 1) {
    if (pointX < centers[i]) {
      target = i
      break
    }
  }
  return Math.min(Math.max(0, target), centers.length - 1)
}

function reorderCustomTags(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return
  if (fromIndex < 0 || toIndex < 0) return
  if (fromIndex >= customOrderedTags.value.length || toIndex >= customOrderedTags.value.length) return

  const next = [...customOrderedTags.value]
  const moved = next[fromIndex]
  next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  customOrderedTags.value = next
  draggingCustomIndex.value = toIndex
  tagOrderDirty.value = true
  measureSortableTagPositions()
}

function beginTagSort(item: ScrollTagItem, event: unknown) {
  if (!item.sortable) return
  if (customOrderedTags.value.length <= 1) return

  const point = resolveTouchPoint(event)
  isTagSortMode.value = true
  draggingTagName.value = item.name
  draggingCustomIndex.value = item.customIndex
  draggingOffsetX.value = 0
  draggingOffsetY.value = 0
  tagOrderDirty.value = false
  if (point) {
    ignoreTagClickUntil.value = Date.now() + 320
  }
  measureSortableTagPositions()
}

function handleTagRibbonTouchMove(event: unknown) {
  if (!isTagSortMode.value) return
  if (!draggingTagName.value) return
  const point = resolveTouchPoint(event)
  if (!point) return

  const dragRect = sortableTagRects.value[Math.max(0, draggingCustomIndex.value)]
  if (dragRect) {
    const centerX = dragRect.left + dragRect.width / 2
    draggingOffsetX.value = point.x - centerX
  }
  draggingOffsetY.value = 0

  const nextIndex = findSwapTargetIndex(point.x)
  if (nextIndex !== draggingCustomIndex.value) {
    reorderCustomTags(draggingCustomIndex.value, nextIndex)
  }
}

function syncTagOrderAfterSort() {
  const normalized = normalizeCustomTagOrder(customOrderedTags.value)
  customOrderedTags.value = normalized
  activeUserTags.value = [...normalized]
  persistTagOrderStorage(normalized)
  setQuestionCategoryOrderByTagOrder(normalized)

  skipNextUserTagsChanged.value = true
  saveUserTags(normalized)

  const selectedBefore = selectedTag.value
  const preferredIndex = currentIndex.value
  const runtimeBefore = snapshotRuntimeState(sourceQuizList.value)
  reloadQuizList()
  sourceQuizList.value = applyRuntimeState(sourceQuizList.value, runtimeBefore)
  selectedTag.value = tagRibbonTags.value.includes(selectedBefore)
    ? selectedBefore
    : DEFAULT_GENERAL_TAG
  applyFilter(preferredIndex)
  measureTagRibbonOverflow()
}

function finishTagDragSort() {
  if (!isTagSortMode.value) return

  const shouldSync = tagOrderDirty.value

  isTagSortMode.value = false
  draggingTagName.value = ''
  draggingCustomIndex.value = -1
  draggingOffsetX.value = 0
  draggingOffsetY.value = 0
  tagOrderDirty.value = false
  sortableTagCenters.value = []
  sortableTagRects.value = []
  ignoreTagClickUntil.value = Date.now() + 220

  if (shouldSync) {
    syncTagOrderAfterSort()
  }
}

function handleTagPillClick(tag: string) {
  if (isTagSortMode.value) return
  if (Date.now() < ignoreTagClickUntil.value) return
  selectTag(tag)
}

function tagPillClass(item: ScrollTagItem): string[] {
  const classNames: string[] = []
  if (selectedTag.value === item.name) classNames.push('is-active')
  if (item.sortable) classNames.push('is-sortable')
  if (!item.sortable) classNames.push('is-anchor')
  if (isTagSortMode.value && item.sortable) classNames.push('is-sort-shaking')
  if (draggingTagName.value === item.name) classNames.push('is-dragging')
  return classNames
}

function tagPillStyle(item: ScrollTagItem): Record<string, string> {
  if (draggingTagName.value !== item.name) return {}
  return {
    transform: `translate3d(${Math.round(draggingOffsetX.value)}px, ${Math.round(draggingOffsetY.value)}px, 0)`,
    opacity: '0.55',
  }
}

function clearCurrentQuizRuntimeState() {
  const question = currentQuiz.value
  if (!question) return

  question.isAnswered = false
  question.showAnalysis = false
  question.userChoice = null
}

function applyFilter(preferredIndex = currentIndex.value) {
  const listByTab = sourceQuizList.value.filter((item) => {
    const mastered = Boolean(item.isMastered)
    if (activeTab.value === 'mastered') return mastered
    if (mastered) return false
    if (activeTab.value === 'wrong') {
      return Number(item.wrongCount || 0) > 0
    }
    return true
  })
  const sortedByNewest = sortByTagOrder(listByTab)

  const normalizedSelectedTag = normalizeTagText(selectedTag.value)
  quizList.value = normalizedSelectedTag === DEFAULT_GENERAL_TAG
    ? sortedByNewest
    : sortedByNewest.filter((item) => matchesSelectedTag(item.tag, selectedTag.value))

  if (quizList.value.length === 0) {
    currentIndex.value = 0
    syncFixedHeaderHeight()
    return
  }

  currentIndex.value = Math.min(Math.max(0, preferredIndex), quizList.value.length - 1)
  syncFixedHeaderHeight()
}

function selectTag(tag: string) {
  if (isTagSortMode.value) return
  const nextTag = normalizeTagText(tag)
  if (selectedTag.value === nextTag) return
  selectedTag.value = nextTag
  applyFilter(0)
}

function switchFilter(tab: 'all' | 'wrong' | 'mastered') {
  if (activeTab.value === tab) return
  clearCurrentQuizRuntimeState()
  activeTab.value = tab
  applyFilter(0)
  measureTagRibbonOverflow()
}

function resolveCurrentCategoryLabel(): string {
  const normalized = normalizeTagText(selectedTag.value)
  return normalized || DEFAULT_GENERAL_TAG
}

function resolveIdsByCurrentCategory(): string[] {
  const normalizedSelectedTag = normalizeTagText(selectedTag.value)
  if (normalizedSelectedTag === DEFAULT_GENERAL_TAG) {
    return sourceQuizList.value.map((item) => item.id)
  }

  return sourceQuizList.value
    .filter((item) => matchesSelectedTag(item.tag, normalizedSelectedTag))
    .map((item) => item.id)
}

function handleClearByCurrentCategory() {
  const categoryName = resolveCurrentCategoryLabel()
  const targetIds = resolveIdsByCurrentCategory()
  if (targetIds.length === 0) {
    uni.showToast({
      title: '当前分类暂无题目',
      icon: 'none',
    })
    return
  }

  clearConfirmCategoryName.value = categoryName
  clearConfirmTargetIds.value = [...targetIds]
  showClearConfirmModal.value = true
}

function closeClearConfirmModal() {
  showClearConfirmModal.value = false
  clearConfirmTargetIds.value = []
}

function confirmClearByCurrentCategory() {
  const targetIds = [...clearConfirmTargetIds.value]
  closeClearConfirmModal()
  if (targetIds.length === 0) {
    return
  }

  const deletedCount = removeQuestionsByIds(targetIds)
  if (deletedCount <= 0) {
    uni.showToast({
      title: '未删除任何题目',
      icon: 'none',
    })
    return
  }

  const idSet = new Set(targetIds)
  sourceQuizList.value = sourceQuizList.value.filter((item) => !idSet.has(item.id))
  leftArrowPressed.value = false
  rightArrowPressed.value = false
  currentIndex.value = 0
  applyFilter(0)

  uni.showToast({
    title: `已清空 ${deletedCount} 题`,
    icon: 'success',
  })
}

function handleUserTagsChanged() {
  if (skipNextUserTagsChanged.value) {
    skipNextUserTagsChanged.value = false
    return
  }

  const nextOrder = syncCustomOrderedTags(readLatestUserTags())
  persistTagOrderStorage(nextOrder)
  setQuestionCategoryOrderByTagOrder(nextOrder)

  const selectedBefore = selectedTag.value
  const preferredIndex = currentIndex.value
  const runtimeBefore = snapshotRuntimeState(sourceQuizList.value)
  reloadQuizList()
  sourceQuizList.value = applyRuntimeState(sourceQuizList.value, runtimeBefore)
  selectedTag.value = tagRibbonTags.value.includes(selectedBefore)
    ? selectedBefore
    : tagRibbonTags.value[0] || DEFAULT_GENERAL_TAG
  applyFilter(preferredIndex)
  measureTagRibbonOverflow()
}

function prevQuiz() {
  flashArrow('left')
  if (quizList.value.length <= 1) return
  clearCurrentQuizRuntimeState()
  currentIndex.value = (currentIndex.value - 1 + quizList.value.length) % quizList.value.length
}

function nextQuiz() {
  flashArrow('right')
  if (quizList.value.length <= 1) return
  clearCurrentQuizRuntimeState()
  currentIndex.value = (currentIndex.value + 1) % quizList.value.length
}

function flashArrow(side: 'left' | 'right') {
  if (side === 'left') {
    leftArrowPressed.value = true
    if (leftArrowTimer) clearTimeout(leftArrowTimer)
    leftArrowTimer = setTimeout(() => {
      leftArrowPressed.value = false
      leftArrowTimer = null
    }, 140)
    return
  }

  rightArrowPressed.value = true
  if (rightArrowTimer) clearTimeout(rightArrowTimer)
  rightArrowTimer = setTimeout(() => {
    rightArrowPressed.value = false
    rightArrowTimer = null
  }, 140)
}

function handleGoToPractice() {
  uni.setStorageSync(FOCUS_MATERIAL_ONCE_KEY, 1)
  uni.switchTab({
    url: '/pages/index/index',
    fail: () => {
      uni.reLaunch({ url: '/pages/index/index' })
    },
  })
}

function getGuideGlobalData(): AppGuideGlobalData {
  const app = getApp<{ globalData?: AppGuideGlobalData }>()
  if (!app.globalData) {
    app.globalData = {}
  }
  return app.globalData
}

function syncTagGuideDismissedState() {
  const globalData = getGuideGlobalData()
  const dismissedByGlobal = Boolean(globalData.hasDismissedTagGuide)
  const dismissedByStorage = Number(uni.getStorageSync(TAG_GUIDE_DISMISSED_KEY) || 0) === 1
  const dismissed = dismissedByGlobal || dismissedByStorage

  tagGuideDismissed.value = dismissed
  if (dismissed && !globalData.hasDismissedTagGuide) {
    globalData.hasDismissedTagGuide = true
  }
}

function handleGoToTagGuide() {
  const globalData = getGuideGlobalData()
  globalData.isFromGuide = true

  const wxApi = (globalThis as {
    wx?: {
      switchTab?: (options: {
        url: string
        fail?: () => void
      }) => void
    }
  }).wx

  const fallback = () => {
    uni.reLaunch({ url: '/pages/profile/index' })
  }

  if (wxApi?.switchTab) {
    wxApi.switchTab({
      url: '/pages/profile/index',
      fail: fallback,
    })
    return
  }

  uni.switchTab({
    url: '/pages/profile/index',
    fail: fallback,
  })
}

function nextAfterFeedback() {
  if (!quizList.value.length) return

  if (activeTab.value === 'wrong') {
    applyFilter()
    if (!quizList.value.length) return
  }

  nextQuiz()
}

function selectOption(optionKey: string) {
  const question = currentQuiz.value
  if (!question || question.isAnswered) return

  const selectedKey = String(optionKey || '').toUpperCase()
  const hasOption = (question.options || []).some(
    (opt) => String(opt.key || '').toUpperCase() === selectedKey && String(opt.text || '').trim(),
  )
  if (!hasOption) return

  question.userChoice = selectedKey
  question.isAnswered = true
  question.showAnalysis = true

  const expected = parseAnswerKeys(question.answer, question.options)
  const isCorrect = expected.includes(selectedKey)

  setQuestionWrong(question.id, !isCorrect)
  void submitQuestionAttempt(question.id, selectedKey, 'instant').catch(() => {
    // ignore backend attempt failure
  })
  question.practiceCount = Math.max(0, Number(question.practiceCount || 0) + 1)
  if (!isCorrect) {
    question.wrongCount = Math.max(1, Number(question.wrongCount || 0) + 1)
  }
}

function markCurrentAsMastered() {
  const question = currentQuiz.value
  if (!question || !question.isAnswered || question.isMastered) return

  const nextIndex = currentIndex.value
  sourceQuizList.value = sourceQuizList.value.map((item) => {
    if (item.id !== question.id) return item
    return {
      ...item,
      isMastered: true,
      isAnswered: false,
      showAnalysis: false,
      userChoice: null,
    }
  })
  setQuestionMastered(question.id, true)
  applyFilter(nextIndex)
}

function removeCurrentFromMastered() {
  const question = currentQuiz.value
  if (!question || !question.isMastered) return

  const nextIndex = currentIndex.value
  sourceQuizList.value = sourceQuizList.value.map((item) => {
    if (item.id !== question.id) return item
    return {
      ...item,
      isMastered: false,
      isAnswered: false,
      showAnalysis: false,
      userChoice: null,
    }
  })
  setQuestionMastered(question.id, false)
  applyFilter(nextIndex)
}

function resolveTabSafeWidth(): string {
  try {
    const system = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null
    const screenWidth = Number(system?.screenWidth || 375)
    const leftPaddingPx = (32 * screenWidth) / 750

    const uniGetter = (
      uni as unknown as { getMenuButtonBoundingClientRect?: () => { left?: number } }
    ).getMenuButtonBoundingClientRect
    const wxGetter = (
      globalThis as { wx?: { getMenuButtonBoundingClientRect?: () => { left?: number } } }
    ).wx?.getMenuButtonBoundingClientRect
    const rect = typeof uniGetter === 'function'
      ? uniGetter()
      : typeof wxGetter === 'function'
        ? wxGetter()
        : null

    const left = Number(rect?.left || 0)
    if (Number.isFinite(left) && left > 0) {
      const headerWidth = Math.max(120, Math.round(left - leftPaddingPx))
      return `${headerWidth}px`
    }
  } catch {
    // ignore and fallback
  }

  return '60%'
}

function resolveFixedHeaderFallbackHeight(topPx: number): number {
  try {
    const system = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null
    const width = Number(system?.windowWidth || system?.screenWidth || 375)
    const headerPx = (168 * width) / 750
    return Math.round(topPx + headerPx)
  } catch {
    return Math.round(topPx + 84)
  }
}

function syncFixedHeaderHeight() {
  const fallbackHeight = resolveFixedHeaderFallbackHeight(safeTopPx.value)
  nextTick(() => {
    const query = uni.createSelectorQuery()
    query.select('.collection-fixed-shell').boundingClientRect((rect) => {
      const node = Array.isArray(rect) ? rect[0] : rect
      const measuredHeight = Math.round(Number(node?.height || 0))
      fixedHeaderHeightPx.value = measuredHeight > 0 ? measuredHeight : fallbackHeight
    })
    query.exec()
  })
}

function optionClass(optionKey: string) {
  const question = currentQuiz.value
  if (!question) return ''

  if (!question.isAnswered) {
    return ''
  }

  const selected = String(question.userChoice || '').toUpperCase()
  const expected = parseAnswerKeys(question.answer, question.options)
  const isSelected = selected === optionKey
  const selectedIsCorrect = expected.includes(selected)
  const isExpected = expected.includes(optionKey)

  if (selectedIsCorrect) {
    return isSelected ? 'is-correct' : 'is-locked'
  }

  if (isSelected) {
    return 'is-wrong'
  }

  if (isExpected) {
    return 'is-correct'
  }

  return 'is-locked'
}

async function autoRetagQuestionsIfNeeded() {
  if (retagSyncing.value) return
  if (activeUserTags.value.length === 0) return

  retagSyncing.value = true
  try {
    const selectedBefore = selectedTag.value
    const preferredIndex = currentIndex.value
    const runtimeBefore = snapshotRuntimeState(sourceQuizList.value)
    const summary = await retagQuestionBankByStoredTags({ useAi: true })
    if (summary.updatedCount <= 0) return

    reloadQuizList()
    sourceQuizList.value = applyRuntimeState(sourceQuizList.value, runtimeBefore)
    selectedTag.value = tagRibbonTags.value.includes(selectedBefore)
      ? selectedBefore
      : tagRibbonTags.value[0] || DEFAULT_GENERAL_TAG
    applyFilter(preferredIndex)
  } finally {
    retagSyncing.value = false
  }
}

async function hydrateCollectionFromBackend() {
  const [bankSynced, tagSynced] = await Promise.all([
    hydrateQuestionBankFromBackend(),
    hydrateUserTagsFromBackend(),
  ])

  if (!bankSynced && !tagSynced) return

  const selectedBefore = selectedTag.value
  const preferredIndex = currentIndex.value
  const runtimeBefore = snapshotRuntimeState(sourceQuizList.value)
  reloadQuizList()
  sourceQuizList.value = applyRuntimeState(sourceQuizList.value, runtimeBefore)
  selectedTag.value = tagRibbonTags.value.includes(selectedBefore)
    ? selectedBefore
    : tagRibbonTags.value[0] || DEFAULT_GENERAL_TAG
  applyFilter(preferredIndex)
  measureTagRibbonOverflow()
}

onShow(() => {
  safeTopPx.value = resolveStatusBarTopPadding()
  tabSafeWidth.value = resolveTabSafeWidth()
  syncFixedHeaderHeight()
  syncTagGuideDismissedState()
  reloadQuizList()
  restoreCollectionViewState()
  measureTagRibbonOverflow()
  void autoRetagQuestionsIfNeeded()
  void hydrateCollectionFromBackend()
})

onLoad(() => {
  tabSafeWidth.value = resolveTabSafeWidth()
  syncFixedHeaderHeight()
  uni.$on(USER_TAGS_CHANGED_EVENT, handleUserTagsChanged)
})

onHide(() => {
  finishTagDragSort()
  persistCollectionViewState()
})

onUnload(() => {
  finishTagDragSort()
  persistCollectionViewState()
  releaseTagScrollControl()
  uni.$off(USER_TAGS_CHANGED_EVENT, handleUserTagsChanged)
})

watch([activeTab, selectedTag, currentIndex], () => {
  persistCollectionViewState()
})

watch(sourceQuizList, () => {
  persistCollectionViewState()
}, { deep: true })

watch([() => shouldShowTagGuide.value, () => customOrderedTags.value.join('|')], () => {
  syncTagScrollPosition(0, { programmatic: true })
  measureTagRibbonOverflow()
  syncFixedHeaderHeight()
})
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
  color: #3c4043;
  font-family: 'MiSans', 'PingFang SC', -apple-system, 'SF Pro Text', sans-serif;
}

.collection-fixed-shell {
  position: fixed;
  top: 0;
  left: 50%;
  right: auto;
  width: 100%;
  max-width: 600px;
  transform: translateX(-50%);
  z-index: 1000;
  background: #FFFFFF;
  border-bottom: 1rpx solid #EEEEEE;
  box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.02);
}

.sticky-header-body {
  padding: 0 32rpx 14rpx;
  background: #FFFFFF;
}

.page-scroll {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  height: calc(100vh - 112rpx - env(safe-area-inset-bottom));
  min-height: 0;
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom);
  -webkit-overflow-scrolling: touch;
}

.page-root :deep(.oa-tab-wrap) {
  left: 50%;
  right: auto;
  width: 100%;
  max-width: 600px;
  transform: translateX(-50%);
}

.page-body {
  padding: 8rpx 32rpx 10rpx;
}

.tabs-header {
  width: 100%;
  margin-left: 0;
  height: 120rpx;
  border-bottom: 1rpx solid #E8EAED;
  background: #FFFFFF;
  padding: 0 32rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.filter-tabs {
  display: flex;
  justify-content: space-around;
  align-items: center;
  max-width: 100%;
  min-width: 360rpx;
  min-height: 120rpx;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  white-space: nowrap;
}

.filter-tab {
  flex: 1 1 0;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 120rpx;
  position: relative;
  padding-bottom: 0;
  font-family: 'MiSans', 'PingFang SC', -apple-system, 'SF Pro Text', sans-serif;
  font-size: 36rpx;
  line-height: 1;
  font-weight: 400;
  color: #70757A;
  text-align: center;
}

.filter-tab + .filter-tab {
  margin-left: 0;
}

.filter-tab::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 4rpx;
  border-radius: 999rpx;
  background: transparent;
}

.filter-tab.is-active {
  color: #1A1A1A;
  font-weight: 600;
}

.filter-tab.is-active::after {
  background: #07C160;
}

.tag-ribbon-row {
  margin-top: 12rpx;
  margin-bottom: 8rpx;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 60rpx;
  overflow: hidden;
  padding-right: 0;
  box-sizing: border-box;
}

.tag-ribbon-main {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  min-height: 60rpx;
  justify-content: flex-start;
}

.tag-ribbon-fixed {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 0 0 auto;
  min-height: 60rpx;
  margin-right: 24rpx;
}

.tag-ribbon-content {
  margin-left: 0;
  position: relative;
  min-height: 60rpx;
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.tag-scroll-shell {
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 60rpx;
}

.tag-scroll-view {
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  padding-right: 72rpx;
  box-sizing: border-box;
}

.tag-scroll-track {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  padding-right: 8rpx;
  position: relative;
}

.tag-scroll-track.is-sort-mode {
  cursor: grabbing;
}

.tag-scroll-pill {
  display: inline-flex;
  flex-shrink: 0;
  margin-right: 12rpx;
  transition: all var(--oa-fast-transition-duration) ease;
}

.tag-scroll-pill:last-child {
  margin-right: 0;
}

.tag-scroll-pill.is-sortable.is-sort-shaking {
  animation: tag-shake 0.22s ease-in-out infinite;
}

.tag-scroll-pill.is-dragging {
  z-index: 5;
  pointer-events: none;
  box-shadow: 0 8rpx 22rpx rgba(0, 0, 0, 0.14);
}

.tag-scroll-view::-webkit-scrollbar {
  width: 0;
  height: 0;
  color: transparent;
}

.tag-scroll-fade {
  position: absolute;
  top: 0;
  right: 0;
  width: 60rpx;
  height: 100%;
  background: linear-gradient(to right, rgba(255, 255, 255, 0), #FFFFFF);
  pointer-events: none;
  z-index: 8;
}

.tag-scroll-arrow-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  line-height: 1;
  color: #999999;
  background: rgba(255, 255, 255, 0.95);
  border: 1rpx solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.06);
  z-index: 12;
}

.tag-scroll-arrow-btn.is-left {
  left: 6rpx;
}

.tag-scroll-arrow-btn.is-right {
  right: 14rpx;
}

.tag-scroll-fade,
.tag-scroll-arrow-btn {
  opacity: 1;
  transition: opacity 0.2s ease;
}

.tag-scroll-fade.is-hidden,
.tag-scroll-arrow-btn.is-hidden {
  opacity: 0;
  pointer-events: none;
}

@keyframes tag-shake {
  0%,
  100% {
    transform: rotate(-1.8deg);
  }
  50% {
    transform: rotate(1.8deg);
  }
}

.tag-guide-inline {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 56rpx;
  overflow: visible;
}

.tag-guide-text {
  display: flex;
  align-items: center;
  width: 100%;
  height: 56rpx;
  font-size: 24rpx;
  line-height: 56rpx;
  color: #8E8E93;
  white-space: nowrap;
}

.tag-guide-link {
  font-size: 24rpx;
  color: #07C160;
  font-weight: 600;
}

.tag-pill {
  position: relative;
  height: 56rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  background: #F7F8FA;
  color: #3C4043;
  font-size: 26rpx;
  line-height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: transform 0.12s ease, background-color 0.2s ease, color 0.2s ease;
}

.tag-pill:active {
  transform: scale(0.96);
}

.tag-pill.is-active {
  background: #F0F9F4;
  color: #07C160;
}

.tag-pill.is-active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 4rpx;
  width: 24rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: #07C160;
  transform: translateX(-50%);
}

.study-dashboard {
  height: 60rpx;
  margin-top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 0;
}

.study-dashboard-block {
  margin-top: 8rpx;
  margin-bottom: 12rpx;
}

.dashboard-left {
  font-size: 24rpx;
  line-height: 1.2;
  color: #70757A;
  margin-left: 0;
  padding-left: 0;
}

.dashboard-right-wrap {
  display: flex;
  align-items: center;
  gap: 0;
}

.dashboard-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 32rpx;
  font-size: 24rpx;
  line-height: 1.2;
  color: #FA5151;
  letter-spacing: 1rpx;
}

.dashboard-clear-btn-hover {
  opacity: 0.6;
}

.dashboard-clear-icon {
  margin-right: 8rpx;
  width: 28rpx;
  height: 28rpx;
  flex: 0 0 28rpx;
  display: block;
}

.dashboard-right {
  font-size: 24rpx;
  line-height: 1.2;
  color: #70757A;
}

.dashboard-right.is-practice {
  color: #07C160;
}

.dashboard-right.is-wrong {
  color: #FF7875;
  opacity: 0.8;
}

.dashboard-progress-track {
  width: 100%;
  height: 2rpx;
  margin-top: 10rpx;
  border-radius: 999rpx;
  background: transparent;
  overflow: hidden;
}

.dashboard-progress-fill {
  width: 0;
  height: 100%;
  border-radius: 999rpx;
  background: #07C160;
  transition: width 240ms ease;
}

.empty-zone {
  min-height: 60vh;
  margin-top: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  width: 100%;
  max-width: 540rpx;
  transform: translateY(-10%);
  padding: 48rpx 32rpx;
  border-radius: var(--oa-card-radius);
  background: var(--oa-card-bg);
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.empty-icon {
  width: 120rpx;
  height: 120rpx;
}

.empty-title {
  margin-top: 24rpx;
  font-size: 32rpx;
  line-height: 1.25;
  font-weight: 500;
  color: #1A1A1A;
}

.empty-subtitle {
  margin-top: 16rpx;
  font-size: 26rpx;
  line-height: 1.45;
  color: #8E8E93;
}

.empty-cta {
  margin-top: 60rpx;
  min-height: 76rpx;
  padding: 0 40rpx;
  border: 0;
  border-radius: 40rpx;
  background: #F0F9F4;
  color: #07C160;
  font-size: 28rpx;
  font-weight: 500;
  letter-spacing: 1rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-cta-hover {
  opacity: 0.86;
}

.viewer-zone {
  min-height: 700rpx;
  margin-top: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.card-shell {
  width: 100%;
  min-height: 700rpx;
  display: flex;
  align-items: stretch;
  justify-content: center;
  column-gap: 16rpx;
  box-sizing: border-box;
}

.arrow-panel {
  width: 72rpx;
  min-height: 700rpx;
  flex: 0 0 72rpx;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  position: relative;
  z-index: 4;
  box-sizing: border-box;
}

.arrow-circle {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: #ffffff;
  border: 1rpx solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 12rpx 26rpx rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(1);
  transition: transform 120ms ease;
  box-sizing: border-box;
}

.arrow-icon {
  font-size: 42rpx;
  line-height: 1;
  font-weight: 700;
  color: #3C4043;
  transform: translateY(-1rpx);
}

.arrow-icon.is-active {
  color: #07C160;
}

.arrow-panel.is-active .arrow-circle {
  transform: scale(1.06);
  border-color: rgba(7, 193, 96, 0.55);
  background: rgba(7, 193, 96, 0.08);
}

.quiz-card {
  width: 100%;
  min-width: 0;
  min-height: 700rpx;
  border: 0;
  border-radius: var(--oa-card-radius);
  background: var(--oa-card-bg);
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.04);
  padding: 20rpx 40rpx 40rpx;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
}

.quiz-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.quiz-meta-item {
  font-size: 24rpx;
  line-height: 1.2;
  color: #8E8E93;
}

.question-block {
  margin-bottom: 32rpx;
  font-size: 36rpx;
  font-weight: 500;
  line-height: 1.6;
  color: #1A1A1A;
  word-break: break-all;
}

.option-item {
  margin-top: 0;
  border: 1rpx solid var(--oa-card-border-color);
  border-radius: var(--oa-card-radius);
  min-height: 74rpx;
  padding: 12rpx 14rpx;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  background: var(--oa-card-bg);
}

.option-item + .option-item {
  margin-top: 24rpx;
}

.option-item.is-locked {
  opacity: 0.9;
}

.option-item.is-correct {
  border: 2rpx solid #07c160;
  background: #f0f9f4;
}

.option-item.is-wrong {
  border: 2rpx solid #fa5151;
  background: #fff6f6;
}

.option-key {
  width: 48rpx;
  flex: 0 0 auto;
  font-size: 30rpx;
  font-weight: 400;
  color: #3c4043;
  line-height: 1.6;
}

.option-text {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
  font-weight: 400;
  line-height: 1.6;
  color: #3c4043;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.analysis-wrap {
  max-height: 0;
  margin-top: 0;
  opacity: 0;
  overflow: hidden;
  transform: translateY(-8rpx);
  transition: max-height 260ms ease, opacity 220ms ease, transform 220ms ease, margin-top 260ms ease;
}

.analysis-wrap.is-visible {
  max-height: 4000rpx;
  opacity: 1;
  transform: translateY(0);
  margin-top: 24rpx;
}

.analysis-title {
  font-size: 24rpx;
  font-weight: 600;
  color: #3c4043;
}

.analysis-text {
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #3c4043;
  word-break: break-all;
}

.mastered-actions {
  margin-top: 24rpx;
  display: flex;
  align-items: center;
}

.analysis-actions {
  margin-top: 20rpx;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16rpx;
}

.master-add-btn,
.master-remove-btn {
  min-height: 64rpx;
  padding: 0 20rpx;
  border-radius: 16rpx;
  font-size: 26rpx;
  line-height: 1.2;
  display: flex;
  align-items: center;
}

.master-add-btn {
  background: #F0F9F4;
  color: #1A1A1A;
}

.master-add-prefix {
  color: #666666;
}

.master-add-emphasis {
  color: #07C160;
}

.master-remove-btn {
  background: #fff6f6;
  color: #FA5151;
}

.next-btn {
  width: 180rpx;
  min-height: 64rpx;
  border: 1rpx solid var(--oa-card-border-color);
  border-radius: var(--oa-card-radius);
  background: var(--oa-card-bg);
  color: #07C160;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 320;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 48rpx;
}

.clear-modal {
  width: 100%;
  background: #FFFFFF;
  border-radius: 24rpx;
  overflow: hidden;
}

.clear-modal-title {
  display: block;
  padding: 52rpx 48rpx 0;
  text-align: center;
  font-size: 32rpx;
  line-height: 1.35;
  font-weight: 700;
  color: #1A1A1A;
}

.clear-modal-content {
  display: block;
  padding: 28rpx 48rpx 44rpx;
  text-align: center;
  font-size: 24rpx;
  line-height: 1.7;
  color: #666666;
}

.clear-modal-actions {
  display: flex;
  align-items: stretch;
  border-top: 1rpx solid #F1F1F1;
}

.clear-modal-btn {
  flex: 1;
  min-height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  line-height: 1;
  background: #FFFFFF;
}

.clear-modal-btn.is-cancel {
  color: #999999;
  font-weight: 500;
}

.clear-modal-btn.is-confirm {
  color: #07C160;
  font-weight: 700;
  border-left: 1rpx solid #F1F1F1;
}

</style>
