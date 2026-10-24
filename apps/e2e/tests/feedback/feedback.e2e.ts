import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { lastEmailTo } from '../../fixtures/email'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// "Enviar feedback" no menu da conta do painel do bar. Todo feedback vai para
// a mesma caixa: cada teste acha o seu e-mail por um código no assunto.

const INBOX = 'contato@onside.sh'

/** PNG de 1×1, válido: o navegador abre e o servidor reconhece pelos bytes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

const menuButton = (page: Page) =>
  page.getByRole('button', { name: /^Menu da conta de / })

async function openFeedback(page: Page) {
  await menuButton(page).click()
  await page.getByRole('menuitem', { name: 'Enviar feedback' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar feedback' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('bar envia feedback com imagem e o e-mail chega com o anexo', async ({
  page
}) => {
  const barName = `Bar Anexo ${randomUUID().slice(0, 8)}`
  const { user } = await createPub({ bar: { name: barName } })
  const code = randomUUID().slice(0, 8)
  await signIn(page, user)
  await page.goto('/admin')

  const dialog = await openFeedback(page)
  const send = dialog.getByRole('button', { name: 'Enviar' })
  const field = dialog.getByLabel('O que você quer contar pra gente?')
  await field.fill('curto')
  await expect(send).toBeDisabled()
  await field.fill(`Teste ${code}: o mapa demorou para abrir.`)

  // A segunda só tem nome de imagem: fica de fora, com aviso.
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: 'tela.png', mimeType: 'image/png', buffer: PNG },
    { name: 'notas.png', mimeType: 'image/png', buffer: Buffer.from('texto') }
  ])
  const attached = dialog.getByRole('list', { name: 'Imagens anexadas' })
  await expect(attached.getByRole('listitem')).toHaveCount(1)
  await expect(attached.getByText('tela.png')).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveText(
    'Não conseguimos abrir "notas.png". Tente outra imagem.'
  )

  await send.click()
  await expect(page.getByText('Recebemos. Obrigado por contar.')).toBeVisible()

  const email = await lastEmailTo(INBOX, { subject: new RegExp(code) })
  expect(email.subject).toBe(
    `Feedback de bar (${barName}): Teste ${code}: o mapa demorou para abrir.`
  )
  expect(email.replyTo).toBe(user.email)
  expect(email.text).toContain(`\nE-mail: ${user.email}\n`)
  expect(email.text).toMatch(/\nPágina: http:\/\/127\.0\.0\.1:\d+\/admin\n/)
  expect(email.attachments).toEqual([
    { filename: 'imagem-1.png', contentType: 'image/png', size: PNG.length }
  ])

  await page.getByRole('button', { name: 'Fechar' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(menuButton(page)).toBeFocused()
})

test('bar envia feedback pelo painel e o assunto leva o nome do bar', async ({
  page
}) => {
  const barName = `Bar Feedback ${randomUUID().slice(0, 8)}`
  const { user } = await createPub({ bar: { name: barName } })
  const code = randomUUID().slice(0, 8)
  await signIn(page, user)
  await page.goto('/admin')

  const dialog = await openFeedback(page)
  await dialog
    .getByLabel('O que você quer contar pra gente?')
    .fill(`Teste ${code}: falta um campo.`)
  await dialog.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText('Recebemos. Obrigado por contar.')).toBeVisible()

  const email = await lastEmailTo(INBOX, { subject: new RegExp(code) })
  expect(email.subject).toBe(
    `Feedback de bar (${barName}): Teste ${code}: falta um campo.`
  )
  expect(email.replyTo).toBe(user.email)
  expect(email.attachments).toEqual([])
})

test('Esc fecha o diálogo e devolve o foco ao menu da conta', async ({
  page
}) => {
  await signIn(page, (await createPub()).user)
  await page.goto('/admin')

  await openFeedback(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(menuButton(page)).toBeFocused()
})
