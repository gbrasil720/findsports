import { randomUUID } from 'node:crypto'
import type { Locator, Page } from '@playwright/test'
import { MEDIA_PUBLIC_ORIGIN, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { interceptMediaUploads } from '../../fixtures/media'
import { createPub } from '../../fixtures/pubs'
import { createEvent } from '../../fixtures/reservations'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// "Meu espaço": edição do perfil, geocoding só quando o endereço muda
// (WEB-146), foto pelo upload direto para o R2, recursos pagos de um bar
// Elite, avaliações e prévia.

/** Bar com rua única: as consultas ao stub da LocationIQ são filtradas por ela. */
async function openProfile(page: Page) {
  const street = `Rua E2E ${randomUUID().slice(0, 8)}, 100`
  const pub = await createPub({ bar: { address: street } })
  await signIn(page, pub.user)
  await page.goto('/admin#admin-espaco')
  return { ...pub, street }
}

async function geocodedStreets(page: Page): Promise<string[]> {
  const response = await page.request.get(`${STUB_URL}/locationiq/calls`)
  return ((await response.json()) as { street: string }[]).map((c) => c.street)
}

const editor = (page: Page) => page.locator('#admin-profile-editor')

const pickPhoto = (page: Page, file: Parameters<Locator['setInputFiles']>[0]) =>
  editor(page).locator('input[type="file"]').setInputFiles(file)

/**
 * Erros não tratados da página, inclusive promessa rejeitada sem `catch`
 * (WEB-195): o Chromium os entrega como `pageerror`.
 */
function collectPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function save(page: Page) {
  const saved = page.waitForResponse(/pub\.updateMe/)
  await editor(page).getByRole('button', { name: 'Salvar' }).click()
  return saved
}

test('mudar só a descrição salva sem chamar o geocoding', async ({ page }) => {
  const { barId, street } = await openProfile(page)

  await editor(page).getByRole('button', { name: 'Editar perfil' }).click()
  await editor(page)
    .getByLabel('Descrição (opcional)')
    .fill('Telão de 100 polegadas e chope gelado.')
  expect((await save(page)).ok()).toBe(true)

  await expect(
    editor(page).getByText('Telão de 100 polegadas e chope gelado.')
  ).toBeVisible()
  const [bar] = await query('SELECT description FROM bar WHERE id = $1', [
    barId
  ])
  expect(bar?.description).toBe('Telão de 100 polegadas e chope gelado.')
  expect(await geocodedStreets(page)).not.toContain(street)
})

test('mudar o endereço geocodifica a rua nova e grava', async ({ page }) => {
  const { barId } = await openProfile(page)
  const newStreet = `Rua Nova E2E ${randomUUID().slice(0, 8)}, 42`

  await editor(page).getByRole('button', { name: 'Editar perfil' }).click()
  await editor(page).getByLabel('Endereço').fill(newStreet)
  expect((await save(page)).ok()).toBe(true)

  await expect(editor(page).getByText(newStreet)).toBeVisible()
  expect(await geocodedStreets(page)).toContain(newStreet)
  const [bar] = await query('SELECT address FROM bar WHERE id = $1', [barId])
  expect(bar?.address).toBe(newStreet)
})

// WEB-270: bar cadastrado antes do campo abre sem UF (e salva o resto sem ela,
// como o primeiro teste mostra); escolhê-la confere o endereço com o estado.
test('escolher a UF num bar sem UF geocodifica com o estado e grava', async ({
  page
}) => {
  const { barId, street } = await openProfile(page)

  await editor(page).getByRole('button', { name: 'Editar perfil' }).click()
  const uf = editor(page).getByLabel('Estado (UF)')
  await expect(uf).toHaveValue('')
  await uf.selectOption('SP')
  expect((await save(page)).ok()).toBe(true)

  const [bar] = await query('SELECT uf FROM bar WHERE id = $1', [barId])
  expect(bar?.uf).toBe('SP')
  const response = await page.request.get(`${STUB_URL}/locationiq/calls`)
  const calls = (await response.json()) as {
    street: string
    state: string | null
  }[]
  expect(calls.find((c) => c.street === street)?.state).toBe('São Paulo')
})

test('endereço que o geocoding não acha é recusado com a mensagem certa', async ({
  page
}) => {
  const pageErrors = collectPageErrors(page)
  const { barId, street } = await openProfile(page)

  await editor(page).getByRole('button', { name: 'Editar perfil' }).click()
  await editor(page).getByLabel('Endereço').fill('Rua inexistente, 1')
  expect((await save(page)).ok()).toBe(false)

  await expect(editor(page).getByRole('alert')).toHaveText(
    'Não encontramos esse endereço em São Paulo. Confira a rua, o número e a cidade.'
  )
  // O formulário continua aberto, e nada foi gravado.
  await expect(editor(page).getByLabel('Endereço')).toHaveValue(
    'Rua inexistente, 1'
  )
  const [bar] = await query('SELECT address FROM bar WHERE id = $1', [barId])
  expect(bar?.address).toBe(street)
  // A recusa já foi mostrada: não pode sobrar rejeição não tratada.
  expect(pageErrors).toEqual([])
})

test('telefone inválido é recusado no navegador, sem rejeição não tratada', async ({
  page
}) => {
  const pageErrors = collectPageErrors(page)
  const { barId } = await openProfile(page)
  let updates = 0
  page.on('request', (req) => {
    if (req.url().includes('pub.updateMe')) updates++
  })

  await editor(page).getByRole('button', { name: 'Editar perfil' }).click()
  await editor(page).getByLabel('Telefone').fill('11887654321')
  await editor(page).getByRole('button', { name: 'Salvar' }).click()

  await expect(editor(page).getByRole('alert')).toHaveText(
    'Celular deve começar com 9 depois do DDD. Confira o telefone.'
  )
  await expect(editor(page).getByLabel('Telefone')).toBeVisible()
  expect(updates).toBe(0)
  const [bar] = await query('SELECT phone FROM bar WHERE id = $1', [barId])
  expect(bar?.phone).toBeNull()
  expect(pageErrors).toEqual([])
})

test('geocoding fora do ar pede para tentar em instantes, sem culpar o endereço', async ({
  page
}) => {
  const { barId, street } = await openProfile(page)
  const newStreet = `Rua falha-geocoding ${randomUUID().slice(0, 8)}, 1`

  await editor(page).getByRole('button', { name: 'Editar perfil' }).click()
  await editor(page).getByLabel('Endereço').fill(newStreet)
  expect((await save(page)).ok()).toBe(false)

  await expect(editor(page).getByRole('alert')).toHaveText(
    'Não foi possível validar o endereço agora. Tente novamente em instantes.'
  )
  const [bar] = await query('SELECT address FROM bar WHERE id = $1', [barId])
  expect(bar?.address).toBe(street)
})

test('trocar a foto sobe para o R2 e grava a URL do bar', async ({ page }) => {
  const uploads = await interceptMediaUploads(page)
  const { barId } = await openProfile(page)

  const saved = page.waitForResponse(/pub\.updateMe/)
  await pickPhoto(page, {
    name: 'bar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    )
  })
  expect((await saved).ok()).toBe(true)

  expect(uploads).toEqual([
    { pathname: `bars/${barId}/photo`, contentType: 'image/png' }
  ])
  // `?v=` fura o cache da borda quando a foto é trocada no mesmo caminho.
  const [bar] = await query('SELECT photo_url FROM bar WHERE id = $1', [barId])
  expect(bar?.photo_url).toMatch(
    new RegExp(`^${MEDIA_PUBLIC_ORIGIN}/bars/${barId}/photo\\?v=\\d+$`)
  )
  await expect(
    editor(page).locator(`img[src="${bar?.photo_url}"]`)
  ).toBeVisible()
})

test('falha ao gravar a URL da foto aparece no avatar, sem rejeição não tratada', async ({
  page
}) => {
  const pageErrors = collectPageErrors(page)
  const uploads = await interceptMediaUploads(page)
  await page.route('**/api/trpc/pub.updateMe**', (route) => route.abort())
  const { barId } = await openProfile(page)

  await pickPhoto(page, {
    name: 'bar.png',
    mimeType: 'image/png',
    buffer: Buffer.from('e2e-image')
  })

  // O upload conclui; quem falha é a gravação da URL (WEB-212).
  await expect(editor(page).getByRole('alert')).toHaveText(
    'Erro ao fazer upload. Tente novamente.'
  )
  expect(uploads).toHaveLength(1)
  const [bar] = await query('SELECT photo_url FROM bar WHERE id = $1', [barId])
  expect(bar?.photo_url).toBeNull()
  expect(pageErrors).toEqual([])

  // A falha da foto é do avatar: abrir o formulário do perfil não a herda.
  await editor(page).getByRole('button', { name: 'Editar perfil' }).click()
  await expect(
    editor(page).getByRole('button', { name: 'Salvar' })
  ).toBeVisible()
  await expect(editor(page).getByRole('alert')).toHaveText([
    'Erro ao fazer upload. Tente novamente.'
  ])
})

test('foto em formato errado é recusada no navegador, sem upload', async ({
  page
}) => {
  const uploads = await interceptMediaUploads(page)
  await openProfile(page)

  await pickPhoto(page, {
    name: 'bar.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('GIF89a')
  })
  await expect(editor(page).getByRole('alert')).toHaveText(
    'Formato inválido. Use JPG, PNG ou WebP.'
  )
  expect(uploads).toEqual([])
})

for (const [name, mimeType] of [
  ['bar.jpg', 'image/jpeg'],
  ['bar.webp', 'image/webp']
] as const) {
  test(`foto ${mimeType} é aceita`, async ({ page }) => {
    const uploads = await interceptMediaUploads(page)
    const { barId } = await openProfile(page)

    const saved = page.waitForResponse(/pub\.updateMe/)
    await pickPhoto(page, {
      name,
      mimeType,
      buffer: Buffer.from('e2e-image')
    })
    expect((await saved).ok()).toBe(true)
    expect(uploads).toEqual([
      { pathname: `bars/${barId}/photo`, contentType: mimeType }
    ])
  })
}

test('foto acima de 5 MB é recusada no navegador, sem upload', async ({
  page
}) => {
  const uploads = await interceptMediaUploads(page)
  await openProfile(page)

  await pickPhoto(page, {
    name: 'grande.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1)
  })
  await expect(editor(page).getByRole('alert')).toHaveText(
    'Arquivo muito grande. Máximo 5MB.'
  )
  expect(uploads).toEqual([])
})

test('edita nome, telefone, comodidades e telas, e ativa o WhatsApp', async ({
  page
}) => {
  const { barId } = await openProfile(page)

  await editor(page).getByRole('button', { name: 'Editar perfil' }).click()
  await editor(page).getByLabel('Nome do bar').fill('Bar Renomeado E2E')
  await editor(page).getByLabel('Telefone').fill('11987654321')
  await editor(page).getByRole('button', { name: 'Telão / projetor' }).click()
  await editor(page).getByRole('button', { name: 'Área externa' }).click()
  await editor(page).getByLabel('Quantas telas?').fill('4')
  expect((await save(page)).ok()).toBe(true)

  await expect(
    editor(page).getByRole('heading', { name: 'Bar Renomeado E2E' })
  ).toBeVisible()
  const [bar] = await query(
    `SELECT name, phone, amenities, screen_count, phone_accepts_whatsapp
     FROM bar WHERE id = $1`,
    [barId]
  )
  expect(bar).toEqual({
    name: 'Bar Renomeado E2E',
    phone: '+5511987654321',
    amenities: expect.arrayContaining([1, 4]),
    screen_count: 4,
    phone_accepts_whatsapp: false
  })

  // Telefone novo fica pendente até o dono confirmar que é WhatsApp.
  const whatsapp = page.getByRole('article', { name: 'WhatsApp do bar' })
  await expect(whatsapp).toContainText('Pendente')
  await whatsapp.getByRole('button', { name: 'Ativar WhatsApp' }).click()
  await expect(whatsapp).toContainText('Contato disponível no perfil')
  const [after] = await query(
    'SELECT phone_accepts_whatsapp FROM bar WHERE id = $1',
    [barId]
  )
  expect(after?.phone_accepts_whatsapp).toBe(true)
})

test('Elite salva cardápio, preço médio e oferta, e liga e desliga reservas', async ({
  page
}) => {
  const { barId } = await openProfile(page)

  const menu = page.getByRole('region', { name: 'Cardápio e preço médio' })
  await menu
    .getByLabel(/Link do cardápio/)
    .fill('https://cardapio.e2e.test/menu')
  await menu.getByLabel(/Preço médio por pessoa/).fill('85,50')
  await menu.getByRole('button', { name: 'Salvar' }).click()
  await expect(menu.getByText('Cardápio e preço médio salvos.')).toBeVisible()

  const offer = page.getByRole('region', { name: 'Oferta da casa' })
  await offer
    .getByLabel('Sua oferta (opcional)')
    .fill('Chope em dobro no intervalo')
  await offer.getByRole('button', { name: 'Salvar oferta' }).click()
  await expect(offer.getByText('Oferta salva.')).toBeVisible()

  const intake = page.getByRole('switch', {
    name: 'Receber pedidos de reserva'
  })
  await intake.click()
  await expect(intake).toHaveAttribute('aria-checked', 'true')
  await expect(
    page.getByText('Recebimento ligado. O perfil já aceita pedidos de reserva.')
  ).toBeVisible()

  const [on] = await query(
    `SELECT menu_url, average_spend_cents, house_offer, accepts_reservations
     FROM bar WHERE id = $1`,
    [barId]
  )
  expect(on).toEqual({
    menu_url: 'https://cardapio.e2e.test/menu',
    average_spend_cents: 8550,
    house_offer: 'Chope em dobro no intervalo',
    accepts_reservations: true
  })

  await intake.click()
  await expect(intake).toHaveAttribute('aria-checked', 'false')
  await expect(
    page.getByText(
      'Recebimento desligado. Reservas já feitas continuam valendo.'
    )
  ).toBeVisible()
  const [off] = await query(
    'SELECT accepts_reservations FROM bar WHERE id = $1',
    [barId]
  )
  expect(off?.accepts_reservations).toBe(false)
})

test('painel de avaliações e prévia de como o torcedor vê', async ({
  page
}) => {
  const pub = await createPub()
  const { eventId } = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() - 2 * 86_400_000)
  })
  for (const wouldReturn of [true, false]) {
    const fan = await createUser()
    await insert('bar_rating', {
      id: randomUUID(),
      bar_id: pub.barId,
      actor_user_id: fan.id,
      event_id: eventId,
      would_return: wouldReturn
    })
  }
  await signIn(page, pub.user)
  await page.goto('/admin#admin-espaco')

  const ratings = page.getByRole('region', {
    name: 'Voltariam pra ver jogo aqui?'
  })
  await expect(ratings).toContainText('50%')
  // Duas avaliações, abaixo do piso público de 3: o dono é avisado.
  await expect(ratings).toContainText('Ainda não aparece para o torcedor')
  await expect(ratings).toContainText('falta 1')
  await expect(ratings.getByRole('listitem')).toHaveCount(2)

  // A seção mais interna com o título (a aba inteira também é `section`).
  const preview = page
    .locator('section', {
      has: page.getByRole('heading', { name: 'Como o torcedor vê' })
    })
    .last()
  await expect(preview).toContainText(`Bar E2E ${pub.barId.slice(0, 8)}`)
  await expect(preview).toContainText('Perfil')
  await expect(preview).not.toContainText('indisponível')
})
