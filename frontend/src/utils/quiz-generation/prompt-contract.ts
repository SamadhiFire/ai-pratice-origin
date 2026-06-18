import type { PracticeMode } from '../question-bank'

export interface QuestionOutputContract {
  questionFields: string[]
  keypointFields: string[]
  optionFields: string[]
  optionCount: number
}

export interface ModePromptContract {
  mode: PracticeMode
  label: string
  summary: string
  extractionBoundary: string
  questionBoundary: string
  evidenceRule: string
  extensionRule: string
}

export const SHARED_OUTPUT_CONTRACT: QuestionOutputContract = {
  questionFields: [
    'id',
    'type',
    'stem',
    'tag',
    'options',
    'answer',
    'explanation',
    'evidence_quote',
    'keypoint_id',
    'difficulty',
  ],
  keypointFields: ['id', 'title', 'importance_score', 'evidence_quote'],
  optionFields: ['key', 'text'],
  optionCount: 4,
}

export const MODE_PROMPT_CONTRACTS: Record<PracticeMode, ModePromptContract> = {
  modeA: {
    mode: 'modeA',
    label: '模式A',
    summary: '严格基于材料，不得使用材料外知识。',
    extractionBoundary: '提取知识点时必须完全锚定用户材料，不得引入外部事实。',
    questionBoundary: '题目的正确答案必须能够被材料直接支持，不允许常识补全正确项。',
    evidenceRule: '优先保留原文证据，evidence_quote 需要能回溯到材料。',
    extensionRule: '禁止外部知识盖过材料本身。',
  },
  modeB: {
    mode: 'modeB',
    label: '模式B',
    summary: '允许补充与材料紧密相关的常识，但题目主干必须贴合材料。',
    extractionBoundary: '提取知识点时可以补充与材料强相关的常识，但材料仍是中心。',
    questionBoundary: '允许有限常识延展，但不能让外部知识主导题干或正确答案判断。',
    evidenceRule: '优先引用材料证据；若使用常识扩展，也必须保持与材料一致。',
    extensionRule: '外部知识只能作为贴边补充，不能偏离材料核心概念。',
  },
}
