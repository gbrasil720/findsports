# E2E com Playwright (WEB-174)

Suíte de navegador em `apps/e2e`. Sobe o app com `vite dev` contra um Postgres
descartável, roda cada teste em Chromium desktop e em Chromium com viewport de
Pixel 7, e não sai para a rede: e-mail, LocationIQ, R2 (fotos), Stripe e tiles
do mapa são dublês.

```bash
bun run test:e2e                              # tudo, nos dois projetos
bun run test:e2e -- --project=desktop         # só desktop (o setup vem junto)
bun run test:e2e -- --ui                      # modo interativo

# Um recorte: SEMPRE com --project=desktop --project=mobile (ver abaixo)
bun run test:e2e -- --project=desktop --project=mobile tests/auth

# Só os seriais de um recorte, como o CI: setup, depois os seriais sem deps
bun run test:e2e -- --project=setup
bun run test:e2e -- --project=desktop-serial --no-deps tests/billing
```

**Recorte por caminho puxa a suíte inteira se pegar um `*.serial.e2e.ts`.**
`bun run test:e2e -- tests/billing` roda quase a suíte toda, não só
`tests/billing`: `checkout.serial.e2e.ts` cai em `desktop-serial`, que depende de
`desktop` e `mobile`, e projeto de dependência roda inteiro, sem o filtro de
caminho. A maioria das áreas tem um serial (`ls apps/e2e/tests/*/*.serial.e2e.ts`).
`--project=desktop --project=mobile` deixa os seriais de fora e roda só o
recorte. Para os seriais, rode `setup` e depois `desktop-serial`/`mobile-serial`
com `--no-deps`, em comandos separados como no CI: com `--no-deps` nada garante
que o `setup` rode antes. Na dúvida, confira a contagem com `--list` antes.

Os argumentos depois de `--` chegam inteiros ao Playwright; o script só faz
`cd apps/e2e && bunx playwright test`, e o caminho é relativo a `apps/e2e`.

## Rodar local

1. Postgres com PostGIS na porta 5434 (uma vez):

   ```bash
   docker run -d --name findsports_e2e -p 127.0.0.1:5434:5432 \
     -e POSTGRES_USER=findsports_e2e -e POSTGRES_PASSWORD=findsports_e2e_local \
     -e POSTGRES_DB=findsports_e2e imresamu/postgis:17-3.5-alpine
   ```

2. Chromium do Playwright (uma vez por versão): `cd apps/e2e && bunx playwright install chromium`.

3. `bun run test:e2e`. O `webServer` do Playwright migra o banco, semeia
   esportes e times, sobe o stub e o app, e derruba tudo no fim.

### Variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `E2E_PORT` | `3201` | Porta do `vite dev` da suíte |
| `E2E_STUB_PORT` | `3202` | Porta do stub (LocationIQ, API do Stripe e tiles) |
| `E2E_DATABASE_URL` | `postgres://findsports_e2e:findsports_e2e_local@127.0.0.1:5434/findsports_e2e` | Banco da suíte |

Várias worktrees podem rodar ao mesmo tempo desde que cada uma tenha portas e
banco próprios:

```bash
docker exec findsports_e2e createdb -U findsports_e2e findsports_e2e_minha
E2E_PORT=4000 E2E_STUB_PORT=4001 \
E2E_DATABASE_URL=postgres://findsports_e2e:findsports_e2e_local@127.0.0.1:5434/findsports_e2e_minha \
bun run test:e2e
```

O resolver de `packages/db` só aceita `E2E_DATABASE_URL` em loopback e com
banco `findsports_e2e` ou `findsports_e2e_<sufixo>`, e ela vence o
`findsports_dev` que o `NODE_ENV=development` fixaria. Porta ocupada derruba a
rodada (`reuseExistingServer: false`): nunca reaproveita o servidor de outra
worktree por engano.

O resto do ambiente do servidor está em `apps/e2e/env.ts` (`SERVER_ENV`). Toda
chave que o `apps/web/.env` de quem roda local pode trazer com valor real
(Resend, LocationIQ, Stripe, Redis, PostHog) é sobrescrita ali, nem que seja com
vazio.

## Estrutura

```
apps/e2e/
  playwright.config.ts   projetos, webServer, trace/vídeo só em falha
  env.ts                 portas, URLs, segredos de teste, ambiente do servidor
  stubs/server.ts        LocationIQ + API do Stripe + TileJSON/tiles vazios (Bun)
  fixtures/              blocos para os testes — um arquivo por assunto
  tests/setup.setup.ts   estado global limpo + uma sessão por papel
  tests/smoke/           sentinela e prova de que cada dublê está ligado
  tests/<área>/          um diretório por área
```

