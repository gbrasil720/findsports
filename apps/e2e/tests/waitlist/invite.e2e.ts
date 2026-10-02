import { randomBytes } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'
import {
  adminWaitlist,
  joinAndConfirm,
  SUBJECT,
  waitlistEmail,
  waitlistRow
} from '../../fixtures/waitlist'

// WEB-176: convite da waitlist — aprovação, ativação da conta e os estados
// de um link de convite que não ativa.

const PASSWORD = 'senha-convite-123'
const heading = (page: Page) => page.getByRole('heading', { level: 1 })

async function fillActivation(page: Page, confirmation = PASSWORD) {
  await page.getByLabel('Nome completo').fill('Convidado E2E')
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirmar senha').fill(confirmation)
  await page.getByRole('button', { name: 'Criar senha e entrar' }).click()
}

async function admitted(email: string) {
  const [user] = await query<{ admitted_at: Date | null; role: string }>(
    'SELECT admitted_at, role FROM "user" WHERE email = $1',
    [email]
  )
  return user
}

test('convite direto de torcedor: ativa a conta e cai no onboarding', async ({
  page
}) => {
  const email = waitlistEmail('invite-fan')
  await adminWaitlist('invite', { email, role: 'fan' })
  const invite = await lastEmailTo(email, { subject: SUBJECT.invite })
  expect(invite.link).toContain('/activate-invite?token=')

  await page.goto(invite.link)
  await expect(heading(page)).toHaveText('Ative sua conta')
  await expect(page.getByLabel('E-mail do convite')).toHaveValue(email)
  await expect(page.getByLabel('E-mail do convite')).toBeDisabled()

  await fillActivation(page, 'outra-senha-123')
  await expect(page.getByRole('alert')).toHaveText(
    'As senhas precisam ser iguais.'
  )
  expect(await admitted(email)).toBeUndefined()

  await fillActivation(page)
  await expect(page).toHaveURL(/\/onboarding\/fan$/)
  expect(await admitted(email)).toEqual({
    admitted_at: expect.any(Date),
    role: 'fan'
  })
  expect((await waitlistRow(email))?.activated_at).toEqual(expect.any(Date))

  // Reabrir o convite usado manda para o login, não diz "inválido".
  await page.context().clearCookies()
  await page.goto(invite.link)
  await expect(heading(page)).toContainText('Você já está')
  await page.getByRole('link', { name: 'Entrar na minha conta' }).click()
  await expect(page).toHaveURL(/\/login$/)

  // A senha definida no convite entra.
  await signIn(page, { email, password: PASSWORD })
})

test('inscrito confirmado aprovado pelo admin ativa como bar', async ({
  page
}) => {
  const email = waitlistEmail('invite-pub')
  await joinAndConfirm(page.request, { role: 'pub', email, pubName: 'Bar X' })
  expect((await waitlistRow(email))?.approved_at).toBeNull()

  await adminWaitlist('setApproval', { email, approved: true })
  await page.goto((await lastEmailTo(email, { subject: SUBJECT.invite })).link)
  await fillActivation(page)
  await expect(page).toHaveURL(/\/onboarding\/pub$/)
  expect((await admitted(email))?.role).toBe('pub')
})

test('convite revogado depois de aberto recusa a ativação', async ({
  page
}) => {
  const email = waitlistEmail('invite-revoked')
  await adminWaitlist('invite', { email, role: 'fan' })
  await page.goto((await lastEmailTo(email, { subject: SUBJECT.invite })).link)
  await expect(heading(page)).toHaveText('Ative sua conta')

  await adminWaitlist('setApproval', { email, approved: false })
  await fillActivation(page)
  await expect(page.getByRole('alert')).toHaveText(
    'Este link não é válido ou já expirou.'
  )
  expect(await admitted(email)).toBeUndefined()
})

