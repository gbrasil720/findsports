import type { Page } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { trpc } from '../../fixtures/fan'
import { createEvent } from '../../fixtures/going'
import { createPub } from '../../fixtures/pubs'
import { answerCookieConsent, expect, test } from '../../fixtures/test'
import { base32Decode, totp } from '../../fixtures/two-factor'
import { createUser } from '../../fixtures/users'

// Configurações do painel do bar (2e/2f): conta, segurança, avisos por
// e-mail, privacidade e exclusão. A exclusão com assinatura está em
// `tests/auth/account.e2e.ts`.

async function open(page: Page) {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin/configuracoes')
  return pub
}

const secao = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true })

test('edita o nome do responsável', async ({ page }) => {
  const { user } = await open(page)
  const conta = secao(page, 'Conta e acesso')

  await expect(conta).toContainText(user.email)
  await expect(conta).toContainText('Somente leitura')
  await conta.getByRole('button', { name: 'Editar' }).click()
  await conta.getByLabel('Responsável').fill('Zé Carvalho')
  await conta.getByRole('button', { name: 'Salvar' }).click()

  await expect(conta).toContainText('Zé Carvalho')
  await expect(conta.getByRole('button', { name: 'Editar' })).toBeVisible()
  const [row] = await query('SELECT name FROM "user" WHERE id = $1', [user.id])
  expect(row?.name).toBe('Zé Carvalho')
})

test('troca a senha pelo diálogo', async ({ page }) => {
  const { user } = await open(page)

  await secao(page, 'Conta e acesso')
    .getByRole('button', { name: 'Alterar senha' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Alterar senha' })
  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog.getByLabel('Nova senha', { exact: true }).fill('outra-senha-123')
  await dialog.getByLabel('Confirmar nova senha').fill('outra-senha-123')
  await dialog.getByRole('button', { name: 'Salvar nova senha' }).click()

  await expect(
    page.getByText('Senha alterada. Os outros acessos foram encerrados.')
  ).toBeVisible()
  const old = await page.request.post('/api/auth/sign-in/email', {
    data: { email: user.email, password: user.password },
    headers: { origin: BASE_URL }
  })
  expect(old.ok()).toBe(false)
})

test('ativa a verificação em duas etapas', async ({ page }) => {
  const { user } = await open(page)
  const seguranca = secao(page, 'Segurança')

  await expect(seguranca).toContainText('Desativada')
  await seguranca.getByRole('button', { name: 'Ativar' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Ativar autenticação em dois fatores'
  })
  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  const key = (await dialog.locator('code').textContent())?.trim() ?? ''
  await page
    .locator('#two-factor-code')
    .pressSequentially(totp(base32Decode(key)))
  await dialog
    .getByRole('checkbox', { name: 'Guardei meus códigos em um lugar seguro' })
    .check()
  await dialog.getByRole('button', { name: 'Concluir' }).click()

  await expect(seguranca).toContainText('Ativada')
  await expect(
    seguranca.getByRole('button', { name: 'Gerenciar' })
  ).toBeVisible()
  const [row] = await query(
    'SELECT two_factor_enabled FROM "user" WHERE id = $1',
    [user.id]
  )
  expect(row?.two_factor_enabled).toBe(true)
})

test('encerra a outra sessão, e ela perde o acesso', async ({
  page,
  browser,
  extraHTTPHeaders
}) => {
  const { user } = await open(page)
  const other = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders
  })
  await answerCookieConsent(other)
  try {
    const otherPage = await other.newPage()
    await signIn(otherPage, user)
    await page.reload()

    const seguranca = secao(page, 'Segurança')
    await expect(seguranca).toContainText('2 dispositivos')
    await expect(seguranca.getByText('Este navegador')).toHaveCount(1)
    await seguranca.getByRole('button', { name: /^Encerrar (?!todas)/ }).click()
    await expect(page.getByText('Acesso encerrado.')).toBeVisible()
    await expect(seguranca).toContainText('1 dispositivo')
    await expect(
      seguranca.getByRole('button', { name: 'Encerrar todas as outras' })
    ).toHaveCount(0)

    await otherPage.goto('/admin')
    await expect(otherPage).toHaveURL(/\/login\?callbackUrl=/)
  } finally {
    await other.close()
  }
})

