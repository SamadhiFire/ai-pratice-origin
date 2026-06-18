export interface Keypoint {
  id: string
  title: string
  importance_score: number
  evidence_quote: string
  why_important: string
}

export interface QuestionOption {
  key: string
  text: string
  isCorrect?: boolean
}

export interface Question {
  id: string
  type: 'single' | 'multi'
  stem: string
  tag?: string
  options?: QuestionOption[]
  answer: string
  explanation?: string
  evidence_quote: string
  keypoint_id: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface GenerateResult {
  success: boolean
  error?: string
  output?: {
    keypoints: Keypoint[]
    questions: Question[]
  }
}
