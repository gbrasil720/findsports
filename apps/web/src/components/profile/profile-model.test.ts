import { describe, expect, test } from 'bun:test'
import {
  getProfileTabFromHash,
  PROFILE_TABS,
  profileTabHash,
  profileTabPanelId
} from './profile-model'

describe('aba do perfil no hash da URL (WEB-293)', () => {
  test('cada aba volta do próprio hash', () => {
    expect(profileTabHash('Configurações')).toBe('#configuracoes')
    for (const tab of PROFILE_TABS) {
      expect(getProfileTabFromHash(profileTabHash(tab))).toBe(tab)
    }
  })

  test('hash vazio ou de outra coisa não troca de aba', () => {
    expect(getProfileTabFromHash('')).toBeNull()
    expect(getProfileTabFromHash('#main-content')).toBeNull()
    expect(getProfileTabFromHash('#admin-espaco')).toBeNull()
  })

  test('o hash não é id de painel, para o navegador não rolar a página', () => {
    for (const tab of PROFILE_TABS) {
      expect(profileTabHash(tab)).not.toBe(`#${profileTabPanelId(tab)}`)
    }
  })
})