test('avisos por e-mail: cada interruptor grava na hora', async ({ page }) => {
  const { barId } = await open(page)
  const avisos = secao(page, 'Avisos')
  const chave = (name: string) => avisos.getByRole('switch', { name })
  const gravado = async () =>
    (
      await query(
        'SELECT notice_weekly_summary, notice_game_filling, notice_empty_schedule FROM bar WHERE id = $1',
        [barId]
      )
    )[0]

  // Os padrões do design (2b): resumo e jogo lotando ligados.
  await expect(avisos).toContainText('Novo')
  await expect(chave('Resumo semanal por e-mail')).toBeChecked()
  await expect(chave('Jogo lotando')).toBeChecked()
  await expect(chave('Grade vazia')).not.toBeChecked()
  // O celular segue para depois: o app ainda não abre por link.
  await expect(avisos).toContainText('em breve')

  await chave('Grade vazia').click()
  await chave('Resumo semanal por e-mail').click()
  await expect(chave('Grade vazia')).toBeChecked()
  await expect(chave('Resumo semanal por e-mail')).not.toBeChecked()
  await expect.poll(gravado).toEqual({
    notice_weekly_summary: false,
    notice_game_filling: true,
    notice_empty_schedule: true
  })

  await page.reload()
  await expect(chave('Grade vazia')).toBeChecked()
  await expect(chave('Resumo semanal por e-mail')).not.toBeChecked()
})

test('jogo lotando: quem passa de 20 manda o e-mail ao dono', async ({
  page
}) => {
  const { user, barId } = await createPub()
  const { eventId } = await createEvent(barId, {
    startsAt: new Date(Date.now() + 2 * 86_400_000),
    championship: 'Final E2E'
  })
  // Vinte já marcaram, direto no banco.
  for (let i = 0; i < 20; i++) {
    const fan = await createUser({ role: 'fan' })
    await query('INSERT INTO attendance (user_id, event_id) VALUES ($1, $2)', [
      fan.id,
      eventId
    ])
  }
  const fan = await createUser({ role: 'fan' })
  await signIn(page, fan)
  await trpc(page.request, 'attendance.set', { eventId, attending: true })

  const email = await lastEmailTo(user.email, {
    subject: 'Jogo lotando: Final E2E'
  })
  expect(email.text).toContain(
    'Mais de 20 pessoas marcaram na Onside que vão assistir a Final E2E no seu bar'
  )
  expect(email.link).toContain(`/admin/jogos?jogo=${eventId}`)
})

test('pede o arquivo e ele chega por e-mail, um por dia', async ({ page }) => {
  const { user } = await open(page)
  const privacidade = secao(page, 'Privacidade')
  await expect(privacidade).toContainText(
    'Um arquivo com os dados da conta e do bar, enviado por e-mail.'
  )

  await privacidade.getByRole('button', { name: 'Pedir arquivo' }).click()
  await expect(
    page.getByText(`Arquivo enviado para ${user.email}.`, { exact: false })
  ).toBeVisible()
  const email = await lastEmailTo(user.email, {
    subject: 'Seus dados da Onside'
  })
  expect(email.attachments).toEqual([
    expect.objectContaining({
      filename: expect.stringMatching(/^onside-meus-dados-.+\.json$/),
      contentType: 'application/json'
    })
  ])
  expect(email.text).toContain('Ele traz a conta, o bar, o plano e os jogos')

  // O segundo pedido no mesmo dia é recusado com a frase do servidor.
  await privacidade.getByRole('button', { name: 'Pedir arquivo' }).click()
  await expect(
    page.getByText('Você já pediu seus dados nas últimas 24 horas', {
      exact: false
    })
  ).toBeVisible()
})

test('excluir conta e bar pede senha e a frase', async ({ page }) => {
  const { user } = await open(page)

  await page.getByRole('button', { name: 'Excluir conta', exact: true }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Excluir conta permanentemente'
  })
  await dialog.getByLabel('Senha atual').fill(user.password)
  await dialog
    .getByLabel('Digite EXCLUIR MINHA CONTA')
    .fill('EXCLUIR MINHA CONTA')
  await dialog.getByRole('button', { name: 'Excluir permanentemente' }).click()

  await expect(page.getByText('Sua conta foi excluída.')).toBeVisible()
  expect(
    await query('SELECT 1 FROM "user" WHERE id = $1', [user.id])
  ).toHaveLength(0)
})
