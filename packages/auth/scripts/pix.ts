/**
 * Configuração do Pix na AbacatePay, conferida e montada pela API.
 *
 *   bun run pix:check   confere a conta da chave: produtos e preços, webhook
 *                       deste endereço, e se a conta aceita Pix em assinatura
 *   bun run pix:setup   cria (ou recria) o webhook deste endereço com o segredo
 *                       do ambiente, para o Worker e a AbacatePay terem o mesmo
 *
 * A chave, o segredo e o endereço vêm do ambiente, como no Worker. Para
 * produção, com os valores dos segredos do `onside-web`:
 *
 *   ABACATE_PAY_API_KEY=abc_prod_... ABACATE_PAY_WEBHOOK_SECRET=... \
 *   PUBLIC_APP_URL=https://www.onside.sh bun run pix:check
 *
 * O segredo não volta pela API depois de criado. Por isso o webhook nasce do
 * `setup`, com o segredo deste ambiente, e o `check` manda um aviso assinado
 * com ele ao endpoint publicado: 200 prova que o Worker tem o mesmo. Nada
 * aqui imprime chave nem segredo.
 */
import { env, getPublicAppUrl } from '@findsports_oficial/env/server'
import {
  AbacatePayError,
  createPixSubscriptionCheckout,
  createWebhook,
  deleteCustomer,
  deleteSubscriptionCheckout,
  deleteWebhook,
  getProduct,
  listWebhooks,
  upsertCustomer
} from '../src/abacatepay'
import { PIX_FOUNDER_DISCOUNT_REAIS } from '../src/pix-sync'
import { PIX_WEBHOOK_EVENTS, signatureFor } from '../src/pix-webhook'

// Preço de tabela de cada plano (`pricesFor` em apps/web/src/lib/plan-catalog.ts).
const TABLE_PRICE_REAIS = { starter: 97, pro: 147, elite: 297 } as const

const key = env.ABACATE_PAY_API_KEY
if (!key) {
  console.error('Falta ABACATE_PAY_API_KEY no ambiente.')
  process.exit(1)
}
const production = key.startsWith('abc_prod_')
const endpoint = new URL('/api/abacatepay/webhook', getPublicAppUrl()).href
console.log(
  `Conta: ${production ? 'PRODUÇÃO' : 'Modo Teste'} · webhook esperado: ${endpoint}`
)

const problems: string[] = []
const ok = (text: string) => console.log(`  ok  ${text}`)
const bad = (text: string) => {
  problems.push(text)
  console.log(`  ✗   ${text}`)
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

async function checkProducts() {
  console.log('\nProdutos')
  for (const [plan, table] of Object.entries(TABLE_PRICE_REAIS)) {
    for (const founder of [false, true]) {
      const externalId = `${plan}_${founder ? 'founder_' : ''}monthly`
      const cents = (table - (founder ? PIX_FOUNDER_DISCOUNT_REAIS : 0)) * 100
      try {
        const product = await getProduct(externalId)
        const wrong = [
          product.price !== cents &&
            `preço ${product.price / 100} (esperado ${cents / 100})`,
          product.cycle !== 'MONTHLY' && `ciclo ${product.cycle}`,
          product.currency !== 'BRL' && `moeda ${product.currency}`,
          product.status !== 'ACTIVE' && `situação ${product.status}`
        ].filter(Boolean)
        if (wrong.length) bad(`${externalId}: ${wrong.join(', ')}`)
        else ok(`${externalId}: R$ ${cents / 100} por mês`)
      } catch (error) {
        bad(`${externalId}: ${message(error)}`)
      }
    }
  }
}

async function checkWebhook() {
  console.log('\nWebhook')
  if (!env.ABACATE_PAY_WEBHOOK_SECRET) {
    bad('falta ABACATE_PAY_WEBHOOK_SECRET: o Worker recusaria todo aviso')
  }
  const hooks = await listWebhooks()
  const ours = hooks.filter((hook) => hook.endpoint === endpoint)
  if (ours.length === 0) {
    bad(`nenhum webhook aponta para ${endpoint}: rode pix:setup`)
    return
  }
  if (ours.length > 1) {
    bad(`${ours.length} webhooks apontam para o mesmo endereço: rode pix:setup`)
  }
  for (const hook of ours) {
    const missing = PIX_WEBHOOK_EVENTS.filter((e) => !hook.events.includes(e))
    if (missing.length) bad(`${hook.id} sem os eventos ${missing.join(', ')}`)
    else if (hook.devMode === production) {
      bad(`${hook.id} é do outro ambiente (devMode ${hook.devMode})`)
    } else ok(`${hook.id} (${hook.name}) com os 4 eventos`)
  }
  console.log(
    '      O segredo não volta pela API: o do webhook é o deste ambiente se ele nasceu do pix:setup.'
  )
}

/**
 * Manda ao endpoint publicado um aviso de um evento que o app ignora,
 * assinado como a AbacatePay assina e com o segredo deste ambiente. 200 diz
 * que o Worker está no ar com o Pix ligado e com o mesmo segredo; 401, que
 * o segredo dele é outro; 503, que falta chave ou segredo no Worker.
 */
async function checkEndpoint() {
  console.log('\nEndpoint publicado')
  const secret = env.ABACATE_PAY_WEBHOOK_SECRET
  if (!secret) return
  const raw = JSON.stringify({ event: 'onside.verificacao', data: {} })
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': secret,
        'x-webhook-signature': await signatureFor(raw)
      },
      body: raw,
      signal: AbortSignal.timeout(10_000)
    })
    if (response.status === 200) ok('responde 200 com o segredo deste ambiente')
    else if (response.status === 401) {
      bad(
        '401: o segredo do Worker é outro. Ponha o mesmo nos dois e rode pix:setup.'
      )
    } else if (response.status === 503) {
      bad(
        '503: o Worker está sem ABACATE_PAY_API_KEY ou ABACATE_PAY_WEBHOOK_SECRET.'
      )
    } else bad(`respondeu ${response.status}`)
  } catch (error) {
    bad(`não respondeu: ${message(error)}`)
  }
}

