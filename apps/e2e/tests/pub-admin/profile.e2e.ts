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

// "Meu espaço": rascunho com a barra de salvar, geocoding só quando o
// endereço muda (WEB-146), foto pelo upload direto para o R2, recursos pagos
// de um bar Elite, avaliações e prévia.

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

const editor = (page: Page) => page.locator('#painel-main')
const info = (page: Page) => page.getByRole('region', { name: 'Informações' })
const fotos = (page: Page) => page.locator('#esp-fotos')

const pickPhoto = (page: Page, file: Parameters<Locator['setInputFiles']>[0]) =>
  fotos(page).locator('input[type="file"]').setInputFiles(file)

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
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  return saved
}

test('mudar só a descrição manda para a revisão, sem chamar o geocoding', async ({
  page
}) => {
  const { barId, street } = await openProfile(page)

  await editor(page)
    .getByLabel('Descrição')
    .fill('Telão de 100 polegadas e chope gelado.')
  expect((await save(page)).ok()).toBe(true)

  await expect(page.getByText('Alterações salvas.')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Salvar alterações' })
  ).toHaveCount(0)
  await expect(editor(page).getByLabel('Descrição')).toHaveValue(
    'Telão de 100 polegadas e chope gelado.'
  )
  // WEB-478: o torcedor só vê depois que a Onside aprovar.
  const [bar] = await query(
    'SELECT description, description_pending, description_review FROM bar WHERE id = $1',
    [barId]
  )
  expect(bar).toEqual({
    description: null,
    description_pending: 'Telão de 100 polegadas e chope gelado.',
    description_review: 'pending'
  })
  await expect(info(page)).toContainText('EM REVISÃO')
  await expect(info(page)).toContainText(
    'Em revisão. A descrição aparece para o torcedor quando a Onside aprovar.'
  )
  expect(await geocodedStreets(page)).not.toContain(street)
})

test('descrição recusada mostra o motivo e volta à revisão ao mudar (WEB-478)', async ({
  page
}) => {
  const pub = await createPub({
    bar: {
      description: 'Bar de bairro.',
      description_pending: 'Ligue 11 99999-9999!',
      description_review: 'rejected',
      description_rejection_reason: 'Tem telefone no texto.'
    }
  })
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')

  await expect(info(page).getByLabel('Descrição')).toHaveValue(
    'Ligue 11 99999-9999!'
  )
  await expect(info(page)).toContainText('RECUSADA')
  await expect(info(page)).toContainText(
    'Recusada: Tem telefone no texto. Mude o texto e salve para mandar de novo.'
  )
  await info(page).getByLabel('Descrição').fill('Bar de bairro com telão.')
  expect((await save(page)).ok()).toBe(true)
  await expect(info(page)).toContainText(
    'Em revisão. Até a Onside aprovar, o torcedor vê a descrição anterior.'
  )
  const [bar] = await query(
    'SELECT description, description_review FROM bar WHERE id = $1',
    [pub.barId]
  )
  expect(bar).toEqual({
    description: 'Bar de bairro.',
    description_review: 'pending'
  })
})