test('convite expirado: a pessoa pede outro e ativa pelo novo', async ({
  page
}) => {
  const email = waitlistEmail('invite-expired')
  await adminWaitlist('invite', { email, role: 'fan' })
  const old = await lastEmailTo(email, { subject: SUBJECT.invite })
  await query(
    `UPDATE waitlist_entries SET invite_expires_at = now() - interval '1 minute'
     WHERE email = $1`,
    [email]
  )

  await page.goto(old.link)
  await expect(heading(page)).toContainText('venceu o tempo')
  await page.getByRole('button', { name: 'Reenviar convite' }).click()
  await expect(heading(page)).toContainText('a caminho')

  const fresh = await lastEmailTo(email, { subject: SUBJECT.invite })
  expect(fresh.link).not.toBe(old.link)
  await page.goto(fresh.link)
  await fillActivation(page)
  await expect(page).toHaveURL(/\/onboarding\/fan$/)
})

test('quem saiu da lista abre o convite e lê que pediu para sair', async ({
  page
}) => {
  const email = waitlistEmail('invite-cancelled')
  const leaveLink = await joinAndConfirm(page.request, { role: 'fan', email })
  await adminWaitlist('setApproval', { email, approved: true })
  const invite = await lastEmailTo(email, { subject: SUBJECT.invite })

  await page.goto(leaveLink)
  await page.getByRole('button', { name: 'Confirmar saída' }).click()
  await expect(heading(page)).toHaveText('Você saiu da lista')

  await page.goto(invite.link)
  await expect(heading(page)).toContainText('pra sair')
  await expect(
    page.getByRole('link', { name: 'Entrar na lista de novo' })
  ).toHaveAttribute('href', '/#lista')
})

test('convite sem aprovação vigente mostra que ainda está na fila', async ({
  page
}) => {
  // Estado que só existe no banco hoje (desaprovar apaga o hash), mas a tela
  // trata: fixa a cópia para não virar "inválido" por engano.
  const email = waitlistEmail('invite-pending')
  await adminWaitlist('invite', { email, role: 'fan' })
  const { link } = await lastEmailTo(email, { subject: SUBJECT.invite })
  await query(
    'UPDATE waitlist_entries SET approved_at = NULL WHERE email = $1',
    [email]
  )

  await page.goto(link)
  await expect(heading(page)).toContainText('Ainda no banco')
})

for (const [name, token] of [
  ['desconhecido', randomBytes(32).toString('hex')],
  ['truncado', 'abc123']
] as const) {
  test(`link de convite ${name} é tratado como link quebrado`, async ({
    page
  }) => {
    await page.goto(`/activate-invite?token=${token}`)
    await expect(heading(page)).toContainText('Esse link não')
    await expect(
      page.getByRole('button', { name: 'Criar senha e entrar' })
    ).toHaveCount(0)
  })
}

test('conta já existente aprovada recebe acesso, não convite', async ({
  page
}) => {
  const user = await createUser({ admitted: false })
  await joinAndConfirm(page.request, { role: 'fan', email: user.email })
  await adminWaitlist('setApproval', { email: user.email, approved: true })

  const email = await lastEmailTo(user.email, {
    subject: SUBJECT.approvedExisting
  })
  expect(new URL(email.link).pathname).toBe('/login')
  expect((await admitted(user.email))?.admitted_at).toEqual(expect.any(Date))

  await signIn(page, user)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('conta sem acesso entra na lista pelo /access-pending e é liberada', async ({
  page
}) => {
  const user = await createUser({ admitted: false })
  await signIn(page, user)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/access-pending$/)
  await expect(page.getByLabel('E-mail')).toHaveValue(user.email)

  await page.getByLabel('Cidade').fill('Salvador')
  await page.getByRole('button', { name: 'Entrar na waitlist' }).click()
  await expect(
    page.getByText(`Você entrou na waitlist com o e-mail ${user.email}`)
  ).toBeVisible()
  // A sessão provou o e-mail: confirma na hora, sem link de confirmação.
  expect(await waitlistRow(user.email)).toMatchObject({
    city: 'Salvador',
    confirmed_at: expect.any(Date)
  })
  await lastEmailTo(user.email, { subject: SUBJECT.joined })

  await adminWaitlist('setApproval', { email: user.email, approved: true })
  await page.goto('/access-pending')
  await expect(page).toHaveURL(/\/dashboard$/)
})