/**
 * Abre e apaga um checkout de assinatura Pix do Starter: prova que a conta
 * tem assinaturas e Pix Automático liberados (em produção, pelo suporte) e
 * que o cliente sem CPF/CNPJ é aceito. Nada é cobrado: o checkout é apagado
 * sem ninguém o abrir.
 */
async function checkPixCheckout() {
  console.log('\nCheckout de assinatura com Pix')
  let customerId: string | null = null
  let checkoutId: string | null = null
  try {
    customerId = await upsertCustomer({
      email: 'verificacao-pix@onside.sh',
      name: 'Verificação Onside'
    })
    ok('cliente sem CPF/CNPJ aceito (o checkout pede o documento)')
    const productId = (await getProduct('starter_monthly')).id
    const checkout = await createPixSubscriptionCheckout({
      productId,
      customerId,
      externalId: `onside:verificacao:${Date.now()}`,
      completionUrl: new URL('/plan', getPublicAppUrl()).href,
      returnUrl: new URL('/plan', getPublicAppUrl()).href
    })
    checkoutId = checkout.id
    ok('checkout de assinatura com PIX aberto')
  } catch (error) {
    const text = message(error)
    bad(
      /pix|method|subscription|assinatura/i.test(text)
        ? `${text}. Assinaturas ou Pix Automático não liberados na conta? Pedir a ajuda@abacatepay.com.`
        : text
    )
  } finally {
    if (checkoutId) {
      await deleteSubscriptionCheckout(checkoutId).catch((error) =>
        bad(`não consegui apagar o checkout ${checkoutId}: ${message(error)}`)
      )
    }
    if (customerId) {
      await deleteCustomer(customerId).catch((error) =>
        bad(`não consegui apagar o cliente ${customerId}: ${message(error)}`)
      )
    }
  }
}

async function setup() {
  const secret = env.ABACATE_PAY_WEBHOOK_SECRET
  if (!secret) {
    console.error(
      'Falta ABACATE_PAY_WEBHOOK_SECRET: o webhook nasce com o segredo do Worker.'
    )
    process.exit(1)
  }
  // Sem rota de atualização na API: o do mesmo endereço sai e entra de novo.
  // Entre os dois, um aviso pode se perder; a AbacatePay não reenvia 404.
  for (const hook of await listWebhooks()) {
    if (hook.endpoint !== endpoint) continue
    await deleteWebhook(hook.id)
    console.log(`  apagado ${hook.id} (${hook.name})`)
  }
  const created = await createWebhook({
    name: production ? 'onside-producao' : 'onside-teste',
    endpoint,
    secret,
    events: [...PIX_WEBHOOK_EVENTS]
  })
  console.log(`  criado ${created.id} para ${created.endpoint}`)
}

const command = process.argv[2]
try {
  if (command === 'setup') {
    await setup()
    await checkWebhook()
    await checkEndpoint()
  } else if (command === 'check') {
    await checkProducts()
    await checkWebhook()
    await checkEndpoint()
    await checkPixCheckout()
  } else {
    console.error('Uso: pix.ts check | setup')
    process.exit(1)
  }
} catch (error) {
  const status = error instanceof AbacatePayError ? ` (${error.status})` : ''
  console.error(`\nFalhou${status}: ${message(error)}`)
  process.exit(1)
}

if (problems.length) {
  console.log(`\n${problems.length} problema(s).`)
  process.exit(1)
}
console.log('\nTudo certo.')
process.exit(0)
