import type { Locator, Page } from '@playwright/test'
import { BASE_URL } from '../../env'
import { grantAdmin2fa, signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser, type TestUser } from '../../fixtures/users'

// Pessoas do Houdini (antes /internal/manage-users, WEB-181). Sumir, trocar
// role e entrar na pele mudam sessão e conta, então cada teste entra com um
// admin próprio (com 2FA, que o Houdini e o servidor exigem) e age sobre um
// usuário próprio — nunca sobre as sessões prontas do setup.

const uniqueName = (prefix: string) =>
  `${prefix} ${crypto.randomUUID().slice(0, 8)}`

/** Busca a pessoa pelo e-mail e abre o dossiê dela. */
async function openPerson(page: Page, user: TestUser) {
  await page.goto('/houdini/pessoas')
  await page.getByPlaceholder('Nome, e-mail ou id').fill(user.email)
  const row = page.getByRole('row').filter({ hasText: user.email })
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: user.name }).click()
  const dossie = page.getByRole('complementary', { name: 'Dossiê' })
  await expect(
    dossie.getByRole('heading', { name: user.name, exact: true })
  ).toBeVisible()
  return { row, dossie }
}

/** O `HoldButton`: segurar Enter por mais de um segundo confirma. */
async function hold(page: Page, button: Locator, ms = 1_400) {
  await button.focus()
  await page.keyboard.down('Enter')
  await page.waitForTimeout(ms)
  await page.keyboard.up('Enter')
}

function peleBanner(page: Page) {
  return page.getByRole('status').filter({ hasText: 'Você está na pele de' })
}

// A faixa vem no HTML do servidor (WEB-196), mas o componente é `lazy` no
// `__root.tsx`: o `html[data-hydrated]` sai quando a raiz hidrata, e a faixa
// segue HTML morto até o módulo dela chegar. Clique nesse intervalo o React
// descarta (WEB-402). O relógio só sai de "--:--" no efeito da própria faixa.
async function waitForBanner(page: Page) {
  await expect(
    peleBanner(page).getByRole('timer', { name: 'Tempo na pele' })
  ).not.toHaveText('--:--')
}

let admin: TestUser
test.beforeEach(async ({ page }) => {
  admin = await createUser({ role: 'admin', name: uniqueName('Admin') })
  await signIn(page, admin)
  await grantAdmin2fa(page, admin.email)
})

test('sumir com motivo bloqueia o login, vai ao Grimório; trazer de volta libera', async ({
  page,
  request
}) => {
  const target = await createUser({ name: uniqueName('Sumível') })
  const signInTarget = () =>
    request.post('/api/auth/sign-in/email', {
      data: { email: target.email, password: target.password },
      headers: { origin: BASE_URL }
    })

  const { row, dossie } = await openPerson(page, target)
  await expect(row).toContainText('presente')

  await dossie.getByLabel('Motivo, até 500 caracteres').fill('Spam em reservas')
  await hold(page, dossie.getByRole('button', { name: 'Segure para sumir' }))

  await expect(page.getByText(`${target.name} sumiu.`)).toBeVisible()
  await expect(row).toContainText('sumiu')
  await expect(dossie).toContainText('Spam em reservas')
  const banned = await signInTarget()
  expect(banned.ok()).toBe(false)
  expect(await banned.text()).toMatch(/banned/i)

  await dossie.getByRole('button', { name: 'Trazer de volta' }).click()
  await expect(page.getByText(`${target.name} voltou.`)).toBeVisible()
  await expect(row).toContainText('presente')
  const unbanned = await signInTarget()
  expect(unbanned.ok(), await unbanned.text()).toBe(true)

  // WEB-384: os dois truques ficam escritos, com quem fez e o motivo.
  await page.goto('/houdini/grimorio')
  await page.getByRole('button', { name: 'Sumiços' }).click()
  const sumiu = page
    .getByRole('article')
    .filter({ hasText: `sumiu com ${target.email}` })
  await expect(sumiu).toContainText(admin.name)
  await expect(sumiu).toContainText('motivo: Spam em reservas')
  await expect(
    page.getByRole('article').filter({ hasText: `trouxe ${target.email}` })
  ).toContainText(admin.name)
})

test('soltar antes do tempo não some com ninguém', async ({ page }) => {
  const target = await createUser({ name: uniqueName('Quase sumido') })
  const { row, dossie } = await openPerson(page, target)

  await hold(
    page,
    dossie.getByRole('button', { name: 'Segure para sumir' }),
    300
  )
  // Mais que o segundo do botão: se fosse disparar, já teria disparado.
  await page.waitForTimeout(1_200)

  await expect(row).toContainText('presente')
  const [user] = await query('SELECT banned FROM "user" WHERE id = $1', [
    target.id
  ])
  expect(user?.banned).not.toBe(true)
})

test('trocar a role de torcedor para bar', async ({ page }) => {
  const target = await createUser({ name: uniqueName('Muda role') })
  const { row, dossie } = await openPerson(page, target)
  await expect(row.getByRole('cell', { name: 'Torcedor' })).toBeVisible()

  await dossie
    .getByRole('group', { name: 'Novo papel' })
    .getByRole('button', { name: 'Bar', exact: true })
    .click()
  await dossie.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText(`${target.name} agora é Bar.`)).toBeVisible()
  await expect(
    row.getByRole('cell', { name: 'Bar', exact: true })
  ).toBeVisible()
  const [user] = await query('SELECT role FROM "user" WHERE id = $1', [
    target.id
  ])
  expect(user?.role).toBe('pub')
})

