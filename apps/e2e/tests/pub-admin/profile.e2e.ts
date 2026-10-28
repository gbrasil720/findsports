import { randomUUID } from 'node:crypto'
import type { Locator, Page } from '@playwright/test'
import { MEDIA_PUBLIC_ORIGIN, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { team } from '../../fixtures/fan'
import { createEvent } from '../../fixtures/going'
import { interceptMediaUploads } from '../../fixtures/media'
import { LARGURAS_CELULAR, vazamentoLateral } from '../../fixtures/painel'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { stubTiles } from '../../fixtures/tiles'
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

type Arquivo = Parameters<Locator['setInputFiles']>[0]

const pickPhoto = (page: Page, file: Arquivo) =>
  page.getByLabel('Foto de capa').setInputFiles(file)

/** Foto da galeria do ambiente (WEB-439): o outro `input` da seção Fotos. */
const pickGalleryPhoto = (page: Page, file: Arquivo) =>
  page.getByLabel('Foto da galeria').setInputFiles(file)

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

  await expect(page.getByRole('button', { name: 'Salvo' })).toBeVisible()
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
    page.getByRole('region', { name: /Prévia da página de Outro nome/ })
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
    page.getByRole('region', { name: /Prévia da página de Bar Renomeado E2E/ })
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

test('Pagamento separa Pix, Cartão, Vale-refeição e Couvert, e o antigo "Pix e cartão" fica gravado (WEB-455)', async ({
  page
}) => {
  // 14 era "Pix e cartão"; a migration 0075 deu Pix (16) e Cartão (17) a quem
  // o tinha, e ele continua no banco, escondido.
  const pub = await createPub({ bar: { amenities: [14, 16, 17] } })
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')
  const caracteristicas = page.getByRole('region', { name: 'Características' })
  const pagamento = caracteristicas.getByRole('group', { name: 'Pagamento' })

  for (const name of ['Pix', 'Cartão', 'Vale-refeição', 'Couvert']) {
    await expect(pagamento.getByRole('button', { name })).toBeVisible()
  }
  await expect(
    caracteristicas.getByRole('button', { name: 'Pix e cartão' })
  ).toHaveCount(0)
  for (const name of ['Drinks', 'Opção vegetariana', 'Perto do metrô']) {
    await expect(caracteristicas.getByRole('button', { name })).toBeVisible()
  }

  await pagamento.getByRole('button', { name: 'Vale-refeição' }).click()
  await caracteristicas.getByRole('button', { name: 'Bicicletário' }).click()
  expect((await save(page)).ok()).toBe(true)
  const [bar] = await query('SELECT amenities FROM bar WHERE id = $1', [
    pub.barId
  ])
  expect(bar?.amenities).toEqual([14, 16, 17, 18, 23])
})

test('horário: informar, salvar e tirar da página', async ({ page }) => {
  const { barId } = await openProfile(page)
  const horario = page.getByRole('region', {
    name: 'Horário de funcionamento'
  })

  await horario.getByRole('button', { name: 'Informar horário' }).click()
  await horario.getByRole('switch', { name: 'Domingo' }).click()
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

/** O dia de amanhã em Brasília: 0 = domingo, e o nome do campo ("Sexta"). */
function amanha() {
  const dia = new Date(
    `${new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T12:00:00Z`
  ).getUTCDay()
  const nome = [
    'Domingo',
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado'
  ][dia]
  return { dia, nome: nome ?? '' }
}

/** Amanhã às `hora`h em Brasília. */
const amanhaAs = (hora: number) =>
  new Date(
    `${new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T${String(hora).padStart(2, '0')}:00:00-03:00`
  )

test('horário: atalhos da 28e e o aviso do jogo no novo horário', async ({
  page
}) => {
  const pub = await createPub({
    bar: {
      // Segunda abre mais tarde: é o dia que os atalhos copiam.
      opening_hours: JSON.stringify(
        Array.from({ length: 7 }, (_, dia) => ({
          opens: dia === 1 ? '18:00' : '17:00',
          closes: '00:00'
        }))
      )
    }
  })
  await createEvent(pub.barId, { startsAt: amanhaAs(15) })
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')
  const horario = page.getByRole('region', {
    name: 'Horário de funcionamento'
  })
  await expect(horario.getByText(/^(Aberto|Fechado) agora$/)).toBeVisible()

  // O jogo de amanhã às 15:00 está fora do horário salvo (17:00 ou 18:00).
  const { dia, nome } = amanha()
  const aviso = horario.getByRole('status')
  await expect(horario.getByText(/novo horário/)).toHaveCount(0)
  await horario.getByLabel(`${nome}, abre`).fill('14:00')
  await expect(aviso).toHaveText(
    'O jogo de amanhã às 15:00 fica dentro do novo horário.'
  )
  await horario.getByLabel(`${nome}, abre`).fill('16:00')
  await expect(aviso).toHaveText(
    'O jogo de amanhã às 15:00 fica fora do novo horário.'
  )

  // Todo dia igual: os sete na faixa do primeiro dia aberto, a segunda.
  const modelo = dia === 1 ? '16:00' : '18:00'
  await horario.getByRole('button', { name: 'Todo dia igual' }).click()
  for (const outro of ['Segunda', 'Quarta', 'Domingo']) {
    await expect(horario.getByLabel(`${outro}, abre`)).toHaveValue(modelo)
  }
  await expect(
    horario.getByRole('button', { name: 'Todo dia igual' })
  ).toBeDisabled()
  await expect(
    horario.getByRole('button', { name: 'Copiar segunda para a semana' })
  ).toBeDisabled()

  // Fim de semana igual: o domingo fechado volta como o sábado.
  await horario.getByRole('switch', { name: 'Domingo' }).click()
  await expect(horario.getByLabel('Domingo, abre')).toHaveCount(0)
  await horario.getByRole('button', { name: 'Fim de semana igual' }).click()
  await expect(
    horario.getByRole('switch', { name: 'Domingo' })
  ).toHaveAttribute('aria-checked', 'true')

  expect((await save(page, /pub\.updateOpeningHours/)).ok()).toBe(true)
  const [bar] = await query('SELECT opening_hours FROM bar WHERE id = $1', [
    pub.barId
  ])
  expect(bar?.opening_hours).toEqual(
    Array.from({ length: 7 }, () => ({ opens: modelo, closes: '00:00' }))
  )
  // Salvo, o horário novo é o de antes: o aviso some.
  await expect(horario.getByText(/novo horário/)).toHaveCount(0)
})

test('no celular nada rola de lado: formulário, horário, checklist e prévia', async ({
  page
}) => {
  await openProfile(page)
  await page
    .getByRole('region', { name: 'Horário de funcionamento' })
    .getByRole('button', { name: 'Informar horário' })
    .click()
  for (const largura of LARGURAS_CELULAR) {
    await page.setViewportSize({ width: largura, height: 800 })
    expect(await vazamentoLateral(page), `${largura} px`).toEqual([])
    // A última aba da prévia era a que ficava fora da tela.
    const mapa = page
      .getByRole('group', { name: 'Prévia' })
      .getByRole('button', { name: 'Mapa' })
    const caixa = await mapa.boundingBox()
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(largura)
  }
})

test('bairro e cidade param em 100 caracteres, e o servidor recusa mais', async ({
  page
}) => {
  const { barId } = await openProfile(page)
  const longo = 'Vila '.repeat(30)
  for (const rotulo of ['Bairro', 'Cidade']) {
    const campo = info(page).getByLabel(rotulo, { exact: true })
    await campo.fill(longo)
    await expect(campo).toHaveValue(longo.slice(0, 100))
  }

  // Sem a tela, o `pub.updateMe` recusa o mesmo teto do cadastro.
  for (const campo of ['neighborhood', 'city']) {
    const resposta = await page.request.post('/api/trpc/pub.updateMe', {
      data: { [campo]: 'a'.repeat(101) }
    })
    expect(resposta.status(), campo).toBe(400)
  }
  const [bar] = await query(
    'SELECT neighborhood, city FROM bar WHERE id = $1',
    [barId]
  )
  expect(bar).toEqual({ neighborhood: 'Consolação', city: 'São Paulo' })
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
  await expect(
    page.getByRole('region', { name: /Prévia da página/ })
  ).toContainText('Chope em dobro no intervalo')
  expect((await save(page, /pub\.updateHouseOffer/)).ok()).toBe(true)
  await expect(page.getByRole('button', { name: 'Salvo' })).toBeVisible()

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

  const preview = page.getByRole('region', { name: /Prévia da página/ })
  await expect(preview).toContainText(`Bar E2E ${pub.barId.slice(0, 8)}`)
  // Só jogo passado: como no app, sem "Vou assistir aqui".
  await expect(preview).toContainText('Nenhum jogo marcado por enquanto.')
  await expect(preview).not.toContainText('Vou assistir aqui')
  // Elite em dia: o selo aparece como para o torcedor.
  await expect(preview).toContainText('Elite')
})

test('prévia em Card e Mapa: o card da lista, a gota no mapa e a distância de exemplo (WEB-440, WEB-456)', async ({
  page
}) => {
  const pub = await createPub({ bar: { amenities: [1, 2] } })
  const { eventId } = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() - 30 * 60_000)
  })
  const [corinthians, palmeiras] = await Promise.all([
    team('corinthians'),
    team('palmeiras')
  ])
  for (const [position, t] of [corinthians, palmeiras].entries()) {
    await insert('event_participants', {
      event_id: eventId,
      team_id: t.id,
      position
    })
  }
  const tiles = await stubTiles(page)
  const maplibre: string[] = []
  page.on('request', (r) => {
    if (/maplibre/.test(r.url())) maplibre.push(r.url())
  })
  await signIn(page, pub.user)
  // O MapLibre e os tiles são só da prévia: as outras telas não os pedem.
  await page.goto('/admin')
  await expect(page.getByRole('main')).toBeVisible()
  expect(maplibre).toEqual([])
  expect(tiles).toEqual([])

  await page.goto('/admin/meu-espaco')
  await info(page).getByLabel('Nome do estabelecimento').fill('Bar do Rascunho')
  // A legenda avisa que a distância é de exemplo.
  await expect(
    page.getByText(
      'A distância é de exemplo, de um torcedor a 0,8 km do bar.',
      { exact: false }
    )
  ).toBeVisible()

  const abas = page.getByRole('group', { name: 'Prévia' })
  await abas.getByRole('button', { name: 'Card' }).click()
  await expect(abas.getByRole('button', { name: 'Card' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  const card = page.getByRole('img', {
    name: 'Prévia do card de Bar do Rascunho na lista do app'
  })
  // Ao vivo, Elite em dia, confronto com as siglas e a distância de exemplo.
  await expect(card).toContainText('Ao vivo')
  await expect(card).toContainText('Elite')
  await expect(card).toContainText('COR')
  await expect(card).toContainText('Corinthians')
  await expect(card).toContainText('Consolação')
  await expect(card).toContainText('0,8 km')

  await abas.getByRole('button', { name: 'Mapa' }).click()
  const mapa = page.getByRole('img', {
    name: 'Prévia do pino de Bar do Rascunho no mapa do app'
  })
  await expect(mapa).toContainText('Bar do Rascunho')
  await expect(mapa).toContainText('AO VIVO')
  // O mapa de verdade, com os tiles da Onside, por baixo da gota.
  await expect(mapa.locator('canvas')).toBeVisible()
  await expect(mapa).toContainText('© OpenStreetMap')
  await expect.poll(() => tiles.some((t) => t.endsWith('.mvt'))).toBe(true)

  await abas.getByRole('button', { name: 'Página' }).click()
  const pagina = page.getByRole('region', {
    name: /Prévia da página de Bar do Rascunho/
  })
  await expect(pagina).toContainText('Consolação · 0,8 km · 11 min a pé')
  await expect(pagina.locator('canvas')).toHaveCount(1)
})

for (const [plano, marcaram, mostra] of [
  ['elite', 15, true],
  ['elite', 14, false],
  ['pro', 15, false]
] as const) {
  test(`prévia: "N vão" no ${plano} com ${marcaram} presenças ${mostra ? 'aparece' : 'não aparece'}`, async ({
    page
  }) => {
    const pub = await createPub({ subscription: { plan: plano } })
    const { eventId } = await createEvent(pub.barId)
    for (let i = 0; i < marcaram; i++) {
      const fan = await createUser()
      await insert('attendance', { user_id: fan.id, event_id: eventId })
    }
    await signIn(page, pub.user)
    await page.goto('/admin/meu-espaco')

    const preview = page.getByRole('region', { name: /Prévia da página/ })
    await expect(preview).toContainText('Vou assistir aqui')
    // Só o número: sem as iniciais nem os nomes de quem vai.
    if (mostra) await expect(preview).toContainText(`${marcaram} vão`)
    else await expect(preview).not.toContainText('vão')
  })
}

/* ─── Galeria do ambiente (WEB-439) ─── */

const PNG = {
  name: 'ambiente.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  )
}

async function galleryOf(barId: string): Promise<string[]> {
  const [bar] = await query('SELECT gallery_photos FROM bar WHERE id = $1', [
    barId
  ])
  return bar?.gallery_photos as string[]
}

test('galeria: põe duas fotos pelo R2, troca a ordem e a prévia mostra', async ({
  page
}) => {
  const uploads = await interceptMediaUploads(page)
  const { barId } = await openProfile(page)
  const adicionar = fotos(page).getByRole('button', { name: /Adicionar foto/ })
  await expect(adicionar).toContainText('Galeria · 0 de 8')

  for (const total of [1, 2]) {
    const saved = page.waitForResponse(/pub\.addGalleryPhoto/)
    await pickGalleryPhoto(page, PNG)
    expect((await saved).ok()).toBe(true)
    await expect(adicionar).toContainText(`Galeria · ${total} de 8`)
  }

  // Cada foto numa chave nova, sorteada no servidor.
  expect(uploads).toHaveLength(2)
  for (const upload of uploads) {
    expect(upload.pathname).toMatch(
      new RegExp(`^bars/${barId}/gallery/[0-9a-f-]{36}$`)
    )
  }
  const [primeira, segunda] = await galleryOf(barId)
  expect(primeira).toContain(uploads[0]?.pathname)
  expect(segunda).toContain(uploads[1]?.pathname)

  const reordered = page.waitForResponse(/pub\.reorderGallery/)
  await fotos(page)
    .getByRole('button', { name: 'Mover a foto 2 para antes' })
    .click()
  expect((await reordered).ok()).toBe(true)
  expect(await galleryOf(barId)).toEqual([segunda, primeira])
  await expect(
    fotos(page).getByRole('button', { name: 'Mover a foto 1 para antes' })
  ).toBeDisabled()

  // A prévia é a página do app: as duas fotos depois da capa.
  await expect(
    page
      .getByRole('region', { name: /Prévia da página de/ })
      .getByRole('img', { name: /do ambiente$/ })
  ).toHaveCount(2)
})

const galeriaDe = (n: number) =>
  Array.from(
    { length: n },
    () => `${MEDIA_PUBLIC_ORIGIN}/bars/x/gallery/${randomUUID()}`
  )

test('galeria cheia: as 8 fotos e nada de "Adicionar foto"', async ({
  page
}) => {
  const pub = await createPub({ bar: { gallery_photos: galeriaDe(8) } })
  await interceptMediaUploads(page)
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')
  await expect(
    fotos(page).getByRole('img', { name: /do ambiente de/ })
  ).toHaveCount(8)
  await expect(fotos(page).getByText('Adicionar foto')).toHaveCount(0)
})

test('Starter: "Adicionar foto" leva aos planos e a galeria guardada não vai à prévia', async ({
  page
}) => {
  const pub = await createPub({
    subscription: { plan: 'starter' },
    bar: { gallery_photos: galeriaDe(1) }
  })
  await interceptMediaUploads(page)
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')
  await expect(
    fotos(page).getByRole('link', { name: /Adicionar foto/ })
  ).toHaveAttribute('href', '/plan?origin=admin')
  await expect(fotos(page)).toContainText(
    'As fotos da galeria continuam guardadas, mas não aparecem no perfil até o plano voltar.'
  )
  await expect(
    page
      .getByRole('region', { name: /Prévia da página de/ })
      .getByRole('img', { name: /do ambiente$/ })
  ).toHaveCount(0)
})
