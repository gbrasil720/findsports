import { randomUUID } from 'node:crypto'
import type { Locator, Page } from '@playwright/test'
import { MEDIA_PUBLIC_ORIGIN, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { createEvent } from '../../fixtures/going'
import { interceptMediaUploads } from '../../fixtures/media'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// "Meu espaço" (2c/2d): um formulário só, salvo por "Salvar alterações";
// geocoding só quando o endereço muda (WEB-146), foto pelo upload direto para
// o R2, recursos pagos de um bar Elite, avaliações e prévia.

/** Bar com rua única: as consultas ao stub da LocationIQ são filtradas por ela. */
async function openProfile(page: Page) {
  const street = `Rua E2E ${randomUUID().slice(0, 8)}, 100`
  const pub = await createPub({ bar: { address: street } })
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')
  return { ...pub, street }
}

async function geocodedStreets(page: Page): Promise<string[]> {
  const response = await page.request.get(`${STUB_URL}/locationiq/calls`)
  return ((await response.json()) as { street: string }[]).map((c) => c.street)
}

const info = (page: Page) =>
  page.getByRole('region', { name: 'Informações', exact: true })
const fotos = (page: Page) =>
  page.getByRole('region', { name: 'Fotos', exact: true })

/** Rua e número são campos separados, gravados juntos em `address`. */
async function fillAddress(page: Page, rua: string, numero: string) {
  await info(page).getByLabel('Rua', { exact: true }).fill(rua)
  await info(page).getByLabel('Número', { exact: true }).fill(numero)
}

const pickPhoto = (page: Page, file: Parameters<Locator['setInputFiles']>[0]) =>
  page.locator('input[type="file"]').setInputFiles(file)

/**
 * Erros não tratados da página, inclusive promessa rejeitada sem `catch`
 * (WEB-195): o Chromium os entrega como `pageerror`.
 */
function collectPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

const saveButton = (page: Page) =>
  page.getByRole('button', { name: 'Salvar alterações' })

async function save(page: Page, path = /pub\.updateMe/) {
  const saved = page.waitForResponse(path)
  await saveButton(page).click()
  return saved
}

/** O aviso do topo, quando o servidor recusa o que foi salvo. */
const saveError = (page: Page) =>
  page.getByRole('main').getByRole('alert').first()

test('mudar só a descrição salva sem chamar o geocoding', async ({ page }) => {
  const { barId, street } = await openProfile(page)

  await expect(saveButton(page)).toBeDisabled()
  await info(page)
    .getByLabel('Descrição')
    .fill('Telão de 100 polegadas e chope gelado.')
  expect((await save(page)).ok()).toBe(true)

  await expect(page.getByText('Alterações salvas.')).toBeVisible()
  await expect(saveButton(page)).toBeDisabled()
  await expect(info(page).getByLabel('Descrição')).toHaveValue(
    'Telão de 100 polegadas e chope gelado.'
  )
  const [bar] = await query('SELECT description FROM bar WHERE id = $1', [
    barId
  ])
  expect(bar?.description).toBe('Telão de 100 polegadas e chope gelado.')
  expect(await geocodedStreets(page)).not.toContain(street)
})

test('Descartar volta ao que está gravado, sem salvar', async ({ page }) => {
  const { barId } = await openProfile(page)
  let updates = 0
  page.on('request', (req) => {
    if (req.url().includes('pub.updateMe')) updates++
  })

  const nome = info(page).getByLabel('Nome do estabelecimento')
  const antes = await nome.inputValue()
  await nome.fill('Outro nome')
  // A prévia mostra o rascunho antes de salvar.
  await expect(
    page.getByRole('img', { name: /Prévia da página de Outro nome/ })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Descartar' }).click()

  await expect(nome).toHaveValue(antes)
  await expect(saveButton(page)).toBeDisabled()
  expect(updates).toBe(0)
  const [bar] = await query('SELECT name FROM bar WHERE id = $1', [barId])
  expect(bar?.name).toBe(antes)
})

test('mudar o endereço geocodifica a rua nova e grava', async ({ page }) => {
  const { barId } = await openProfile(page)
  const rua = `Rua Nova E2E ${randomUUID().slice(0, 8)}`
  const newStreet = `${rua}, 42`

  // O bar gravado abre com rua e número separados.
  await expect(info(page).getByLabel('Número', { exact: true })).toHaveValue(
    '100'
  )
  await fillAddress(page, rua, '42')
  expect((await save(page)).ok()).toBe(true)

  await expect(info(page).getByLabel('Rua', { exact: true })).toHaveValue(rua)
  await expect(info(page).getByLabel('Número', { exact: true })).toHaveValue(
    '42'
  )
  expect(await geocodedStreets(page)).toContain(newStreet)
  const [bar] = await query('SELECT address FROM bar WHERE id = $1', [barId])
  expect(bar?.address).toBe(newStreet)
})

// WEB-438: o CEP preenche rua, bairro, cidade e UF pelo ViaCEP, no navegador,
// e não vai ao servidor; o número continua com o dono.
test('CEP preenche o endereço e o número vai junto da rua', async ({
  page
}) => {
  const { barId } = await openProfile(page)
  const rua = `Rua CEP E2E ${randomUUID().slice(0, 8)}`
  await page.route('https://viacep.com.br/ws/**', (route) =>
    route.fulfill({
      json: {
        logradouro: rua,
        bairro: 'Vila Madalena',
        localidade: 'São Paulo',
        uf: 'SP'
      }
    })
  )

  await info(page).getByLabel('CEP').fill('05433000')
  await expect(info(page).getByLabel('CEP')).toHaveValue('05433-000')
  await expect(info(page).getByText('Encontrado')).toBeVisible()
  await expect(info(page).getByLabel('Rua', { exact: true })).toHaveValue(rua)
  await expect(info(page).getByLabel('Bairro')).toHaveValue('Vila Madalena')
  await expect(info(page).getByLabel('UF', { exact: true })).toHaveValue('SP')
  await info(page).getByLabel('Número', { exact: true }).fill('214')
  const saved = page.waitForRequest(/pub\.updateMe/)
  expect((await save(page)).ok()).toBe(true)
  expect((await saved).postData()).not.toContain('05433')

  const [bar] = await query(
    'SELECT address, neighborhood, uf FROM bar WHERE id = $1',
    [barId]
  )
  expect(bar).toEqual({
    address: `${rua}, 214`,
    neighborhood: 'Vila Madalena',
    uf: 'SP'
  })
})

test('resposta atrasada de um CEP antigo não preenche por cima do atual', async ({
  page
}) => {
  await openProfile(page)
  let soltarPrimeiro = () => {}
  const primeiroSolto = new Promise<void>((r) => {
    soltarPrimeiro = r
  })
  let primeiroRespondido = () => {}
  const primeiroFim = new Promise<void>((r) => {
    primeiroRespondido = r
  })
  await page.route('https://viacep.com.br/ws/**', async (route) => {
    const antigo = route.request().url().includes('/01001000/')
    if (antigo) await primeiroSolto
    await route.fulfill({
      json: {
        logradouro: antigo ? 'Rua Antiga' : 'Rua Atual',
        bairro: antigo ? 'Sé' : 'Vila Madalena',
        localidade: 'São Paulo',
        uf: 'SP'
      }
    })
    if (antigo) primeiroRespondido()
  })
  const rua = info(page).getByLabel('Rua', { exact: true })

  await info(page).getByLabel('CEP').fill('01001000')
  await info(page).getByLabel('CEP').fill('05433000')
  await expect(rua).toHaveValue('Rua Atual')
  // A primeira busca resolve por último e é ignorada.
  soltarPrimeiro()
  await primeiroFim
  await page.waitForTimeout(200)
  await expect(rua).toHaveValue('Rua Atual')
  await expect(info(page).getByLabel('Bairro')).toHaveValue('Vila Madalena')
  await expect(info(page).getByText('Encontrado')).toBeVisible()
})

test('CEP que o ViaCEP não acha avisa e deixa o endereço como está', async ({
  page
}) => {
  await openProfile(page)
  await page.route('https://viacep.com.br/ws/**', (route) =>
    route.fulfill({ json: { erro: 'true' } })
  )
  const antes = await info(page).getByLabel('Rua', { exact: true }).inputValue()

  await info(page).getByLabel('CEP').fill('99999999')
  await expect(info(page)).toContainText(
    'Não achamos esse CEP. Preencha o endereço.'
  )
  await expect(info(page).getByLabel('Rua', { exact: true })).toHaveValue(antes)
  await expect(saveButton(page)).toBeDisabled()
})

// WEB-270: bar cadastrado antes do campo abre sem UF (e salva o resto sem ela,
// como o primeiro teste mostra); escolhê-la confere o endereço com o estado.
test('escolher a UF num bar sem UF geocodifica com o estado e grava', async ({
  page
}) => {
  const { barId, street } = await openProfile(page)

  const uf = info(page).getByLabel('UF', { exact: true })
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

  await fillAddress(page, 'Rua inexistente', '1')
  expect((await save(page)).ok()).toBe(false)

  await expect(saveError(page)).toHaveText(
    'Não encontramos esse endereço em São Paulo. Confira a rua, o número e a cidade.'
  )
  // O rascunho continua na tela, e nada foi gravado.
  await expect(info(page).getByLabel('Rua', { exact: true })).toHaveValue(
    'Rua inexistente'
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

  await info(page).getByLabel('Telefone').fill('11887654321')
  await saveButton(page).click()

  await expect(info(page).getByRole('alert')).toHaveText(
    'Celular deve começar com 9 depois do DDD. Confira o telefone.'
  )
  expect(updates).toBe(0)
  const [bar] = await query('SELECT phone FROM bar WHERE id = $1', [barId])
  expect(bar?.phone).toBeNull()
  expect(pageErrors).toEqual([])
})

test('geocoding fora do ar pede para tentar em instantes, sem culpar o endereço', async ({
  page
}) => {
  const { barId, street } = await openProfile(page)
  await fillAddress(
    page,
    `Rua falha-geocoding ${randomUUID().slice(0, 8)}`,
    '1'
  )
  expect((await save(page)).ok()).toBe(false)

  await expect(saveError(page)).toHaveText(
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
    fotos(page).locator(`img[src="${bar?.photo_url}"]`)
  ).toBeVisible()
  await expect(
    fotos(page).getByRole('button', { name: 'Trocar' })
  ).toBeVisible()
  // A foto não espera o "Salvar alterações".
  await expect(saveButton(page)).toBeDisabled()
})

test('falha ao gravar a URL da foto aparece na foto, sem rejeição não tratada', async ({
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
  await expect(fotos(page).getByRole('alert')).toHaveText(
    'Erro ao fazer upload. Tente novamente.'
  )
  expect(uploads).toHaveLength(1)
  const [bar] = await query('SELECT photo_url FROM bar WHERE id = $1', [barId])
  expect(bar?.photo_url).toBeNull()
  expect(pageErrors).toEqual([])
  // A falha da foto é da foto: o formulário não a herda.
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(1)
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
  await expect(fotos(page).getByRole('alert')).toHaveText(
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
  await expect(fotos(page).getByRole('alert')).toHaveText(
    'Arquivo muito grande. Máximo 5MB.'
  )
  expect(uploads).toEqual([])
})

test('edita nome, telefone, características e telas, e confirma o WhatsApp', async ({
  page
}) => {
  const { barId } = await openProfile(page)

  await info(page)
    .getByLabel('Nome do estabelecimento')
    .fill('Bar Renomeado E2E')
  await info(page).getByLabel('Telefone').fill('11987654321')
  const caracteristicas = page.getByRole('region', { name: 'Características' })
  await caracteristicas
    .getByRole('button', { name: 'Telão / projetor' })
    .click()
  await caracteristicas.getByRole('button', { name: 'Área externa' }).click()
  for (let i = 0; i < 4; i++) {
    await caracteristicas
      .getByRole('button', { name: 'Uma tela a mais' })
      .click()
  }
  expect((await save(page)).ok()).toBe(true)

  await expect(
    page.getByRole('img', { name: /Prévia da página de Bar Renomeado E2E/ })
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
  const perfil = page.getByRole('region', { name: /^Perfil \d de 6$/ })
  await perfil.getByRole('button', { name: 'Confirmar' }).click()
  await expect(info(page).getByText('✓ WhatsApp')).toBeVisible()
  await expect(perfil.getByRole('button', { name: 'Confirmar' })).toHaveCount(0)
  const [after] = await query(
    'SELECT phone_accepts_whatsapp FROM bar WHERE id = $1',
    [barId]
  )
  expect(after?.phone_accepts_whatsapp).toBe(true)
})

test('"Com oferta da casa" não se marca nas características, e o antigo "Aceita reserva" gravado sai ao salvar', async ({
  page
}) => {
  // 10 era "Aceita reserva", de quando o bar a marcava à mão; hoje é o filtro
  // "Com oferta da casa" da busca, que ninguém marca.
  const pub = await createPub({ bar: { amenities: [10] } })
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')
  const caracteristicas = page.getByRole('region', { name: 'Características' })

  await expect(
    caracteristicas.getByRole('button', { name: 'Estacionamento próximo' })
  ).toBeVisible()
  for (const name of ['Com oferta da casa', 'Aceita reserva']) {
    await expect(caracteristicas.getByRole('button', { name })).toHaveCount(0)
  }

  await caracteristicas
    .getByRole('button', { name: 'Telão / projetor' })
    .click()
  expect((await save(page)).ok()).toBe(true)
  const [bar] = await query('SELECT amenities FROM bar WHERE id = $1', [
    pub.barId
  ])
  expect(bar?.amenities).toEqual([1])
})

test('horário: informar, salvar e tirar da página', async ({ page }) => {
  const { barId } = await openProfile(page)
  const horario = page.getByRole('region', {
    name: 'Horário de funcionamento'
  })

  await horario.getByRole('button', { name: 'Informar horário' }).click()
  await horario.getByLabel('Domingo', { exact: true }).uncheck()
  await horario.getByLabel('Sexta, fecha').fill('02:00')
  expect((await save(page, /pub\.updateOpeningHours/)).ok()).toBe(true)
  await expect(saveButton(page)).toBeDisabled()

  const [bar] = await query('SELECT opening_hours FROM bar WHERE id = $1', [
    barId
  ])
  expect(bar?.opening_hours?.[0]).toBeNull()
  expect(bar?.opening_hours?.[5]).toEqual({ opens: '17:00', closes: '02:00' })

  await horario
    .getByRole('button', { name: 'Tirar o horário da página' })
    .click()
  expect((await save(page, /pub\.updateOpeningHours/)).ok()).toBe(true)
  const [after] = await query('SELECT opening_hours FROM bar WHERE id = $1', [
    barId
  ])
  expect(after?.opening_hours).toBeNull()
})

test('Elite salva cardápio, preço médio e oferta num "Salvar" só', async ({
  page
}) => {
  const { barId } = await openProfile(page)

  const menu = page.getByRole('region', { name: 'Cardápio e preço' })
  await menu
    .getByLabel('Link do cardápio')
    .fill('https://cardapio.e2e.test/menu')
  // WEB-353: com erro de validação, nada é enviado.
  const spend = menu.getByLabel('Preço médio por pessoa')
  await spend.fill('1500')
  await saveButton(page).click()
  await expect(menu.getByRole('alert')).toContainText('O valor aceita até')
  await spend.fill('85,50')

  const offer = page.getByRole('region', { name: 'Oferta da casa' })
  await offer.getByLabel('Oferta da casa').fill('Chope em dobro no intervalo')
  // A prévia do app mostra a oferta antes de salvar.
  await expect(page.getByRole('img', { name: /Prévia/ })).toContainText(
    'Chope em dobro no intervalo'
  )
  expect((await save(page, /pub\.updateHouseOffer/)).ok()).toBe(true)
  await expect(page.getByText('Alterações salvas.')).toBeVisible()

  const [saved] = await query(
    'SELECT menu_url, average_spend_cents, house_offer FROM bar WHERE id = $1',
    [barId]
  )
  expect(saved).toEqual({
    menu_url: 'https://cardapio.e2e.test/menu',
    average_spend_cents: 8550,
    house_offer: 'Chope em dobro no intervalo'
  })
})

test('avaliações e prévia de como o torcedor vê', async ({ page }) => {
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
      would_return: wouldReturn,
      reasons: wouldReturn ? ['screen', 'sound'] : []
    })
  }
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')

  const ratings = page.getByRole('region', { name: 'Avaliações' })
  await expect(ratings).toContainText('50%')
  // Duas avaliações, abaixo do piso público de 3: o dono é avisado.
  await expect(ratings).toContainText('Ainda não aparece para o torcedor')
  await expect(ratings).toContainText('falta 1')
  await expect(ratings.getByRole('listitem')).toHaveCount(2)
  // "O que pesou?" (WEB-398), sem quem respondeu.
  await expect(ratings).toContainText('Telão')
  await expect(ratings).toContainText('Som do jogo')

  const preview = page.getByRole('img', { name: /Prévia da página/ })
  await expect(preview).toContainText(`Bar E2E ${pub.barId.slice(0, 8)}`)
  await expect(preview).toContainText('Vou assistir aqui')
  // Elite em dia: o selo aparece como para o torcedor.
  await expect(preview).toContainText('Elite')
})
