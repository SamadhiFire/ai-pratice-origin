import type { PracticeMode } from './question-bank'
import { runLocalQuizGenerationPipeline, type PipelineRunOptions } from './quiz-generation/orchestrator'

export type { PipelineRunOptions } from './quiz-generation/orchestrator'

export async function runPipeline(
  material: string,
  type: 'single' | 'multi',
  count: number,
  difficulty: 'easy' | 'medium' | 'hard',
  mode: PracticeMode = 'modeA',
  userTags: string[] = [],
  options: PipelineRunOptions = {},
) {
  return runLocalQuizGenerationPipeline(material, type, count, difficulty, mode, userTags, options)
}
