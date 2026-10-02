import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { storageState } from '../../fixtures/auth'
import { lastEmailTo } from '../../fixtures/email'
import { expect, test } from '../../fixtures/test'
import {
  createWaitlistEntry,
  entryRow,
  uniqueTag,
  waitlistRow
} from './waitlist-entries'

// Painel /internal/waitlist (WEB-181). Cada teste cria as próprias inscrições
// com um prefixo único e filtra a tela por ele: contagens globais não servem,
// porque os outros workers inscrevem gente ao mesmo tempo.

test.use({ storageState: storageState('admin') })

const search = (page: Page) => page.getByLabel('Buscar inscritos')

test('busca e filtro por tipo isolam as inscrições', async ({ page }) => {
  const tag = uniqueTag('wl-busca')
  const fan = await createWaitlistEntry(tag, { role: 'fan' })
  const pub = await createWaitlistEntry(tag, { role: 'pub' })

  await page.goto('/internal/waitlist')
  await search(page).fill(tag)
  await expect(entryRow(page, fan.email)).toBeVisible()
  await expect(entryRow(page, pub.email)).toBeVisible()
  await expect(entryRow(page, pub.email)).toContainText(`Bar ${tag}`)
  await expect(page.getByText('Exibindo 2 de 2 registros')).toBeVisible()

  await page.getByRole('combobox', { name: 'Tipo', exact: true }).click()
  await page.getByRole('listbox').getByRole('option', { name: 'Bar' }).click()
  await expect(entryRow(page, pub.email)).toBeVisible()
  await expect(entryRow(page, fan.email)).toHaveCount(0)

  await search(page).fill(`${tag}-nada`)
  await expect(page.getByText('Nenhum inscrito encontrado.')).toBeVisible()
})

test('aprovar envia o convite; revogar volta a pendente', async ({ page }) => {
  const tag = uniqueTag('wl-aprova')
  const entry = await createWaitlistEntry(tag)

  await page.goto('/internal/waitlist')
  await search(page).fill(entry.email)
  const row = entryRow(page, entry.email)

  await row.getByRole('button', { name: 'Aprovar e convidar' }).click()
  await expect(page.getByText(`${entry.email} liberado.`)).toBeVisible()
  await expect(row.getByRole('button', { name: 'Revogar' })).toBeVisible()

  const invite = await lastEmailTo(entry.email, {
    subject: 'Seu convite para testar a Onside chegou'
  })
  expect(invite.link).toContain('/activate-invite')
  expect((await waitlistRow(entry.email))?.approved_at).not.toBeNull()

  await row.getByRole('button', { name: 'Revogar' }).click()
  await expect(
    page.getByText(`Acesso de ${entry.email} revogado.`)
  ).toBeVisible()
  await expect(
    row.getByRole('button', { name: 'Aprovar e convidar' })
  ).toBeVisible()
  expect((await waitlistRow(entry.email))?.approved_at).toBeNull()
})

test('inscrição sem confirmação não pode ser aprovada', async ({ page }) => {
  const entry = await createWaitlistEntry(uniqueTag('wl-pendente'), {
    confirmed: false
  })

  await page.goto('/internal/waitlist')
  await search(page).fill(entry.email)
  await expect(
    entryRow(page, entry.email).getByRole('button', {
      name: 'Aprovar e convidar'
    })
  ).toBeDisabled()
})

test('liberar quem não está na lista cria a inscrição e convida', async ({
  page
}) => {
  const email = `${uniqueTag('wl-direto')}@e2e.test`

  await page.goto('/internal/waitlist')
  await page.getByLabel('Liberar quem não está na lista').fill(email)
  await page.getByLabel('Tipo de conta').selectOption('fan')
  await page.getByRole('button', { name: 'Liberar', exact: true }).click()
  await expect(page.getByText(`${email} liberado por convite.`)).toBeVisible()

  const invite = await lastEmailTo(email, {
    subject: 'Seu convite para testar a Onside chegou'
  })
  expect(invite.link).toContain('/activate-invite')
  const row = await waitlistRow(email)
  expect(row?.role).toBe('fan')
  expect(row?.approved_at).not.toBeNull()

  await search(page).fill(email)
  await expect(
    entryRow(page, email).getByRole('button', { name: 'Revogar' })
  ).toBeVisible()
})

test('exporta em CSV o que a busca filtrou', async ({ page }) => {
  const tag = uniqueTag('wl-csv')
  const fan = await createWaitlistEntry(tag, { role: 'fan' })
  const pub = await createWaitlistEntry(tag, {
    role: 'pub',
    pubName: `Bar "${tag}"`
  })

  await page.goto('/internal/waitlist')
  await search(page).fill(tag)
  await expect(page.getByText('Exibindo 2 de 2 registros')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar CSV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^waitlist-\d{4}-\d{2}-\d{2}\.csv$/)
  await expect(page.getByText('2 registros exportados.')).toBeVisible()

  const lines = (await readFile(await file.path(), 'utf8')).split('\n')
  expect(lines[0]).toBe(
    '"ID","Email","Telefone","Tipo","Estabelecimento","Cidade","Data de inscrição"'
  )
  expect(lines).toHaveLength(3)
  expect(lines.find((l) => l.includes(fan.email))).toContain(
    `"${fan.id}","${fan.email}","","fan","","São Paulo"`
  )
  // Aspas do nome do bar escapadas como o CSV pede.
  expect(lines.find((l) => l.includes(pub.email))).toContain(
    `"pub","Bar ""${tag}""","São Paulo"`
  )
})
