import { describe, expect, it } from 'bun:test'

import { PROFILE_USER_THROW, persistProfileUser } from './profile-user-update'

describe('persistência de nome, foto e raio', () => {
  it('pede ao cliente para lançar em resposta não-2xx', async () => {
    const chamadas: unknown[] = []
    const updateUser = async (input: unknown) => {
      chamadas.push(input)
      return { data: { name: 'Ana' }, error: null }
    }

    await persistProfileUser(updateUser, { name: 'Ana' })

    expect(chamadas).toEqual([{ name: 'Ana', fetchOptions: { throw: true } }])
    expect(PROFILE_USER_THROW.fetchOptions.throw).toBe(true)
  })

  it('não segue o caminho de sucesso quando o cliente lança', async () => {
    const erro = Object.assign(new Error('falhou'), {
      status: 500,
      statusText: 'Internal Server Error'
    })
    const updateUser = async () => {
      throw erro
    }

    await expect(
      persistProfileUser(updateUser, { searchRadiusKm: 5 })
    ).rejects.toBe(erro)
  })
})
