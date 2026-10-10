import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { expect, test } from '../../fixtures/test'
import { createUser, DEFAULT_PASSWORD } from '../../fixtures/users'

// WEB-177: onboarding do bar (`routes/(onboarding)/onboarding.pub.tsx`). O
// `completePub` geocodifica no servidor, contra o stub da LocationIQ.

const DRAFT_KEY = 'onside:pub-onboarding-draft'

const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' })
const progress = (page: Page) => page.getByText(/^Passo \d de 4$/)

/** Endereço único: a rua vai para o stub e para o cache do geocoding. */
const street = (tag = '') => `Rua E2E ${tag}${randomUUID().slice(0, 8)}, 100`

async function signInPendingPub(page: Page) {
  const owner = await createUser({ role: 'pub', onboardingCompleted: false })
  await signIn(page, owner)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/onboarding\/pub$/)
  return owner
}

type Establishment = {
  name: string
  address: string
  neighborhood: string
  city?: string
  phone?: string
}

async function fillEstablishment(page: Page, data: Establishment) {
  await page.getByLabel('Nome do estabelecimento').fill(data.name)
  await page.getByLabel('Endereço').fill(data.address)
  await page.getByLabel('Bairro').fill(data.neighborhood)
  if (data.city !== undefined)
    await page.getByLabel('Cidade', { exact: true }).fill(data.city)
  if (data.phone !== undefined) {
    await page.getByLabel('Telefone').fill(data.phone)
  }
}

/** Do passo 1 até a revisão, pulando as comodidades. */
async function reachReview(page: Page, data: Establishment) {
  await button(page, 'Começar').click()
  await fillEstablishment(page, data)
  await button(page, 'Continuar').click()
  await button(page, 'Pular').click()
  await expect(
    page.getByRole('heading', { name: 'Pronto para escolher o plano' })
  ).toBeVisible()
}

/**
 * Cadastro de bar pela tela. Com `autoSignIn: false` o onboarding abre sem
 * sessão, só com o e-mail pendente no `sessionStorage` da aba.
 */
async function signUpPub(page: Page) {
  // Gate da waitlist fechado (padrão): o signup só passa com convite aprovado.
  const email = `pub-draft-${randomUUID()}@e2e.test`
  await insert('waitlist_entries', {
    id: randomUUID(),
    email,
    role: 'pub',
    city: 'São Paulo',
    approved_at: new Date(),
    confirmed_at: new Date()
  })

  await page.goto('/signup')
  await button(page, /Dono de Bar/).click()
  await page.getByLabel('Nome completo').fill('Dona do Rascunho')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(DEFAULT_PASSWORD)
  await page
    .getByLabel('Confirmar senha', { exact: true })
    .fill(DEFAULT_PASSWORD)
  await button(page, 'Entrar no time').click()
  await expect(page).toHaveURL(/\/onboarding\/pub$/)
  return email
}

const storedDraft = async (page: Page) =>
  JSON.parse(
    (await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)) ??
      'null'
  ) as { email: string; draft: Record<string, unknown> } | null

async function barOf(userId: string) {
  return query(
    `SELECT name, address, neighborhood, city, uf, phone, description, amenities,
            screen_count, is_active
     FROM bar WHERE user_id = $1`,
    [userId]
  )
}

test('com sessão verificada: passos, completePub e /plan, bar nasce inativo', async ({
  page
}) => {
  const owner = await signInPendingPub(page)
  const address = street()

  // Boas-vindas
  await expect(progress(page)).toHaveText('Passo 1 de 4')
  await button(page, 'Começar').click()

  // Estabelecimento
  await expect(
    page.getByRole('heading', { name: 'Conta um pouco do seu bar.' })
  ).toBeVisible()
  await expect(page.getByLabel('Cidade', { exact: true })).toHaveValue(
    'São Paulo'
  )
  // WEB-270: a UF nasce com a da cidade que já vem preenchida.
  await expect(page.getByLabel('Estado (UF)')).toHaveValue('SP')
  await fillEstablishment(page, {
    name: 'Bar do Teste',
    address,
    neighborhood: 'Pinheiros',
    phone: '11987654321'
  })
  await button(page, 'Continuar').click()

  // Comodidades e telas
  await expect(
    page.getByRole('heading', { name: 'O que o torcedor encontra aí?' })
  ).toBeVisible()
  await expect(button(page, 'Pular')).toBeVisible()
  const telao = button(page, 'Telão / projetor')
  await telao.click()
  await expect(telao).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Quantas telas?').fill('4')
  await page.getByLabel('Mais alguma coisa? (opcional)').fill('Sinuca no fundo')
  await button(page, 'Continuar').click()

  // Revisão
  await expect(progress(page)).toHaveText('Passo 4 de 4')
  for (const dado of [
    'Bar do Teste',
    'Pinheiros',
    'Telão / projetor',
    address,
    '(11) 98765-4321',
    'Sinuca no fundo'
  ]) {
    await expect(page.getByText(dado, { exact: true })).toBeVisible()
  }
  await button(page, /Escolher meu plano/).click()
  await expect(page).toHaveURL(/\/plan$/)

  const [bar] = await barOf(owner.id)
  expect(bar).toMatchObject({
    name: 'Bar do Teste',
    address,
    neighborhood: 'Pinheiros',
    city: 'São Paulo',
    uf: 'SP',
    phone: '+5511987654321',
    description: 'Sinuca no fundo',
    // 1 = "Telão / projetor" em `packages/api/src/lib/amenities.ts`.
    amenities: [1],
    screen_count: 4,
    is_active: false
  })
  const [user] = await query(
    'SELECT onboarding_completed FROM "user" WHERE id = $1',
    [owner.id]
  )
  expect(user?.onboarding_completed).toBe(true)
})