| Diretório | Ticket |
|---|---|
| `tests/auth` | WEB-175 — cadastro, login, 2FA, conta, guarda de rota |
| `tests/onboarding` | WEB-177 — onboarding de torcedor e de bar |
| `tests/fan` | WEB-178 — busca, mapa, página do bar, reservas, perfil |
| `tests/pub-admin` | WEB-179 — painel do bar, validação, cobrança |
| `tests/billing` | WEB-180 — `/plan`, checkout, webhooks |
| `tests/internal` | WEB-181 — painéis internos |

Fixture nova (eventos, reservas…) entra num arquivo novo em `fixtures/`, em vez
de crescer um arquivo central.

## Escrevendo teste

Arquivo `*.e2e.ts`, importando `test` e `expect` de `fixtures/test.ts` — nunca
direto de `@playwright/test`. Esse `test` faz duas coisas sozinho:

- **IP próprio por teste** (`x-forwarded-for` aleatório). O rate limit do
  better-auth (3 logins por 10s) conta por IP no banco; sem isso os workers
  paralelos esgotariam o mesmo balde.
- **`page.goto` espera a hidratação** (`html[data-hydrated]`, gravado pelo
  `__root.tsx`). Antes dela o formulário é HTML puro, e preencher + clicar faz
  submit nativo (um POST para a própria rota, WEB-189) em vez do envio do app.

```ts
import { signIn, storageState } from '../../fixtures/auth'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

test.describe('com a sessão pronta de torcedor', () => {
  test.use({ storageState: storageState('fan') })

  test('abre o dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})

test('dono de bar Starter vê o limite', async ({ page }) => {
  const { user, barId } = await createPub({ subscription: { plan: 'starter' } })
  await signIn(page, user)
  await page.goto('/admin#admin-grade')
})
```

### Dados

- `createUser({ role, emailVerified, onboardingCompleted, … })`
  (`fixtures/users.ts`): usuário com conta de senha, e-mail único. Padrão: fan,
  verificado, onboarding feito. Admin só nasce por aqui.
- `createPub({ subscription, bar, user })` (`fixtures/pubs.ts`): dono + bar
  ativo no centro de São Paulo + assinatura (padrão Elite ativa por 30 dias;
  `subscription: null` cria sem). `bar` aceita colunas em snake_case.
- `insert(tabela, linha)` e `query(sql, valores)` (`fixtures/db.ts`) para o
  resto. SQL cru com `pg`: o Playwright roda em Node e não carrega o TypeScript
  dos pacotes do workspace, então o Drizzle de `packages/db` não serve aqui.
- Esportes e times já estão semeados (`db:seed:sports` e `db:seed:teams`).
- `seedTwoFactor(userId)` e `totp(chave)` (`fixtures/two-factor.ts`): liga o 2FA
  direto no banco, cifrado como o plugin cifra, e calcula o código. Entre com
  `signIn` **antes** de ligar: com 2FA ativo o login pela API não abre sessão.

### Sessão

- `storageState('fan' | 'pub' | 'admin')` (`fixtures/auth.ts`): sessões criadas
  uma vez por rodada pelo `setup`. **Só leitura**: são compartilhadas por todos
  os testes paralelos. Teste que muda a própria conta (senha, papel, 2FA,
  onboarding, exclusão) cria um usuário seu e entra com `signIn(page, user)`,
  que loga pela API e põe o cookie no contexto da página.
- Teste da tela de login usa o formulário.

### Estado global: arquivos `*.serial.e2e.ts`

`app_config` é uma tabela global, e os testes paralelos contam com os padrões
de produção (nota pública desligada, todas as cidades liberadas). Teste que
muda uma chave vai num arquivo `*.serial.e2e.ts`, com
`setAppConfig(chave, valor)` e `resetAppConfig()` no `afterEach`
(`fixtures/db.ts`).

Cobrança não tem chave (WEB-233): checkout aberto, teste grátis de 120 dias no
cadastro do bar e cupom de fundador valem em todo teste. O que é global ali é o
estado do cupom no stub do Stripe: `setFounderCoupon(request, estado)`
(`fixtures/stripe.ts`) também só em arquivo serial, com `'valid'` de volta no
`afterEach`.

Esses arquivos rodam nos projetos `desktop-serial` e `mobile-serial`, com um
worker só, **depois** que `desktop` e `mobile` terminam. Consequência: se um
teste paralelo falha, os seriais não rodam (dependência de projeto do
Playwright). Corrija o paralelo primeiro. Pelo mesmo motivo, recorte por
caminho que pega um serial roda a suíte paralela inteira — ver o topo.

### Seletores

`getByRole` e `getByLabel` — a UI tem ARIA consistente. Cuidado com
`getByLabel('Senha')`: casa também com "Mostrar senha"; use `{ exact: true }`.
`data-testid` só onde não houver papel acessível.

