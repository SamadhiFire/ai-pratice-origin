import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  estimateUsableCandidateCount,
  mergeKeypoints,
  normalizeKeypoints,
  normalizeQuestions,
  validateQuestionList,
} from '../src/utils/quiz-generation/parser-validator.ts'
import { finalizeQuestionSet } from '../src/utils/quiz-generation/fallback.ts'

type QuestionType = 'single' | 'multi'
type Difficulty = 'easy' | 'medium' | 'hard'

function parseArg(flag: string): string {
  const index = process.argv.indexOf(flag)
  if (index < 0 || index + 1 >= process.argv.length) return ''
  return process.argv[index + 1] || ''
}

function normalizePayload(raw: unknown): {
  keypoints: unknown[]
  questions: unknown[]
  request?: {
    type?: QuestionType
    difficulty?: Difficulty
    count?: number
    userTags?: string[]
  }
} {
  if (Array.isArray(raw)) {
    return { keypoints: [], questions: raw }
  }

  const payload = (raw || {}) as {
    keypoints?: unknown[]
    questions?: unknown[]
    output?: {
      keypoints?: unknown[]
      questions?: unknown[]
    }
    candidate?: {
      keypoints?: unknown[]
      questions?: unknown[]
    }
    request?: {
      type?: QuestionType
      difficulty?: Difficulty
      count?: number
      userTags?: string[]
    }
  }

  if (Array.isArray(payload.questions)) {
    return {
      keypoints: Array.isArray(payload.keypoints) ? payload.keypoints : [],
      questions: payload.questions,
      request: payload.request,
    }
  }

  if (payload.output && Array.isArray(payload.output.questions)) {
    return {
      keypoints: Array.isArray(payload.output.keypoints) ? payload.output.keypoints : [],
      questions: payload.output.questions,
      request: payload.request,
    }
  }

  if (payload.candidate && Array.isArray(payload.candidate.questions)) {
    return {
      keypoints: Array.isArray(payload.candidate.keypoints) ? payload.candidate.keypoints : [],
      questions: payload.candidate.questions,
      request: payload.request,
    }
  }

  throw new Error('未找到 questions 数组，支持的结构为 list / {questions} / {output:{questions}} / {candidate:{questions}}')
}

async function main(): Promise<void> {
  const inputPath = process.argv[2]
  if (!inputPath || inputPath.startsWith('--')) {
    throw new Error('Usage: node --experimental-strip-types scripts/validate-generated-payload.mts <file> [--type single|multi] [--difficulty easy|medium|hard] [--count N] [--tags tag1,tag2]')
  }

  const absolutePath = path.resolve(process.cwd(), inputPath)
  const raw = JSON.parse(await readFile(absolutePath, 'utf8'))
  const payload = normalizePayload(raw)
  const type = (parseArg('--type') || payload.request?.type || 'single') as QuestionType
  const difficulty = (parseArg('--difficulty') || payload.request?.difficulty || 'medium') as Difficulty
  const count = Math.max(1, Number(parseArg('--count') || payload.request?.count || 10))
  const userTags = (parseArg('--tags') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const finalUserTags = userTags.length > 0 ? userTags : (payload.request?.userTags || [])
  const keypoints = mergeKeypoints(normalizeKeypoints(payload.keypoints))
  const questions = normalizeQuestions(
    { questions: payload.questions },
    keypoints,
    type,
    difficulty,
    finalUserTags,
  )
  const usableCount = estimateUsableCandidateCount(questions, keypoints, type, difficulty)
  const finalQuestions = finalizeQuestionSet(questions, keypoints, type, count, difficulty, finalUserTags)
  const issues = validateQuestionList(finalQuestions)

  process.stdout.write(`file=${absolutePath}\n`)
  process.stdout.write(`normalized_questions=${questions.length}\n`)
  process.stdout.write(`usable_questions=${usableCount}\n`)
  process.stdout.write(`final_questions=${finalQuestions.length}\n`)

  if (issues.length > 0) {
    issues.forEach((issue) => {
      process.stdout.write(`- ${issue.questionId}: ${issue.messages.join(', ')}\n`)
    })
    process.exitCode = 1
    return
  }

  process.stdout.write('[OK] payload passes normalization and validation\n')
}

main().catch((error) => {
  process.stderr.write(`[FAIL] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
