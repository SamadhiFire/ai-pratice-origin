import { runPipeline } from './pipeline'
import type { PracticeMode } from './question-bank'

export async function generateQuestions(
  material: string,
  _sourceType: 'material',
  type: 'single' | 'multi',
  count: number,
  difficulty: 'easy' | 'medium' | 'hard',
  mode: PracticeMode = 'modeA',
  userTags: string[] = [],
) {
  return runPipeline(material, type, count, difficulty, mode, userTags)
}