test('mudar o endereço geocodifica a rua nova e grava', async ({ page }) => {
  const { barId } = await openProfile(page)
  const rua = `Rua Nova E2E ${randomUUID().slice(0, 8)}`
  const newStreet = `${rua}, 42`

  await editor(page).getByLabel('Rua').fill(rua)
  await editor(page).getByLabel('Número').fill('42')
  expect((await save(page)).ok()).toBe(true)

  await expect(editor(page).getByLabel('Rua')).toHaveValue(rua)
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

// O CEP não é gravado: digitado, geocodifica de novo mesmo sem o endereço
// mudar, que é como o dono tira o pino de um trecho errado da rua.
test('digitar o CEP geocodifica de novo com ele, sem mudar o endereço', async ({
  page
}) => {
  const { barId, street } = await openProfile(page)
  // CEP que o ViaCEP não conhece: o formulário não muda, e o CEP vai mesmo assim.
  await page.route('https://viacep.com.br/ws/**', (route) =>
    route.fulfill({ json: { erro: 'true' } })
  )

  await editor(page).getByLabel('CEP').fill('09726251')
  await expect(
    editor(page).getByText('Não achamos esse CEP. Preencha o endereço abaixo.')
  ).toBeVisible()
  expect((await save(page)).ok()).toBe(true)

  const response = await page.request.get(`${STUB_URL}/locationiq/calls`)
  const calls = (await response.json()) as {
    street: string
    postalcode: string | null
  }[]
  expect(calls.find((c) => c.street === street)?.postalcode).toBe('09726-251')
  const [bar] = await query('SELECT address FROM bar WHERE id = $1', [barId])
  expect(bar?.address).toBe(street)
})

test('endereço que o geocoding não acha é recusado com a mensagem certa', async ({
  page
}) => {
  const pageErrors = collectPageErrors(page)
  const { barId, street } = await openProfile(page)

  await editor(page).getByLabel('Rua').fill('Rua inexistente')
  await editor(page).getByLabel('Número').fill('1')
  expect((await save(page)).ok()).toBe(false)

  await expect(info(page).getByRole('alert')).toHaveText(
    'Não encontramos esse endereço em São Paulo. Confira a rua, o número e a cidade.'
  )
  // O formulário continua aberto, e nada foi gravado.
  await expect(editor(page).getByLabel('Rua')).toHaveValue('Rua inexistente')
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

  await editor(page).getByLabel('Telefone').fill('11887654321')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()

  await expect(info(page).getByRole('alert')).toHaveText(
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
  await editor(page)
    .getByLabel('Rua')
    .fill(`Rua falha-geocoding ${randomUUID().slice(0, 8)}`)
  expect((await save(page)).ok()).toBe(false)

  await expect(info(page).getByRole('alert')).toHaveText(
    'Não foi possível validar o endereço agora. Tente novamente em instantes.'
  )
  const [bar] = await query('SELECT address FROM bar WHERE id = $1', [barId])
  expect(bar?.address).toBe(street)
})

/* ─── Fotos com revisão (WEB-439, WEB-462) ─── */

const PNG = {
  name: 'ambiente.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  )
}

type Foto = {
  category?: string
  status?: 'pending' | 'approved' | 'rejected'
  reason?: string
  /** Fora das chaves do bar: apagar não chama o R2, que o E2E não dubla do servidor. */
  alheia?: boolean
}

/** Fotos já no bar, na ordem dada; devolve as URLs. */
async function seedPhotos(barId: string, list: Foto[]): Promise<string[]> {
  const urls: string[] = []
  for (const [position, f] of list.entries()) {
    const url = `${MEDIA_PUBLIC_ORIGIN}/bars/${f.alheia ? 'fora' : barId}/gallery/${randomUUID()}`
    urls.push(url)
    await insert('bar_photo', {
      id: randomUUID(),
      bar_id: barId,
      url,
      category: f.category ?? 'telao',
      position,
      status: f.status ?? 'approved',
      rejection_reason: f.status === 'rejected' ? (f.reason ?? 'Motivo.') : null
    })
  }
  return urls
}

async function photosOf(barId: string) {
  return query<{
    url: string
    category: string
    caption: string | null
    status: string
    cover_requested: boolean
  }>(
    `SELECT url, category, caption, status, cover_requested
     FROM bar_photo WHERE bar_id = $1 ORDER BY position`,
    [barId]
  )
}

const folha = (page: Page) => page.getByRole('dialog')

test('enviar foto: categoria, legenda e capa, sobe pelo R2 e entra em revisão', async ({
  page
}) => {
  const uploads = await interceptMediaUploads(page)
  const { barId } = await openProfile(page)

  await pickPhoto(page, PNG)
  await expect(
    folha(page).getByRole('heading', { name: 'Nova foto' })
  ).toBeVisible()
  await folha(page).getByRole('button', { name: 'Área externa' }).click()
  await folha(page).getByLabel('Legenda').fill('A varanda com dois telões')
  await expect(folha(page)).toContainText('25/80')
  await folha(page).getByRole('switch', { name: 'Usar como capa' }).click()
  const saved = page.waitForResponse(/pub\.addPhoto/)
  await folha(page).getByRole('button', { name: 'Enviar para revisão' }).click()
  expect((await saved).ok()).toBe(true)
  await expect(folha(page)).toHaveCount(0)

  // Chave nova sorteada no servidor; capa pedida, mas nada no ar ainda.
  expect(uploads).toHaveLength(1)
  expect(uploads[0]?.pathname).toMatch(
    new RegExp(`^bars/${barId}/gallery/[0-9a-f-]{36}$`)
  )
  expect(await photosOf(barId)).toEqual([
    {
      url: expect.stringContaining(uploads[0]?.pathname ?? '?'),
      category: 'area_externa',
      caption: 'A varanda com dois telões',
      status: 'pending',
      cover_requested: true
    }
  ])
  const [bar] = await query('SELECT photo_url FROM bar WHERE id = $1', [barId])
  expect(bar?.photo_url).toBeNull()

  await expect(
    fotos(page).getByRole('button', {
      name: /Área externa, foto 1 de 1, em revisão/
    })
  ).toBeVisible()
  await expect(fotos(page)).toContainText('0 publicadas · 1 em revisão')
  // A foto não espera o "Salvar alterações".
  await expect(
    page.getByRole('button', { name: 'Salvar alterações' })
  ).toHaveCount(0)
})

test('arquivo errado ou grande não sobe; R2 fora do ar avisa na folha', async ({
  page
}) => {
  const pageErrors = collectPageErrors(page)
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
  await pickPhoto(page, {
    name: 'grande.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1)
  })
  await expect(fotos(page).getByRole('alert')).toHaveText(
    'Arquivo muito grande. Máximo 5MB.'
  )
  await expect(folha(page)).toHaveCount(0)

  // Sem as chaves do R2 a rota responde 503 com a frase pronta.
  await page.route('**/api/bar/photo?galeria*', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          json: { error: 'Upload de foto indisponível no momento.' }
        })
      : route.continue()
  )
  await pickPhoto(page, PNG)
  await folha(page).getByRole('button', { name: 'Enviar para revisão' }).click()
  await expect(folha(page).getByRole('alert')).toHaveText(
    'Upload de foto indisponível no momento.'
  )
  await expect(
    folha(page).getByRole('button', { name: 'Tentar de novo' })
  ).toBeEnabled()
  expect(uploads).toEqual([])
  expect(pageErrors).toEqual([])
  // A falha da foto é da foto: o formulário do perfil não a herda.
  await expect(info(page).getByRole('alert')).toHaveCount(0)
})

test('recusada mostra o motivo; setas e arrastar reordenam; capa e apagar', async ({
  page
}) => {
  await interceptMediaUploads(page)
  const pub = await createPub()
  const [a, b, c, recusada] = await seedPhotos(pub.barId, [
    { category: 'telao' },
    { category: 'telao' },
    { category: 'telao' },
    {
      category: 'balcao',
      status: 'rejected',
      reason: 'Tem pessoas identificáveis no primeiro plano.',
      alheia: true
    }
  ])
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')

  await expect(fotos(page)).toContainText('3 publicadas · 1 recusada')
  await expect(fotos(page)).toContainText(
    '1 foto recusadaTem pessoas identificáveis no primeiro plano. Envie outra do mesmo espaço.'
  )

  const reordered = page.waitForResponse(/pub\.reorderPhotos/)
  await fotos(page)
    .getByRole('button', { name: 'Mover a foto 2 de Telão para antes' })
    .click()
  expect((await reordered).ok()).toBe(true)
  await expect
    .poll(async () => (await photosOf(pub.barId)).map((p) => p.url))
    .toEqual([b, a, c, recusada])

  // Arrastar a terceira para o lugar da primeira (só no desktop há mouse).
  if (!test.info().project.name.startsWith('mobile')) {
    const items = fotos(page).locator('li.pn-photo')
    const dragged = page.waitForResponse(/pub\.reorderPhotos/)
    await items.nth(2).dragTo(items.first())
    expect((await dragged).ok()).toBe(true)
    await expect
      .poll(async () => (await photosOf(pub.barId)).map((p) => p.url))
      .toEqual([c, b, a, recusada])
  }

  // Aprovada vira capa na hora.
  await fotos(page)
    .getByRole('button', { name: /Telão, foto 1 de 3\. Abrir/ })
    .click()
  const capa = page.waitForResponse(/pub\.setPhotoCover/)
  await folha(page).getByRole('switch', { name: 'Usar como capa' }).click()
  expect((await capa).ok()).toBe(true)
  const [first] = await photosOf(pub.barId)
  await expect
    .poll(async () => {
      const [bar] = await query('SELECT photo_url FROM bar WHERE id = $1', [
        pub.barId
      ])
      return bar?.photo_url
    })
    .toBe(first?.url)
  await folha(page).getByRole('button', { name: 'Fechar' }).last().click()
  await expect(
    fotos(page).getByRole('button', { name: /, capa\. Abrir/ })
  ).toHaveCount(1)

  // A recusada se apaga e libera o aviso.
  page.once('dialog', (d) => d.accept())
  await fotos(page)
    .getByRole('button', { name: /1 foto recusada/ })
    .click()
  await expect(folha(page)).toContainText(
    'Tem pessoas identificáveis no primeiro plano. Envie outra do mesmo espaço.'
  )
  await folha(page).getByRole('button', { name: 'Apagar foto' }).click()
  await expect(folha(page)).toHaveCount(0)
  await expect(fotos(page)).not.toContainText('foto recusada')
  expect(await photosOf(pub.barId)).toHaveLength(3)
})

test('12 fotos: nada de "Adicionar"; recusada não conta', async ({ page }) => {
  await interceptMediaUploads(page)
  const pub = await createPub()
  await seedPhotos(pub.barId, [
    ...Array.from({ length: 12 }, () => ({})),
    { status: 'rejected' as const }
  ])
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')
  await expect(fotos(page)).toContainText('12 publicadas · 1 recusada')
  await expect(fotos(page)).toContainText(
    'A Onside revisa cada foto em até 24 h antes de aparecer para o torcedor.'
  )
  await expect(
    fotos(page).getByRole('button', { name: 'Adicionar foto' })
  ).toHaveCount(0)
})

test('Starter: a foto nova entra como capa e a galeria guardada fica de fora', async ({
  page
}) => {
  await interceptMediaUploads(page)
  const pub = await createPub({ subscription: { plan: 'starter' } })
  await seedPhotos(pub.barId, [{}, {}])
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')

  await expect(
    fotos(page).getByRole('link', { name: /Galeria nos planos Pro e Elite/ })
  ).toHaveAttribute('href', '/plan?origin=admin')
  await expect(fotos(page)).toContainText(
    'As fotos da galeria continuam guardadas, mas só a capa aparece no perfil até o plano voltar.'
  )

  await pickPhoto(page, PNG)
  const capa = folha(page).getByRole('switch', { name: 'Usar como capa' })
  await expect(capa).toHaveAttribute('aria-checked', 'true')
  await expect(capa).toBeDisabled()
})

test('edita nome, telefone, comodidades e telas, e ativa o WhatsApp', async ({
  page
}) => {
  const { barId } = await openProfile(page)

  await editor(page).getByLabel('Nome do bar').fill('Bar Renomeado E2E')
  await editor(page).getByLabel('Telefone').fill('11987654321')
  await editor(page).getByRole('button', { name: 'Telão / projetor' }).click()
  await editor(page).getByRole('button', { name: 'Área externa' }).click()
  await editor(page).getByLabel('Quantas telas?').fill('4')
  expect((await save(page)).ok()).toBe(true)

  await expect(page.getByText('Alterações salvas.')).toBeVisible()
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
  await info(page)
    .getByRole('button', { name: 'Este número é WhatsApp' })
    .click()
  await expect(info(page)).toContainText('WHATSAPP CONFIRMADO')
  const [after] = await query(
    'SELECT phone_accepts_whatsapp FROM bar WHERE id = $1',
    [barId]
  )
  expect(after?.phone_accepts_whatsapp).toBe(true)
})

test('"Com oferta da casa" não se marca no checklist, e o antigo "Aceita reserva" gravado sai ao salvar', async ({
  page
}) => {
  // 10 era "Aceita reserva", de quando o bar a marcava à mão; hoje é o filtro
  // "Com oferta da casa" da busca, que ninguém marca.
  const pub = await createPub({ bar: { amenities: [10] } })
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')

  await expect(
    editor(page).getByRole('button', { name: 'Estacionamento próximo' })
  ).toBeVisible()
  for (const name of ['Com oferta da casa', 'Aceita reserva']) {
    await expect(editor(page).getByRole('button', { name })).toHaveCount(0)
  }

  await editor(page).getByRole('button', { name: 'Telão / projetor' }).click()
  expect((await save(page)).ok()).toBe(true)
  const [bar] = await query('SELECT amenities FROM bar WHERE id = $1', [
    pub.barId
  ])
  expect(bar?.amenities).toEqual([1])
})

test('Elite salva cardápio, preço médio e oferta', async ({ page }) => {
  const { barId } = await openProfile(page)

  const menu = page.getByRole('region', { name: /Cardápio e preço médio/ })
  await menu
    .getByLabel('Link do cardápio')
    .fill('https://cardapio.e2e.test/menu')
  // Valor fora da faixa: salvar mostra o erro e não manda nada (WEB-353).
  const spend = menu.getByLabel(/Gasto médio por pessoa/)
  await spend.fill('1500')
  let updates = 0
  page.on('request', (req) => {
    if (req.url().includes('pub.updateMenuInfo')) updates++
  })
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(
    menu.getByRole('alert').filter({ hasText: 'O valor aceita até' })
  ).toBeVisible()
  expect(updates).toBe(0)
  await spend.fill('85,50')

  const offer = page.getByRole('region', { name: /Oferta da casa/ })
  await offer.getByLabel('A oferta').fill('Chope em dobro no intervalo')
  await expect(offer).toContainText('PRÉVIA · O QUE O TORCEDOR VÊ')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
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

test('descartar volta ao que está gravado, sem chamar o servidor', async ({
  page
}) => {
  await openProfile(page)
  let updates = 0
  page.on('request', (req) => {
    if (req.url().includes('pub.update')) updates++
  })
  const name = editor(page).getByLabel('Nome do bar')
  const original = await name.inputValue()
  await name.fill('Outro nome')
  await expect(
    page.getByText('Alterações não salvas no seu espaço')
  ).toBeVisible()
  await page.getByRole('button', { name: 'Descartar' }).click()
  await expect(name).toHaveValue(original)
  await expect(
    page.getByRole('button', { name: 'Salvar alterações' })
  ).toHaveCount(0)
  expect(updates).toBe(0)
})

test('painel de avaliações e prévia de como o torcedor vê', async ({
  page,
  isMobile
}) => {
  const pub = await createPub()
  const { eventId } = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() - 2 * 86_400_000)
  })
  // Duas verificadas (check-in no jogo, WEB-408) e uma sem prova (WEB-451:
  // estrelas, comentário aprovado e nome só de quem quis).
  const avaliacoes = [
    {
      name: 'Marina Costa',
      wouldReturn: true,
      stars: 5,
      identified: true,
      comment: 'Som alto e telão enorme.',
      reasons: ['screen', 'sound'],
      verified: true
    },
    {
      name: 'Pedro Okada',
      wouldReturn: false,
      stars: 4,
      identified: false,
      comment: 'Demorou para servir.',
      reasons: [],
      verified: true
    },
    {
      name: 'Bia Torres',
      wouldReturn: false,
      stars: 1,
      identified: true,
      comment: null,
      reasons: ['screen', 'sound'],
      verified: false
    }
  ]
  for (const r of avaliacoes) {
    const fan = await createUser({ name: r.name })
    if (r.verified) {
      await insert('attendance_checkin', {
        user_id: fan.id,
        event_id: eventId,
        latitude: 0,
        longitude: 0,
        distance_m: 0
      })
    }
    await insert('bar_rating', {
      id: randomUUID(),
      bar_id: pub.barId,
      actor_user_id: fan.id,
      event_id: eventId,
      would_return: r.wouldReturn,
      reasons: r.reasons,
      stars: r.stars,
      identified: r.identified,
      comment: r.comment,
      comment_review: r.comment ? 'approved' : null
    })
  }
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')

  const ratings = page.getByRole('region', {
    name: 'Voltariam pra ver jogo aqui?'
  })
  // A nota é das verificadas: 1 de 2 voltaria, 4,5 estrelas.
  await expect(ratings).toContainText('50% voltariam')
  await expect(ratings).toContainText('4,5 de 5 estrelas')
  // Duas verificadas, abaixo do piso público de 5: o dono é avisado.
  await expect(ratings).toContainText('Ainda não aparece para o torcedor')
  await expect(ratings).toContainText('5 avaliações verificadas')
  await expect(ratings).toContainText('faltam 3')
  await expect(ratings).toContainText('1 avaliação não verificada fica')
  const rows = ratings.getByRole('listitem')
  await expect(rows).toHaveCount(3)
  // Nome só de quem escolheu; o resto é "Anônimo".
  await expect(ratings).toContainText('Marina Costa')
  await expect(ratings).toContainText('Som alto e telão enorme.')
  await expect(ratings).not.toContainText('Pedro Okada')
  await expect(ratings).toContainText('Anônimo')
  await expect(
    rows.filter({ hasText: 'Marina Costa' }).getByRole('img', {
      name: '5 de 5 estrelas'
    })
  ).toBeVisible()
  // A sem prova aparece para o dono, com o selo, e fora da nota; sem
  // comentário, a linha diz o que pesou (WEB-398).
  const semProva = rows.filter({ hasText: 'Bia Torres' })
  await expect(semProva).toContainText('NÃO VERIFICADA')
  await expect(semProva).toContainText('O que pesou: Telão, Som do jogo')

  // A prévia fica ao lado do formulário; abaixo de 1100 px ela some.
  if (!isMobile) {
    const preview = page.getByRole('complementary', { name: 'Prévia' })
    await expect(preview).toContainText(`Bar E2E ${pub.barId.slice(0, 8)}`)
    await expect(preview).toContainText('Página')
  }
})

test('Horário: liga a sexta, vira a meia-noite e salva com a barra', async ({
  page
}) => {
  const { barId } = await openProfile(page)
  const hours = page.getByRole('region', { name: 'Horário' })
  await hours.getByRole('switch', { name: 'Aberto sexta' }).click()
  await hours.getByLabel('Sexta abre').fill('17:00')
  await hours.getByLabel('Sexta fecha').fill('02:00')
  const saved = page.waitForResponse(/pub\.updateOpeningHours/)
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  expect((await saved).ok()).toBe(true)
  await expect(page.getByText('Alterações salvas.')).toBeVisible()

  const [bar] = await query<{ opening_hours: unknown }>(
    'SELECT opening_hours FROM bar WHERE id = $1',
    [barId]
  )
  expect(bar?.opening_hours).toEqual([
    null,
    null,
    null,
    null,
    null,
    { opens: '17:00', closes: '02:00' },
    null
  ])
})
