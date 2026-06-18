import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  estimateUsableCandidateCount,
  mergeKeypoints,
  normalizeKeypoints,
  normalizeQuestions,
  validateQuestionList,
} from '../src/utils/quiz-generation/parser-validator.ts'
import { finalizeQuestionSet } from '../src/utils/quiz-generation/fallback.ts'

type PracticeMode = 'modeA' | 'modeB'
type QuestionType = 'single' | 'multi'
type Difficulty = 'easy' | 'medium' | 'hard'

interface GoldenCaseFixture {
  id: string
  description: string
  request: {
    material: string
    mode: PracticeMode
    type: QuestionType
    difficulty: Difficulty
    count: number
    userTags: string[]
  }
  candidate: {
    keypoints: unknown[]
    questions: unknown[]
  }
  expected: {
    minUsableCount: number
    finalCount: number
    requireUniqueStems?: boolean
    requireEvidence?: boolean
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function uniqueStemCount(questions: Array<{ stem: string }>): number {
  return new Set(questions.map((item) => item.stem.trim())).size
}

async function loadFixture(filePath: string): Promise<GoldenCaseFixture> {
  const content = await readFile(filePath, 'utf8')
  return JSON.parse(content) as GoldenCaseFixture
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const fixtureDir = path.resolve(scriptDir, '../tests/golden-cases')
  const fixtureFiles = (await readdir(fixtureDir))
    .filter((name) => name.endsWith('.json'))
    .sort()

  if (fixtureFiles.length === 0) {
    throw new Error(`No golden case fixtures found in ${fixtureDir}`)
  }

  for (const fileName of fixtureFiles) {
    const fixturePath = path.join(fixtureDir, fileName)
    const fixture = await loadFixture(fixturePath)
    const keypoints = mergeKeypoints(normalizeKeypoints(fixture.candidate.keypoints))
    const questions = normalizeQuestions(
      fixture.candidate,
      keypoints,
      fixture.request.type,
      fixture.request.difficulty,
      fixture.request.userTags,
    )
    const usableCount = estimateUsableCandidateCount(
      questions,
      keypoints,
      fixture.request.type,
      fixture.request.difficulty,
    )
    const finalQuestions = finalizeQuestionSet(
      questions,
      keypoints,
      fixture.request.type,
      fixture.request.count,
      fixture.request.difficulty,
      fixture.request.userTags,
    )
    const validationIssues = validateQuestionList(
      finalQuestions,
      fixture.expected.requireEvidence !== false,
    )

    assert(
      usableCount >= fixture.expected.minUsableCount,
      `[${fixture.id}] usableCount ${usableCount} < expected ${fixture.expected.minUsableCount}`,
    )
    assert(
      finalQuestions.length === fixture.expected.finalCount,
      `[${fixture.id}] finalCount ${finalQuestions.length} !== expected ${fixture.expected.finalCount}`,
    )
    if (fixture.expected.requireUniqueStems !== false) {
      assert(
        uniqueStemCount(finalQuestions) === finalQuestions.length,
        `[${fixture.id}] final question stems are not unique`,
      )
    }
    assert(
      validationIssues.length === 0,
      `[${fixture.id}] validation issues: ${validationIssues.map((item) => `${item.questionId}:${item.messages.join('|')}`).join('; ')}`,
    )

    process.stdout.write(
      `[OK] ${fixture.id} usable=${usableCount} final=${finalQuestions.length} ${fixture.description}\n`,
    )
  }
}

main().catch((error) => {
  process.stderr.write(`[FAIL] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
