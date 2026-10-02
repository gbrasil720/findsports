import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { OUTBOX_FILE } from '../env'
import { ROLE_USERS, signIn, storageState } from '../fixtures/auth'
import { clearRateLimits, query, resetAppConfig } from '../fixtures/db'
import { createPub } from '../fixtures/pubs'
import { test as setup } from '../fixtures/test'
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

for (const role of ['fan', 'pub', 'admin'] as const satisfies Role[]) {
  setup(`sessão de ${role}`, async ({ page }) => {
    const { email, password } = ROLE_USERS[role]
    await query('DELETE FROM "user" WHERE email = $1', [email])
    if (role === 'pub') await createPub({ user: { email, password } })
    else await createUser({ role, email, password })

    await signIn(page, { email, password })
    await page.context().storageState({ path: storageState(role) })
  })
}
