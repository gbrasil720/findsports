import { describe, expect, test } from 'bun:test'
import {
  deriveSupportPriority,
  SUPPORT_PRIORITY_RANK
} from './support-priority'

describe('prioridade de suporte', () => {
  test('deriva a prioridade do plano sem aceitar plano ausente', () => {
    expect(deriveSupportPriority('starter')).toBe('standard')
    expect(deriveSupportPriority('pro')).toBe('priority')
    expect(deriveSupportPriority('elite')).toBe('highest')
    expect(deriveSupportPriority(null)).toBe('standard')
  })

  test('ordena Elite acima de Pro acima de Starter', () => {
    expect(SUPPORT_PRIORITY_RANK.highest).toBeLessThan(
      SUPPORT_PRIORITY_RANK.priority
    )
    expect(SUPPORT_PRIORITY_RANK.priority).toBeLessThan(
      SUPPORT_PRIORITY_RANK.standard
    )
  })
})
