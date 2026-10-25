import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { OUTBOX_FILE } from '../env'
import {
  grantAdmin2fa,
  ROLE_USERS,
  signIn,
  storageState
} from '../fixtures/auth'
import { clearRateLimits, query, resetAppConfig } from '../fixtures/db'
import { createPub } from '../fixtures/pubs'
import { expect, test as setup } from '../fixtures/test'
import { createUser, type Role } from '../fixtures/users'

/**
 * Roda uma vez antes de `desktop` e `mobile`: zera o estado global que sobra
 * de rodada anterior e deixa uma sessão pronta por papel em `.auth/`.
 */
setup('estado global limpo', async () => {
  await clearRateLimits()
  await resetAppConfig()
  await mkdir(dirname(OUTBOX_FILE), { recursive: true })
  await writeFile(OUTBOX_FILE, '')
})

/**
 * Chama uma vez, em série, cada server function que o SSR usa, antes dos
 * workers paralelos (WEB-402). No `vite dev`, a primeira chamada de uma delas
 * importa o módulo dela; duas chamadas ao mesmo tempo nesse instante, e a
 * segunda recebe o módulo ainda pela metade: `getServerFnById` devolve
 * `undefined` e a rota quebra com "(intermediate value) is not a function"
 * (500 no Houdini; na página do bar o `.catch` do loader tira o cartão).
 * O build não tem isso: lá o resolver importa os módulos de antemão.
 *
 * O `getSession` da raiz já vem aquecido pela espera do `webServer` em `/`.
 * Server function nova chamada no SSR entra aqui, com uma rota que a chame.
 */
setup('server functions do SSR aquecidas', async ({ request }) => {
  for (const path of ['/houdini', '/pub/aquecimento']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
  }
})

for (const role of ['fan', 'pub', 'admin'] as const satisfies Role[]) {
  setup(`sessão de ${role}`, async ({ page }) => {
    const { email, password } = ROLE_USERS[role]
    await query('DELETE FROM "user" WHERE email = $1', [email])
    if (role === 'pub') await createPub({ user: { email, password } })
    else await createUser({ role, email, password })

    await signIn(page, { email, password })
    if (role === 'admin') await grantAdmin2fa(page, email)
    await page.context().storageState({ path: storageState(role) })
  })
}