test('o dossiê do próprio admin não tem truques', async ({ page }) => {
  const { dossie } = await openPerson(page, admin)
  await expect(dossie).toContainText('É você.')
  await expect(
    dossie.getByRole('button', { name: 'Entrar na pele' })
  ).toHaveCount(0)
  await expect(
    dossie.getByRole('button', { name: 'Segure para sumir' })
  ).toHaveCount(0)
})

test('entrar na pele de torcedor mostra a faixa; tirar a pele volta a Pessoas', async ({
  page
}) => {
  const target = await createUser({ name: uniqueName('Torcedor alvo') })
  const { dossie } = await openPerson(page, target)
  await dossie.getByRole('button', { name: 'Entrar na pele' }).click()

  // O web não tem tela de torcedor: a pele dele cai na página do app.
  await expect(page).toHaveURL(/\/torcedor$/)
  await waitForBanner(page)
  const banner = peleBanner(page)
  await expect(banner).toContainText(target.name)
  await expect(banner).toContainText(target.email)

  // A sessão é de fato a do alvo, não um rótulo por cima da do admin.
  const session = await page.request.get('/api/auth/get-session')
  expect((await session.json()).user.email).toBe(target.email)

  await banner.getByRole('button', { name: 'Tirar a pele' }).click()
  await expect(page).toHaveURL(/\/houdini\/pessoas$/)
  await expect(banner).toHaveCount(0)
  const back = await page.request.get('/api/auth/get-session')
  expect((await back.json()).user.role).toBe('admin')
})

test('entrar na pele de dono de bar abre o painel do bar', async ({ page }) => {
  const { user: owner } = await createPub({
    user: { name: uniqueName('Dono alvo') }
  })
  const { dossie } = await openPerson(page, owner)
  await dossie.getByRole('button', { name: 'Entrar na pele' }).click()

  await expect(page).toHaveURL(/\/admin$/)
  await waitForBanner(page)
  const banner = peleBanner(page)
  await expect(banner).toContainText(owner.name)

  await banner.getByRole('button', { name: 'Tirar a pele' }).click()
  await expect(page).toHaveURL(/\/houdini\/pessoas$/)
  await expect(banner).toHaveCount(0)
})

// WEB-390: a pele começa em "Só olhar", e quem recusa a escrita é o servidor.
test('na pele em Só olhar a escrita é recusada; em Pode agir passa', async ({
  page
}) => {
  const target = await createUser({ name: uniqueName('Só olhar') })
  const { dossie } = await openPerson(page, target)
  await dossie.getByRole('button', { name: 'Entrar na pele' }).click()
  await expect(page).toHaveURL(/\/torcedor$/)
  await waitForBanner(page)

  const banner = peleBanner(page)
  const mode = banner.getByRole('group', { name: 'Modo' })
  await expect(mode.getByRole('button', { name: 'Só olhar' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(banner).toContainText('botões que gravam ficam travados')

  const rename = (name: string) =>
    page.request.post('/api/auth/update-user', {
      data: { name },
      headers: { origin: BASE_URL }
    })
  const storedName = async () =>
    (
      await query<{ name: string }>('SELECT name FROM "user" WHERE id = $1', [
        target.id
      ])
    )[0]?.name

  const refused = await rename('Renomeado na pele')
  expect(refused.status()).toBe(403)
  expect(await refused.text()).toContain('Só olhando')
  expect(await storedName()).toBe(target.name)

  await mode.getByRole('button', { name: 'Pode agir' }).click()
  await expect(mode.getByRole('button', { name: 'Pode agir' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  const allowed = await rename('Renomeado na pele')
  expect(allowed.ok(), await allowed.text()).toBe(true)
  expect(await storedName()).toBe('Renomeado na pele')
})

test('a busca acha usuário mais antigo que os 200 mais novos (WEB-193)', async ({
  page
}) => {
  const target = await createUser({ name: uniqueName('Veterano') })
  await query(`UPDATE "user" SET created_at = '2000-01-01' WHERE id = $1`, [
    target.id
  ])
  // 201 contas mais novas num INSERT só: a lista de 200 não chega ao alvo.
  const batch = crypto.randomUUID().slice(0, 8)
  await query(
    `INSERT INTO "user" (id, name, email)
     SELECT gen_random_uuid()::text, 'Lote ' || $1 || ' ' || i,
            'lote-' || $1 || '-' || i || '@e2e.test'
     FROM generate_series(1, 201) AS i`,
    [batch]
  )

  // Parte do nome, em caixa diferente: a busca é no servidor e sem caixa.
  await page.goto('/houdini/pessoas')
  await page
    .getByPlaceholder('Nome, e-mail ou id')
    .fill(target.name.toUpperCase())
  await expect(
    page.getByRole('row').filter({ hasText: target.email })
  ).toHaveCount(1)

  // E pelo e-mail, que é o caminho do suporte.
  await openPerson(page, target)
})
