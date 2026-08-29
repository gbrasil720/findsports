import { describe, expect, it } from 'bun:test'

import {
  avatarPathname,
  isOwnAvatarPathname,
  isOwnAvatarUrl
} from './blob-avatar'

const USER = 'user-123'
const OUTRO = 'user-999'
const HOST = 'https://loja-123.public.blob.vercel-storage.com'
const STORE_ID = 'loja-123'

describe('caminho do avatar', () => {
  it('aceita o caminho do próprio usuário', () => {
    expect(isOwnAvatarPathname(avatarPathname(USER), USER)).toBe(true)
  })

  it('recusa o caminho de outro usuário', () => {
    expect(isOwnAvatarPathname(avatarPathname(OUTRO), USER)).toBe(false)
  })
})

describe('URL do avatar', () => {
  it('aceita URL do nosso armazenamento na pasta do usuário', () => {
    expect(isOwnAvatarUrl(`${HOST}/users/${USER}/avatar`, USER, STORE_ID)).toBe(
      true
    )
  })

  it('recusa data URL e outro usuário', () => {
    expect(isOwnAvatarUrl('data:image/png;base64,AAA', USER, STORE_ID)).toBe(
      false
    )
    expect(
      isOwnAvatarUrl(`${HOST}/users/${OUTRO}/avatar`, USER, STORE_ID)
    ).toBe(false)
  })
})