Rótulo curto que é pedaço de nome de rota precisa de `{ exact: true }`: em
`vite dev` as devtools do TanStack Router criam um botão por rota com
`aria-label="Open match details for <rota>"`, e `getByLabel('Cidade')` casava
com o de `/privacidade` (WEB-240).

## Dublês

| Serviço | Como | Helper |
|---|---|---|
| E-mail (Resend) | `E2E_EMAIL_OUTBOX`: `sendEmailWithResend` grava uma linha JSON por e-mail em `apps/e2e/.outbox/emails.jsonl` e responde como entregue. Vem antes da Resend, então nem uma chave real sai | `lastEmailTo(email, { subject })` em `fixtures/email.ts`, com `.link` (o link de ação) |
| LocationIQ | `LOCATIONIQ_BASE_URL` aponta o geocoding do servidor para o stub. Rua com `falha-geocoding` → 503 (o app responde `SERVICE_UNAVAILABLE`); com `inexistente` → 404 (endereço não encontrado); resto → centro de São Paulo | `GET ${STUB_URL}/locationiq/calls` lista as consultas recebidas |
| R2 (fotos) | O upload sai do navegador: `page.route` responde o PUT em `*.r2.cloudflarestorage.com` (e o preflight) sem rede e serve um pixel em `MEDIA_PUBLIC_ORIGIN`. A URL assinada sai da rota real, com chave falsa | `interceptMediaUploads(page)` em `fixtures/media.ts`, antes do `goto` |
| Stripe (webhook) | `STRIPE_WEBHOOK_SECRET` de teste no servidor; o helper assina como o Stripe (`stripe-signature: t=…,v1=HMAC-SHA256`). O app não confia no corpo do evento: busca no Stripe (o stub) o estado atual da assinatura, então ela precisa estar semeada | `deliverSubscription(request, tipo, stripeSubscription({ id, status, plan, userId }))` em `fixtures/stripe.ts` semeia e entrega; `sendStripeWebhook(request, evento)` só entrega. Mande com o `request` sem sessão: com cookie, o better-auth exige `Origin` |
| Stripe (API) | `STRIPE_API_BASE_URL` aponta o SDK para o stub, que responde em `/v1/*`: cliente criado em `POST /v1/customers` (`cus_e2e_…`) e lido/atualizado em `/v1/customers/<id>` (sempre sem endereço, para o app mandar o do cadastro), preço pela lookup key, sessão de checkout com `url` em `${STUB_URL}/stripe/checkout/<sessão>` e portal em `${STUB_URL}/stripe/portal/<cliente>` (páginas do stub, para o teste esperar o redirect), cupom válido, até `setFounderCoupon(request, estado)` trocar a resposta: `'exhausted'` é o cupom esgotado, `'missing'` o 404 de cupom que não existe na conta — daí a sessão que mandar cupom é recusada, como no Stripe. `GET /v1/subscriptions/<id>` devolve o que foi semeado em `POST ${STUB_URL}/stripe/subscriptions`, e `DELETE /v1/subscriptions/<id>` a encerra (passa a `canceled`; 404 sem semear), que é o que a exclusão da conta chama (WEB-336). Saldo do cliente e prévia da próxima fatura (`expand[]=customer` e `POST /v1/invoices/create_preview`, WEB-350) saem de `seedStripeBalance(request, assinatura, { balance, nextAmountDue })`, em centavos; sem semear, saldo zero, e assinatura que não está no stub responde 404 (o app segue sem o saldo). Cartão salvo: `stripeSubscription({ cardLast4 })` põe a forma de pagamento na assinatura, e o stub só a devolve como objeto com `expand[]=default_payment_method`. | `GET ${STUB_URL}/stripe/calls` lista `{ method, path, query, body }` de cada chamada; o corpo é formulário (`line_items[0][price]`). Filtre por `metadata[userId]` ou pelo cliente do seu usuário |
| Mapa | `VITE_MAP_TILES_URL` aponta para o TileJSON do stub (`/tiles.json`); tiles MVT respondem 204: o mapa monta, marcadores aparecem | — |
| Geolocalização | Concedida e no centro de São Paulo para todo teste (`use.geolocation`) | `test.use({ permissions: [] })` para negar |

Rede externa está bloqueada no Chromium (`--host-resolver-rules`): o que não é
local nem interceptado falha na hora, em vez de ir para a internet.

O SDK do Stripe aceita host, porta e protocolo na criação do cliente
(`packages/auth/src/stripe-client.ts`), e o plugin usa esse mesmo cliente em tudo —
não há desvio de `fetch`. `STRIPE_API_BASE_URL` está na lista de chaves só de E2E
que o `packages/env` recusa em produção.

## Caches de 60s

