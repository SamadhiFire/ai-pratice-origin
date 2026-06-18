import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateQuestions } from '../src/utils/generate'

vi.mock('../src/utils/llm', () => {
  return {
    hasLlmConfig: () => true,
    chatCompletion: vi.fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          keypoints: [
            {
              id: 'k1',
              title: '测试要点',
              importance: 8,
              evidence_quote: '第一段证据：太阳中心发生核聚变释放能量，光以辐射形式传播。',
              why_important: '重要性说明',
            },
            {
              id: 'k2',
              title: '测试要点二',
              importance: 7,
              evidence_quote: '第二段证据：牛顿第三定律表明作用力与反作用力大小相等方向相反。',
              why_important: '重要性说明',
            },
            {
              id: 'k3',
              title: '测试要点三',
              importance: 6,
              evidence_quote: '第三段证据：水在标准大气压下于摄氏一百度沸腾，发生液气相变。',
              why_important: '重要性说明',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          questions: [
            {
              id: 'q1',
              type: 'single',
              stem: '根据证据片段，正确的说法是？',
              options: [
                { key: 'A', text: '太阳中心发生核聚变释放能量', isCorrect: true },
                { key: 'B', text: '错误干扰项1' },
                { key: 'C', text: '错误干扰项2' },
                { key: 'D', text: '错误干扰项3' },
              ],
              answer: 'A',
              explanation: '由证据直接推出',
              evidence_quote: '第一段证据：太阳中心发生核聚变释放能量，光以辐射形式传播。',
              keypoint_id: 'kp_0',
              difficulty: 'medium',
            },
          ],
        })
      ),
  }
})

describe('generateQuestions pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns valid questions when LLM outputs pass validation', async () => {
    const material = [
      '第一段证据：太阳中心发生核聚变释放能量，光以辐射形式传播。',
      '第二段证据：牛顿第三定律表明作用力与反作用力大小相等方向相反。',
      '第三段证据：水在标准大气压下于摄氏一百度沸腾，发生液气相变。',
      '为了达到预处理的最小长度要求，这里补充一些额外的文本用于凑字数，使材料整体长度超过阈值，以通过切块阶段并继续流水线的后续步骤。'
    ].join('\n\n')
    const result = await generateQuestions(material, 'material', 'single', 1, 'medium')
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error('Pipeline failed:', result.error)
    }
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.questions.length).toBeGreaterThan(0)
      const q = result.output!.questions[0]
      expect(q.type).toBe('single')
      expect(q.options?.some((o) => o.isCorrect)).toBe(true)
    }
  })
})
