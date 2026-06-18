import type { Question, QuestionOption } from '../types'

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalizeTextForCompare(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

export function normalizeQuestionTag(tag: unknown): string {
  const clean = String(tag || '').replace(/\s+/g, ' ').trim().slice(0, 12)
  if (!clean) return '综合'
  if (clean === '通用' || clean === '未分类') return '综合'
  return clean
}

export function normalizeOptionText(text: string, key?: string): string {
  let output = String(text || '').trim()
  if (!output) return ''

  const fallbackKey = String(key || '').trim().toUpperCase()
  if (fallbackKey) {
    const escapedKey = escapeRegex(fallbackKey)
    const keyPrefixPattern = new RegExp(
      `^[（(\\[]?\\s*${escapedKey}\\s*[)）\\]]?(?:\\s*[.．、:：-]\\s*|\\s+)`,
      'i',
    )
    output = output.replace(keyPrefixPattern, '')
  }

  output = output.replace(
    /^[（(\[]?\s*[A-D]\s*[)）\]]?(?:\s*[.．、:：-]\s*|\s+)/i,
    '',
  )

  return output.trim()
}

export function normalizeQuestionOptions(
  source: Array<{ key?: unknown; text?: unknown; content?: unknown; isCorrect?: unknown; correct?: unknown }> | undefined,
): QuestionOption[] | undefined {
  if (!Array.isArray(source)) return undefined

  return source
    .map((opt, idx) => {
      const key = String(opt?.key || OPTION_KEYS[idx] || String.fromCharCode(65 + idx)).toUpperCase()
      const text = normalizeOptionText(String(opt?.text ?? opt?.content ?? ''), key)
      return {
        key,
        text,
        isCorrect: Boolean(opt?.isCorrect ?? opt?.correct),
      }
    })
    .filter((opt) => opt.key && opt.text)
}

export function sortChoiceKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const indexA = OPTION_KEYS.indexOf(a as (typeof OPTION_KEYS)[number])
    const indexB = OPTION_KEYS.indexOf(b as (typeof OPTION_KEYS)[number])
    return (indexA >= 0 ? indexA : 99) - (indexB >= 0 ? indexB : 99)
  })
}

export function parseAnswerKeys(rawAnswer: string, options: Array<{ key: string; text: string }>): string[] {
  const source = String(rawAnswer || '').trim()
  if (!source) return []

  const optionKeySet = new Set(options.map((opt) => String(opt.key || '').trim().toUpperCase()).filter(Boolean))
  const output: string[] = []

  const push = (raw: string) => {
    const key = String(raw || '').trim().toUpperCase()
    if (!key || !optionKeySet.has(key) || output.includes(key)) return
    output.push(key)
  }

  const tokens = source.split(/[|/／,，;；、\s]+/g).map((item) => item.trim()).filter(Boolean)
  if (tokens.length > 1) {
    tokens.forEach((token) => {
      const letter = token.toUpperCase().match(/[A-D]/)?.[0]
      if (letter) {
        push(letter)
        return
      }

      const byText = options.find((opt) => normalizeTextForCompare(opt.text) === normalizeTextForCompare(token))
      if (byText) {
        push(byText.key)
      }
    })
  }

  if (output.length === 0) {
    const letters = source.toUpperCase().match(/[A-D]/g) || []
    letters.forEach((letter) => push(letter))
  }

  if (output.length === 0) {
    const byText = options.find((opt) => normalizeTextForCompare(opt.text) === normalizeTextForCompare(source))
    if (byText) {
      push(byText.key)
    }
  }

  return sortChoiceKeys(output)
}

export function normalizeStoredAnswerSignature(answer: string): string {
  const raw = String(answer || '').trim()
  if (!raw) return ''
  const letters = Array.from(new Set((raw.toUpperCase().match(/[A-Z]/g) || []))).sort()
  if (letters.length > 0) {
    return letters.join('')
  }
  return normalizeTextForCompare(raw)
}

export function buildQuestionSignature(question: Pick<Question, 'type' | 'stem' | 'answer'>): string {
  const stemSignature = normalizeTextForCompare(String(question.stem || ''))
  if (!stemSignature) return ''
  const answerSignature = normalizeStoredAnswerSignature(String(question.answer || ''))
  return `${question.type}:${stemSignature}:${answerSignature}`
}
