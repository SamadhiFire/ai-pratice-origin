import type { Keypoint, Question } from '../../types'
import { normalizeTextForCompare } from '../question-schema.ts'

export function compactText(text: string, maxLength = 80): string {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function uniqueTexts(list: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  for (const item of list) {
    const clean = String(item || '').trim()
    const signature = normalizeTextForCompare(clean)
    if (!clean || seen.has(signature)) continue
    seen.add(signature)
    output.push(clean)
  }

  return output
}

export function hashText(text: string): string {
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildMaterialSignature(material: string): string {
  const compacted = String(material || '').replace(/\s+/g, ' ').trim()
  const sample = compacted.length <= 2800
    ? compacted
    : `${compacted.slice(0, 2000)}|${compacted.slice(-800)}`

  return `${compacted.length}_${hashText(sample)}`
}

export function cloneKeypoints(list: Keypoint[]): Keypoint[] {
  return list.map((item) => ({ ...item }))
}

export function cloneQuestions(list: Question[]): Question[] {
  return list.map((item) => ({
    ...item,
    options: Array.isArray(item.options)
      ? item.options.map((opt) => ({ ...opt }))
      : item.options,
  }))
}

export function pickFirstSentence(text: string): string {
  const parts = String(text || '')
    .split(/[。！？!?；;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return String(text || '').trim()
  return parts.find((part) => part.length >= 8) || parts[0]
}

export function normalizeSignatureList(signatures: string[] | undefined): string[] {
  if (!Array.isArray(signatures) || signatures.length === 0) return []
  return signatures
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}