test('validações do estabelecimento: nome, bairro, endereço e telefone', async ({
  page
}) => {
  await signInPendingPub(page)
  await button(page, 'Começar').click()
  const continuar = button(page, 'Continuar')

  await expect(continuar).toBeDisabled()
  // WEB-270: o botão desabilitado diz o que falta.
  await expect(continuar).toHaveAccessibleDescription(
    'Para continuar, falta preencher: nome do estabelecimento, endereço, bairro.'
  )
  const valid = {
    name: 'Bar Válido',
    address: street(),
    neighborhood: 'Centro'
  }
  // Cada campo no limite de baixo segura o botão; um caractere a mais solta.
  for (const [label, short, ok] of [
    ['Nome do estabelecimento', 'B', 'Bo'],
    ['Bairro', 'C', 'Ce'],
    ['Endereço', 'Rua ', 'Rua A']
  ] as const) {
    await fillEstablishment(page, valid)
    await expect(continuar).toBeEnabled()
    await page.getByLabel(label).fill(short)
    await expect(continuar).toBeDisabled()
    await page.getByLabel(label).fill(ok)
    await expect(continuar).toBeEnabled()
  }
  await expect(continuar).toHaveAccessibleDescription('')
  await page.getByLabel('Endereço').fill('Rua ')
  await expect(continuar).toHaveAccessibleDescription(
    'Para continuar, falta preencher: endereço (pelo menos 5 caracteres).'
  )

  // Telefone: conferido ao avançar, com a mesma regra do servidor.
  await fillEstablishment(page, { ...valid, phone: '1198765' })
  await continuar.click()
  await expect(page.getByRole('alert')).toHaveText(/Telefone incompleto/)
  await expect(page.getByLabel('Telefone')).toHaveAttribute(
    'aria-describedby',
    'pub-phone-error'
  )
  await page.getByLabel('Telefone').fill('2098765432')
  await continuar.click()
  await expect(page.getByRole('alert')).toHaveText(/DDD 20 não existe/)

  await page.getByLabel('Telefone').fill('1132654321')
  await continuar.click()
  await expect(
    page.getByRole('heading', { name: 'O que o torcedor encontra aí?' })
  ).toBeVisible()
})

test('geocoding fora do ar pede para tentar em instantes e não cria o bar', async ({
  page
}) => {
  const owner = await signInPendingPub(page)
  const address = street('falha-geocoding ')
  await reachReview(page, {
    name: 'Bar Sem Mapa',
    address,
    neighborhood: 'Centro'
  })

  await button(page, /Escolher meu plano/).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Não foi possível validar o endereço agora. Tente novamente em instantes.'
  )
  await expect(page).toHaveURL(/\/onboarding\/pub$/)
  await expect(button(page, /Escolher meu plano/)).toBeEnabled()

  // O servidor chegou a consultar o geocoding — a falha é do provedor.
  const calls = (await (
    await page.request.get(`${STUB_URL}/locationiq/calls`)
  ).json()) as { street: string }[]
  expect(calls.map((c) => c.street)).toContain(address)
  expect(await barOf(owner.id)).toHaveLength(0)
})

test('endereço que o geocoding não acha pede para conferir a rua', async ({
  page
}) => {
  const owner = await signInPendingPub(page)
  await reachReview(page, {
    name: 'Bar Perdido',
    address: street('inexistente '),
    neighborhood: 'Centro'
  })

  await button(page, /Escolher meu plano/).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Não encontramos esse endereço em São Paulo, SP. Confira a rua, o número, a cidade e o estado.'
  )
  expect(await barOf(owner.id)).toHaveLength(0)
})