Decisão: **o servidor de E2E roda sem cache** (`E2E_DISABLE_CACHES=1`). Zera o
TTL de todo `createTtlCache` (`app_config`, busca, catálogo de esportes e
times, geocoding) e desliga o `cookieCache` da sessão do
better-auth. Assim um dado gravado direto no banco — papel, ban, flag, bar
novo — vale na requisição seguinte.

A alternativa, "criar o dado antes do primeiro request que lê", não se sustenta
com workers paralelos batendo no mesmo servidor: a chave do cache de busca é a
consulta, e um teste leria a busca que outro deixou em cache. O custo é o E2E
não exercitar o cache em si — isso fica com os testes unitários
(`ttl-cache.test.ts`, `shared-cache.test.ts`).

`E2E_DISABLE_CACHES`, `E2E_EMAIL_OUTBOX`, `LOCATIONIQ_BASE_URL`,
`STRIPE_API_BASE_URL` e `E2E_DATABASE_URL` são recusadas por `packages/env` quando
`NODE_ENV=production`: o app não sobe.

## Armadilhas

- **`vite dev`, não o build.** O build de produção usa o driver HTTP do Neon e
  falha com `fetch failed` contra Postgres local.
- **Origem.** `BETTER_AUTH_URL`, `CORS_ORIGIN` e `PUBLIC_APP_URL` são
  `http://127.0.0.1:<E2E_PORT>`, e o `baseURL` do Playwright também. Trocar um
  só dá `Invalid origin` no login. `127.0.0.1`, e não `localhost`: no macOS o
  `localhost` do Vite pode abrir só em `::1`.
- **Hidratação.** Clique logo depois de um `goto` cru (fora do `test` da suíte)
  pode cair no HTML antes do React.
- **Devtools.** Em `vite dev` o app mostra os botões do TanStack Router e do
  React Query nos cantos de baixo. Se um clique no mobile cair em cima deles,
  role o alvo para a vista antes.
- **Rate limit.** Já isolado por IP. `clearRateLimits()` existe para um teste
  que esgota o limite de propósito e quer recomeçar.
- **Callback do login.** O destino viaja como `callbackUrl` (só mesma origem,
  via `getCallbackUrl`) pelo guard, login, cadastro, verificação de e-mail
  e os dois onboardings. Depois de um redirect do guard, a
  URL de `/login` tem `?callbackUrl=`: compare com `/\/login\?callbackUrl=/`,
  não com `/\/login$/`.

## Suíte do Worker

A suíte principal roda em `vite dev`, que serve `public/` diferente do Worker:
o Workers assets responde `/offline.html` com 307 para `/offline`, o `vite dev`
com 200. Foi essa diferença que escondeu a WEB-269. O que depende de como o
Worker serve arquivo estático tem suíte própria, contra o bundle real em
workerd:

```bash
cd apps/web && bun run build:cf
cd ../e2e && bunx playwright test -c playwright.worker.config.ts
```

Os specs ficam em `apps/e2e/worker/`. Não usam banco, stub nem `.dev.vars`: só
tocam arquivo estático, que o Workers assets entrega sem chamar o código do
Worker. O servidor (`vite preview --mode cloudflare`, porta `E2E_WORKER_PORT`,
padrão `3203`) é do próprio spec, e não um `webServer`, porque o teste do
service worker precisa derrubá-lo: `setOffline` não vale para o `fetch` de
dentro do service worker. Teste que precisa de banco ou de sessão continua na
suíte principal.

## CI

Job `e2e` em `.github/workflows/ci.yml`, em todo PR, com
serviço Postgres/PostGIS próprio (`ghcr.io/gbrasil720/findsports/ci-postgis`,
publicado por `.github/workflows/publish-ci-postgis.yml` — sem Docker Hub).
Instala só o Chromium. Em falha, publica
`playwright-report` e `test-results` (trace, vídeo e screenshot só dos testes
que falharam) como artifact.

O job `e2e-worker` roda a suíte do Worker, também em todo PR, sem banco.

O job é uma matriz: `desktop` e `mobile` em 4 shards (`--shard=N/4`) e os
projetos `*-serial` num quinto job, depois de `setup`, com `--no-deps`. Os
serial não podem entrar nos shards: como dependem de `desktop`/`mobile`, o
Playwright puxaria a suíte inteira para cada shard. Cada job tem o seu
servidor e o seu Postgres. Num job só, com auth e onboarding, a
suíte já levava 12 min com 2 workers. O artifact de falha sai por parte
(`playwright-report-N`). Se um shard passar de ~10 min, aumente a matriz — e
atualize os checks obrigatórios da branch protection de `master`, que lista
`check`, `unit-test` e cada `e2e (N)` pelo nome: job renomeado ou
removido deixa toda PR
esperando um check que nunca chega.

Spec novo que mexe em `app_config` global continua indo em `*.serial.e2e.ts`;
a matriz pega sozinha.
