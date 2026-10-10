import { randomBytes } from 'node:crypto'
import { query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { expect, test } from '../../fixtures/test'
import {
  heading,
  joinAndConfirm,
  joinWaitlist,
  SUBJECT,
  waitlistEmail,
  waitlistRow
} from '../../fixtures/waitlist'

// WEB-176: confirmação por e-mail e saída da lista. A inscrição pelo
// formulário da landing saiu com a landing v2 (WEB-333), que não tem lista
// de espera; aqui a inscrição entra pela API.

test('nova inscrição atualiza a mesma linha e mata o link anterior', async ({
  page
}) => {
  const email = waitlistEmail('update')
  await joinAndConfirm(page.request, { role: 'fan', email, city: 'Belém' })

  await joinWaitlist(page.request, { role: 'pub', email, city: 'Manaus' })
  const first = await lastEmailTo(email, { subject: SUBJECT.confirm })
  await joinWaitlist(page.request, { role: 'pub', email, city: 'Macapá' })
  // O envio é aguardado antes da resposta: o último do outbox já é o novo.
  const second = await lastEmailTo(email, { subject: SUBJECT.confirm })
  expect(second.link).not.toBe(first.link)

  // Até confirmar, vale o que já estava confirmado.
  expect(await waitlistRow(email)).toMatchObject({ role: 'fan', city: 'Belém' })

  await page.goto(first.link)
  await expect(heading(page)).toHaveText('Este link não vale mais')

  await page.goto(second.link)
  await expect(heading(page)).toHaveText('Inscrição confirmada')
  expect(await waitlistRow(email)).toMatchObject({
    role: 'pub',
    city: 'Macapá'
  })
  const rows = await query('SELECT 1 FROM waitlist_entries WHERE email = $1', [
    email
  ])
  expect(rows).toHaveLength(1)
})

test.describe('link de confirmação que não confirma', () => {
  test('incompleto: nem chega ao servidor', async ({ page }) => {
    await page.goto('/confirm-waitlist?token=curto')
    await expect(heading(page)).toHaveText('Esse link está incompleto')
    await expect(
      page.getByRole('link', { name: 'Voltar ao início' })
    ).toBeVisible()
  })

  test('desconhecido: link não vale', async ({ page }) => {
    await page.goto(
      `/confirm-waitlist?token=${randomBytes(32).toString('hex')}`
    )
    await expect(heading(page)).toHaveText('Este link não vale mais')
  })

  test('expirado: pede para preencher de novo', async ({ page }) => {
    const email = waitlistEmail('expired')
    await joinWaitlist(page.request, { role: 'fan', email })
    const { link } = await lastEmailTo(email, { subject: SUBJECT.confirm })
    await query(
      `UPDATE waitlist_entries
       SET confirmation_expires_at = now() - interval '1 minute'
       WHERE email = $1`,
      [email]
    )

    await page.goto(link)
    await expect(heading(page)).toHaveText('Seu link expirou')
    await expect(
      page.getByRole('link', { name: 'Preencher de novo' })
    ).toBeVisible()
    expect((await waitlistRow(email))?.confirmed_at).toBeNull()
  })

  test('falha de rede: o link continua valendo e dá para tentar de novo', async ({
    page
  }) => {
    const email = waitlistEmail('retry')
    await joinWaitlist(page.request, { role: 'fan', email })
    const { link } = await lastEmailTo(email, { subject: SUBJECT.confirm })

    await page.route('**/api/trpc/waitlist.confirm**', (route) => route.abort())
    await page.goto(link)
    await expect(heading(page)).toHaveText('Não conseguimos confirmar agora')

    await page.unroute('**/api/trpc/waitlist.confirm**')
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(heading(page)).toHaveText('Inscrição confirmada')
  })
})

test('sai da lista pelo link do e-mail de boas-vindas', async ({ page }) => {
  const email = waitlistEmail('leave')
  const leaveLink = await joinAndConfirm(page.request, { role: 'fan', email })
  const confirmLink = (await lastEmailTo(email, { subject: SUBJECT.confirm }))
    .link

  await page.goto(leaveLink)
  await expect(heading(page)).toHaveText('Sair da waitlist?')
  // Abrir o link não cancela nada: só o clique.
  expect((await waitlistRow(email))?.cancelled_at).toBeNull()

  await page.getByRole('button', { name: 'Confirmar saída' }).click()
  await expect(heading(page)).toHaveText('Você saiu da lista')
  expect((await waitlistRow(email))?.cancelled_at).toEqual(expect.any(Date))

  // O link de confirmação antigo agora conta que a pessoa saiu.
  await page.goto(confirmLink)
  await expect(heading(page)).toHaveText('Você saiu da waitlist')

  // E o de saída não sai duas vezes.
  await page.goto(leaveLink)
  await page.getByRole('button', { name: 'Confirmar saída' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Este link não é válido ou já expirou.'
  )
  await expect(
    page.getByRole('button', { name: 'Confirmar saída' })
  ).toHaveCount(0)
})

test('link de saída sem token não deixa confirmar', async ({ page }) => {
  await page.goto('/leave-waitlist')
  await expect(
    page.getByRole('button', { name: 'Confirmar saída' })
  ).toBeDisabled()
})