test('UF acompanha a cidade, vai ao geocoding e é gravada no bar (WEB-270)', async ({
  page
}) => {
  const owner = await signInPendingPub(page)
  const address = street()
  await button(page, 'Começar').click()
  await fillEstablishment(page, {
    name: 'Bar da UF',
    address,
    neighborhood: 'Centro'
  })
  const cidade = page.getByLabel('Cidade', { exact: true })
  const uf = page.getByLabel('Estado (UF)')
  const continuar = button(page, 'Continuar')

  // Cidade que só existe em um estado troca a UF ao sair do campo.
  await cidade.fill('Curitiba')
  await cidade.blur()
  await expect(uf).toHaveValue('PR')

  // Homônima em vários estados: a UF esvazia e o botão diz o que falta.
  await cidade.fill('Bom Jesus')
  await cidade.blur()
  await expect(uf).toHaveValue('')
  await expect(continuar).toBeDisabled()
  await expect(continuar).toHaveAccessibleDescription(
    'Para continuar, falta preencher: estado (UF).'
  )
  await uf.selectOption('RN')
  await continuar.click()
  await button(page, 'Pular').click()
  await expect(page.getByText('Bom Jesus, RN', { exact: true })).toBeVisible()
  await button(page, /Escolher meu plano/).click()
  await expect(page).toHaveURL(/\/plan$/)

  const [bar] = await barOf(owner.id)
  expect(bar).toMatchObject({ city: 'Bom Jesus', uf: 'RN' })
  const calls = (await (
    await page.request.get(`${STUB_URL}/locationiq/calls`)
  ).json()) as { street: string; state: string | null }[]
  expect(calls.find((c) => c.street === address)?.state).toBe(
    'Rio Grande do Norte'
  )
})

test('rascunho de antes da UF não é enviado: abre no formulário pedindo o estado (WEB-270)', async ({
  page
}) => {
  const owner = await signInPendingPub(page)
  // Cidade homônima, para a UF não ser preenchida sozinha.
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [
      DRAFT_KEY,
      JSON.stringify({
        draft: {
          name: 'Bar Antigo',
          address: street(),
          neighborhood: 'Centro',
          city: 'Bom Jesus'
        },
        email: owner.email,
        expiresAt: Date.now() + 3_600_000
      })
    ]
  )

  await page.goto('/verify-email?confirmed=1')
  await expect(page).toHaveURL(/\/onboarding\/pub$/)
  await expect(page.getByLabel('Nome do estabelecimento')).toHaveValue(
    'Bar Antigo'
  )
  await expect(page.getByLabel('Estado (UF)')).toHaveValue('')
  await expect(button(page, 'Continuar')).toHaveAccessibleDescription(
    'Para continuar, falta preencher: estado (UF).'
  )
  expect(await barOf(owner.id)).toHaveLength(0)
})

test('sem sessão, vindo do signup: rascunho, /verify-email e link do outbox concluem em /plan', async ({
  page
}) => {
  const email = await signUpPub(page)
  const session = await page.request.get('/api/auth/get-session')
  expect(await session.json()).toBeNull()

  const address = street()
  await reachReview(page, {
    name: 'Bar do Rascunho',
    address,
    neighborhood: 'Moema',
    phone: '11987654321'
  })
  await button(page, /Escolher meu plano/).click()

  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByText(email)).toBeVisible()
  const draft = await storedDraft(page)
  expect(draft?.draft).toMatchObject({
    name: 'Bar do Rascunho',
    address,
    neighborhood: 'Moema',
    uf: 'SP'
  })

  // Mesmo contexto do navegador: o rascunho está no localStorage dele.
  const verification = await lastEmailTo(email)
  await page.goto(verification.link)
  await expect(page).toHaveURL(/\/plan$/)

  const [owner] = await query<{ id: string; onboarding_completed: boolean }>(
    'SELECT id, onboarding_completed FROM "user" WHERE email = $1',
    [email]
  )
  expect(owner?.onboarding_completed).toBe(true)
  const [bar] = await barOf(owner?.id ?? '')
  expect(bar).toMatchObject({
    name: 'Bar do Rascunho',
    address,
    phone: '+5511987654321',
    is_active: false
  })
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)
  ).toBeNull()
})

