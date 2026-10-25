import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Falha passageira de rede no painel (WEB-460): o botão conta o que está
// acontecendo, a mutation segura tenta de novo sozinha, a outra pede
// "Tentar de novo" sem perder o rascunho, e a faixa de "sem conexão" some e
// relê a tela quando a rede volta.

async function openProfile(page: Page) {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')
  return pub
}

const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true })
const description = (page: Page) =>
  page
    .getByRole('region', { name: 'Informações', exact: true })
    .getByLabel('Descrição')

test('rede cai no meio de "Salvar alterações": o rascunho fica e "Tentar de novo" salva', async ({
  page
}) => {
  const { barId } = await openProfile(page)
  await description(page).fill('Telão novo e chope gelado.')

  // `pub.updateMe` não é segura de repetir: falha uma vez e espera a pessoa.
  await page.route(/\/api\/trpc\/pub\.updateMe/, (route) =>
    route.abort('internetdisconnected')
  )
  await button(page, 'Salvar alterações').click()

  await expect(button(page, 'Tentar de novo')).toBeEnabled()
  await expect(page.getByRole('main').getByRole('alert').first()).toHaveText(
    'Não foi possível salvar o perfil. Tente novamente.'
  )
  await expect(description(page)).toHaveValue('Telão novo e chope gelado.')

  await page.unroute(/\/api\/trpc\/pub\.updateMe/)
  await button(page, 'Tentar de novo').click()
  await expect(button(page, 'Salvo')).toBeVisible()
  await expect(button(page, 'Salvar alterações')).toBeDisabled()

  const [bar] = await query('SELECT description FROM bar WHERE id = $1', [
    barId
  ])
  expect(bar?.description).toBe('Telão novo e chope gelado.')
})

test('a mutation segura tenta de novo sozinha e o botão conta: "Tentando de novo…", depois "Salvo"', async ({
  page
}) => {
  const { barId } = await openProfile(page)
  const horario = page.getByRole('region', {
    name: 'Horário de funcionamento'
  })
  await horario.getByRole('button', { name: 'Informar horário' }).click()
  await horario.getByLabel('Sexta, fecha').fill('03:00')

  let cut = 1
  await page.route(/\/api\/trpc\/pub\.updateOpeningHours/, (route) =>
    cut-- > 0 ? route.abort('internetdisconnected') : route.continue()
  )
  // Mesma largura em toda a troca de rótulo: o "Descartar" não sai do lugar.
  const before = await button(page, 'Salvar alterações').boundingBox()
  await button(page, 'Salvar alterações').click()

  const retrying = button(page, 'Tentando de novo…')
  await expect(retrying).toBeVisible()
  expect((await retrying.boundingBox())?.width).toBe(before?.width)
  await expect(button(page, 'Salvo')).toBeVisible()
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)

  const [bar] = await query('SELECT opening_hours FROM bar WHERE id = $1', [
    barId
  ])
  expect(bar?.opening_hours?.[5]).toEqual({ opens: '17:00', closes: '03:00' })
})

test('sem conexão: a faixa aparece, "Salvar" espera a rede, e ao voltar salva e relê a tela', async ({
  page,
  context
}) => {
  const { barId } = await openProfile(page)
  const faixa = page.getByText(
    'Sem conexão. O painel se atualiza quando a rede voltar.'
  )
  await expect(faixa).toBeHidden()

  await context.setOffline(true)
  await expect(faixa.first()).toBeVisible()
  await description(page).fill('Salvo depois da queda.')
  await button(page, 'Salvar alterações').click()
  await expect(button(page, 'Esperando a rede…')).toBeVisible()

  const reread = page.waitForRequest(/\/api\/trpc\/[^?]*pub\.getMe/)
  await context.setOffline(false)
  await reread
  await expect(button(page, 'Salvo')).toBeVisible()
  await expect(faixa.first()).toBeHidden()

  const [bar] = await query('SELECT description FROM bar WHERE id = $1', [
    barId
  ])
  expect(bar?.description).toBe('Salvo depois da queda.')
})
