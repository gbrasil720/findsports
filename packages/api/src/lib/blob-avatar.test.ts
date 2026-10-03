import { describe, expect, it } from 'bun:test'

import { avatarPathname, isOwnAvatarPathname } from './blob-avatar'

const USER = 'user-123'
const OUTRO = 'user-999'

describe('caminho do avatar', () => {
  it('aceita o caminho do próprio usuário', () => {
    expect(isOwnAvatarPathname(avatarPathname(USER), USER)).toBe(true)
  })

  it('recusa o caminho de outro usuário', () => {
    expect(isOwnAvatarPathname(avatarPathname(OUTRO), USER)).toBe(false)
  })
})