test('aba sem sessão e sem cadastro pede o login antes do wizard, e o bar preenchido depois é salvo (WEB-349)', async ({
  page
}) => {
  // Aba nova, sem o `sessionStorage` do cadastro: antes o wizard abria, e ao
  // concluir a revisão o rascunho não tinha dono — nada era salvo.
  const owner = await createUser({ role: 'pub', onboardingCompleted: false })
  await page.goto('/onboarding/pub')
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fonboarding%2Fpub$/)

  await page.getByLabel('E-mail').fill(owner.email)
  await page.getByLabel('Senha', { exact: true }).fill(owner.password)
  await button(page, 'Acessar minha conta').click()
  await expect(page).toHaveURL(/\/onboarding\/pub$/)

  await reachReview(page, {
    name: 'Bar da Aba Nova',
    address: street(),
    neighborhood: 'Centro'
  })
  await button(page, /Escolher meu plano/).click()
  await expect(page).toHaveURL(/\/plan$/)
  expect(await barOf(owner.id)).toHaveLength(1)
})

test('recarregar no meio do wizard volta ao passo e aos dados, e concluir apaga o rascunho', async ({
  page
}) => {
  const owner = await signInPendingPub(page)
  const address = street()
  await button(page, 'Começar').click()
  await fillEstablishment(page, {
    name: 'Bar Recarregado',
    address,
    neighborhood: 'Lapa',
    phone: '11987654321'
  })
  await button(page, 'Continuar').click()
  const telao = button(page, 'Telão / projetor')
  await telao.click()
  await page.getByLabel('Quantas telas?').fill('3')
  await page.getByLabel('Mais alguma coisa? (opcional)').fill('Chope gelado')
  await expect
    .poll(async () => (await storedDraft(page))?.draft)
    .toMatchObject({ description: 'Chope gelado', step: 2 })

  // `goto`, e não `reload`: só o `goto` da suíte espera a hidratação.
  await page.goto(page.url())
  await expect(progress(page)).toHaveText('Passo 3 de 4')
  await expect(telao).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Quantas telas?')).toHaveValue('3')
  await expect(page.getByLabel('Mais alguma coisa? (opcional)')).toHaveValue(
    'Chope gelado'
  )
  await button(page, 'Voltar').click()
  await expect(page.getByLabel('Nome do estabelecimento')).toHaveValue(
    'Bar Recarregado'
  )
  await expect(page.getByLabel('Endereço')).toHaveValue(address)
  await expect(page.getByLabel('Bairro')).toHaveValue('Lapa')

  await button(page, 'Continuar').click()
  await button(page, 'Continuar').click()
  await button(page, /Escolher meu plano/).click()
  await expect(page).toHaveURL(/\/plan$/)
  expect(await storedDraft(page)).toBeNull()
  const [bar] = await barOf(owner.id)
  expect(bar).toMatchObject({
    name: 'Bar Recarregado',
    address,
    phone: '+5511987654321',
    description: 'Chope gelado',
    amenities: [1],
    screen_count: 3
  })
})

test('rascunho parado no meio do wizard, de outra conta, não aparece (WEB-262)', async ({
  page
}) => {
  await signInPendingPub(page)
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [
      DRAFT_KEY,
      JSON.stringify({
        draft: {
          name: 'Bar Alheio',
          address: street(),
          neighborhood: 'Centro',
          city: 'São Paulo',
          uf: 'SP',
          step: 2
        },
        email: 'outra-conta@e2e.test',
        expiresAt: Date.now() + 3_600_000
      })
    ]
  )

  await page.goto('/onboarding/pub')
  await expect.poll(() => storedDraft(page)).toBeNull()
  await expect(progress(page)).toHaveText('Passo 1 de 4')
  await button(page, 'Começar').click()
  await expect(page.getByLabel('Nome do estabelecimento')).toHaveValue('')
})

test('com sessão de B na aba do cadastro de A, o rascunho e o bar são de B', async ({
  page
}) => {
  const pendente = await signUpPub(page)
  // B entra "em outra aba": o cookie cai no navegador, e esta aba segue com o
  // e-mail pendente de A e o contexto de rota sem sessão.
  const b = await createUser({ role: 'pub', onboardingCompleted: false })
  await signIn(page, b)
  // É na volta à aba que o better-auth relê a sessão. No headless a aba nunca
  // fica oculta, então o `visibilitychange` é disparado à mão.
  const sessaoRelida = page.waitForResponse((response) =>
    response.url().includes('/api/auth/get-session')
  )
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  await sessaoRelida

  await button(page, 'Começar').click()
  await fillEstablishment(page, {
    name: 'Bar de B',
    address: street(),
    neighborhood: 'Centro'
  })
  await button(page, 'Continuar').click()
  await expect
    .poll(() => storedDraft(page))
    .toMatchObject({ email: b.email, draft: { name: 'Bar de B', step: 2 } })

  await button(page, 'Pular').click()
  await button(page, /Escolher meu plano/).click()
  await expect(page).toHaveURL(/\/plan$/)
  expect(await barOf(b.id)).toMatchObject([{ name: 'Bar de B' }])
  expect(
    await query(
      'SELECT 1 FROM bar JOIN "user" u ON u.id = bar.user_id WHERE u.email = $1',
      [pendente]
    )
  ).toHaveLength(0)
})

test('rascunho parado no meio do wizard não é enviado pela confirmação do e-mail: volta ao passo', async ({
  page
}) => {
  const email = await signUpPub(page)
  await button(page, 'Começar').click()
  await fillEstablishment(page, {
    name: 'Bar Pela Metade',
    address: street(),
    neighborhood: 'Moema'
  })
  await button(page, 'Continuar').click()
  await expect
    .poll(async () => (await storedDraft(page))?.draft)
    .toMatchObject({ step: 2 })

  const verification = await lastEmailTo(email)
  await page.goto(verification.link)
  await expect(page).toHaveURL(/\/onboarding\/pub$/)
  await expect(progress(page)).toHaveText('Passo 3 de 4')
  expect(
    await query(
      'SELECT 1 FROM bar JOIN "user" u ON u.id = bar.user_id WHERE u.email = $1',
      [email]
    )
  ).toHaveLength(0)

  await button(page, 'Pular').click()
  await expect(page.getByText('Bar Pela Metade', { exact: true })).toBeVisible()
  await button(page, /Escolher meu plano/).click()
  await expect(page).toHaveURL(/\/plan$/)
  expect(await storedDraft(page)).toBeNull()
})

test('o cache da sessão expira na resposta do cadastro, mesmo se o pedido do cliente falha', async ({
  page
}) => {
  // O servidor da suíte roda sem cookie cache, então o cookie é posto à mão:
  // é o que o navegador teria em produção, com `onboardingCompleted: false`.
  // Com ele de pé o guard devolvia ao onboarding quem acabou de concluir.
  const cache = async () =>
    (await page.context().cookies()).filter(
      (cookie) => cookie.name === 'better-auth.session_data'
    )
  await signInPendingPub(page)
  await page
    .context()
    .addCookies([
      { name: 'better-auth.session_data', value: 'antigo', url: BASE_URL }
    ])
  await page.route('**/api/auth/expire-session-cache', (route) => route.abort())

  await reachReview(page, {
    name: 'Bar do Cache',
    address: street(),
    neighborhood: 'Centro'
  })
  expect(await cache()).toHaveLength(1)
  await button(page, /Escolher meu plano/).click()
  await expect(page).toHaveURL(/\/plan$/)
  expect(await cache()).toHaveLength(0)
})

const pathOf = (page: Page) => {
  const url = new URL(page.url())
  return url.pathname + url.search
}

/** Bar sem acesso abre `from`, espera em /access-pending e é liberado. */
async function admitWhileWaiting(page: Page, from: string) {
  const owner = await createUser({
    role: 'pub',
    admitted: false,
    onboardingCompleted: false
  })
  await signIn(page, owner)
  await page.goto(from)
  await expect(page).toHaveURL(/\/access-pending\?callbackUrl=/)
  await query('UPDATE "user" SET admitted_at = now() WHERE id = $1', [owner.id])
  // `goto`, e não `reload`: só o `goto` da suíte espera a hidratação, e o
  // clique em "Começar" antes dela se perde.
  await page.goto(page.url())
}

test('link direto que esperou a liberação sobrevive ao onboarding do bar', async ({
  page
}) => {
  const deepLink = '/admin/billing?ref=email'
  await admitWhileWaiting(page, deepLink)
  await expect
    .poll(() => pathOf(page))
    .toBe(`/onboarding/pub?callbackUrl=${encodeURIComponent(deepLink)}`)

  await reachReview(page, {
    name: 'Bar do Link',
    address: street(),
    neighborhood: 'Pinheiros'
  })
  await button(page, /Escolher meu plano/).click()
  await expect.poll(() => pathOf(page)).toBe(deepLink)
})

test('bar que esperou a liberação no próprio onboarding volta a ele sem laço', async ({
  page
}) => {
  await admitWhileWaiting(page, '/onboarding/pub')
  // O onboarding não carrega a si mesmo como destino.
  await expect.poll(() => pathOf(page)).toBe('/onboarding/pub')

  await reachReview(page, {
    name: 'Bar Sem Laço',
    address: street(),
    neighborhood: 'Pinheiros'
  })
  await button(page, /Escolher meu plano/).click()
  await expect(page).toHaveURL(/\/plan$/)
})
