# AGENTS.md

Instruções para qualquer agente trabalhando neste repositório — Claude Code, Codex,
Cursor, Gemini CLI, Grok. Este é o arquivo canônico; os demais apenas apontam para cá.

A CLI do Grok lê este arquivo nativamente, e também `CLAUDE.md` por compatibilidade.
Se a sua ferramenta lê outro arquivo de regras (`.cursorrules`, `GEMINI.md`,
`.clinerules`, `.github/copilot-instructions.md`), crie-o apontando para cá em vez de
copiar o conteúdo — duas cópias divergem na primeira edição.

## Commands

```bash
bun install          # install deps
bun run dev          # all apps
bun run dev:web      # web only
bun run dev:mobile   # app nativo (Expo); fica fora do `bun run dev`
bun run build        # full build
bun run check-types  # TypeScript across monorepo
bun run check        # Biome lint + format (auto-fix)
bun run test         # full test suite from repo root (env fake: raiz .env.test via bunfig preload)
bun run test:e2e     # Playwright (apps/e2e): desktop + mobile, banco e portas próprios — docs/e2e.md
```

`bun install` liga o hook `.githooks/pre-push` (`prepare` do package.json): Biome
nos arquivos do branch, tipos dos pacotes afetados e `bun run test`, ~25 s. É o que
os jobs `check` e `unit-test` pegariam; o E2E fica com o CI, que o pula em PR só de
`apps/mobile`, `docs` ou `*.md`. Pular uma vez:
`git push --no-verify`.

```bash
bun run db:generate  # generate migration files
bun run db:migrate   # run migrations (NODE_ENV=development localmente)
bun run db:journal   # relatório do journal; --upto <tag> / --all reconciliam
bun run db:push      # empurra o schema sem gerar migration (ver aviso abaixo)
bun run db:studio    # open Drizzle Studio
```

Turbo filter syntax: `turbo -F <package-name> <task>` — use the `name` field from that package's `package.json`.

Testes de integração (`*.integration.test.ts`) são pulados sem banco descartável. Eles
rodam com `RUN_DISPOSABLE_DB_TESTS=1` e `LOAD_TEST_DATABASE_URL` no container
`findsports_load_test` (`docker compose --profile load-test up -d db-load-test`, porta
5433). O resolver de `packages/db` só aceita essa URL em loopback e com banco
`findsports_load_test` ou `findsports_load_test_<sufixo>`: um banco por worktree deixa
várias rodarem ao mesmo tempo no mesmo container, como no E2E.

```bash
docker exec findsports_load_test createdb -U findsports_load_test findsports_load_test_minha
export LOAD_TEST_DATABASE_URL=postgres://findsports_load_test:findsports_load_test_local@localhost:5433/findsports_load_test_minha
(cd packages/db && NODE_ENV=test bun run db:migrate)
RUN_DISPOSABLE_DB_TESTS=1 bun run test
```

`db:seed:load-test` (carga do k6) continua recusando tudo que não seja o banco sem sufixo.

## Architecture

Turborepo monorepo, `bun` package manager, Biome for lint/format (2 spaces, single quotes).

### Apps
- **`apps/web`** — fullstack app: TanStack Start (SSR) + TanStack Router (file-based) + React 19. Runs on `localhost:3001`.
- **`apps/e2e`** — Playwright E2E suite against `vite dev` and a disposable Postgres. See `docs/e2e.md`.
- **`apps/mobile`** — app nativo: Expo SDK 57 + expo-router + Uniwind (Tailwind v4 no React Native). Ver "App mobile" abaixo.

### Packages
| Package | Import | Purpose |
|---|---|---|
| `packages/api` | `@findsports_oficial/api` | tRPC router + context |
| `packages/auth` | `@findsports_oficial/auth` | better-auth config |
| `packages/db` | `@findsports_oficial/db` | Drizzle ORM + PostgreSQL schema |
| `packages/env` | `@findsports_oficial/env/server` | type-safe server env vars (t3-oss) |
| `packages/ui` | `@findsports_oficial/ui/components/<name>` | shared shadcn/ui primitives |
| `packages/config` | `@findsports_oficial/config` | shared TS/tooling config |

### Data flow

tRPC requests hit `apps/web/src/routes/api/trpc/$.ts` → `fetchRequestHandler` → `packages/api/src/routers/index.ts`. Each request builds context via `createContext` which calls `better-auth` to hydrate a session from the request headers.

Auth requests hit `apps/web/src/routes/api/auth/$.ts` → better-auth handler.

### tRPC procedures

- `publicProcedure` — open
- `protectedProcedure` — throws `UNAUTHORIZED` if `ctx.session` is null; downstream code can assume session is set

Add new routers in `packages/api/src/routers/`, export from `routers/index.ts`.

### Database schema

Schema files live in `packages/db/src/schema/`. Each domain gets its own file; all are re-exported from `schema/index.ts`. `auth.ts` holds the better-auth tables.

IDs use `crypto.randomUUID()` as default.

**Migration é a via oficial em dev e em produção.** `NODE_ENV=development bun run db:migrate`
põe um banco local em dia; `db:generate` cria o arquivo versionado.

**Produção só migra pelo job `deploy` do CI** (`.github/workflows/ci.yml`, WEB-204):
push em `master` → `db:migrate:deploy` no banco de produção → `wrangler deploy` do
Worker `onside-web`. Como a migration sobe antes do
código e o rollback (`bunx wrangler rollback`) não a desfaz, ela tem de ser
compatível com o código anterior (expand → contract). PR publica no Worker
`onside-web-preview`, com o branch `preview` do Neon, depois de migrá-lo.

**Preview** (`https://onside-web-preview.dev-guilhermebrasil.workers.dev`): uma URL só,
o último PR publicado ganha. Banco = branch `preview` do Neon (cópia de produção, com
e-mails de usuários reais) via Hyperdrive `onside-db-preview`; o CI migra pelo segredo
`DATABASE_URL_PREVIEW`. Segredos do Worker: `BETTER_AUTH_SECRET` próprio, chaves do
sandbox do Stripe (`STRIPE_SECRET_KEY` com `sk_test_`, `STRIPE_WEBHOOK_SECRET`),
`LOCATIONIQ_API_KEY`. No Stripe o modo vem da chave, e o env recusa chave viva
(`sk_live_`) fora do domínio `onside.sh`, então o preview não cobra cartão de verdade.
Ele roda com `NODE_ENV=production`, e uma var em `env.preview` desliga o que isso
ligaria: `EMAIL_DELIVERY=console` — **nenhum e-mail sai
do preview**: cadastro, verificação e reset de senha gravam o e-mail, com link e token,
no log do Worker (`bunx wrangler tail onside-web-preview`), que é como se testa.
Aceitável por ser ambiente de teste; o env recusa `EMAIL_DELIVERY=console` com
`PUBLIC_APP_URL` em `onside.sh`, e produção sem `EMAIL_API_KEY` continua falhando alto.
Sem chaves R2: upload de foto desligado. Para atualizar os dados, Neon → branch
`preview` → **Reset from parent** (mesma conexão; Hyperdrive e segredo não mudam).

`db:push` continua existindo para experimentar schema sem gerar arquivo, mas **não use
para pôr um banco em dia**: ele cria os objetos sem escrever em
`drizzle.__drizzle_migrations`, e o `migrate` seguinte tenta aplicar migrations cujos
objetos já existem e estoura no primeiro repetido. Além disso `push` é interativo e trava
sem TTY quando sugere truncar tabela, então não fecha o ciclo para um agente.

Se um banco já estiver nesse estado — journal atrás dos arquivos —, o caminho é
`db:journal`:

```bash
NODE_ENV=development bun run db:journal
# Faltando registrar (26): ... / drizzle-kit migrate aplicaria agora: ...

NODE_ENV=development bun run db:journal -- --upto 0028_event_ends_at_after_starts_at_check
NODE_ENV=development bun run db:migrate
```

`--upto <tag>` registra como aplicadas as migrations que o banco realmente tem, **sem
executar o SQL delas**, e deixa o `migrate` aplicar o resto pelo caminho normal. `--all`
registra o journal inteiro e só vale quando o banco veio de `db:push` do schema atual.
`--dry-run` mostra o plano sem escrever. O script é idempotente e não-interativo.

Não existe modo "descubra sozinho até onde o banco está": marcar como aplicada uma
migration que não está faz o `migrate` pular SQL de verdade, e o erro só aparece depois.
Rode `db:journal` sem argumento para ver o estado antes de escolher o corte.

### Catálogo de times e atletas

A tabela `team` (times, seleções, escuderias e atletas: `kind`) é gravada a partir de
`packages/db/src/catalog/data/<esporte>.json`, um item por linha (WEB-381). Fontes:
Wikidata (CC0) para futebol, NBA, NFL, UFC e tênis (código da ATP ou da WTA),
Jolpica-F1 para a grade da F1, e à mão (`manual:`) para vôlei e NBB. A Wikidata
guarda o nome de muita gente só na língua `mul`, que o `propose` usa quando falta o inglês. O ciclo:

```bash
bun run catalog:propose [esporte]   # consulta as fontes e acrescenta o que é novo ao JSON
NODE_ENV=development bun run db:catalog:sync   # grava no banco local (o deploy roda o mesmo)
```

O JSON é a versão revisada: o `propose` não muda nome, tipo nem destaque do que já
está lá, então o nome curto ("Corinthians", não "Sport Club Corinthians Paulista") se
corrige à mão no PR. Item que não deve aparecer leva `"hidden": true`, não é apagado:
o `propose` o traria de volta, e o `sync` nunca apaga linha (favoritos e jogos saem em
cascata). `featured` é a lista curta que a tela mostra sem busca; o resto aparece por
`pubs.searchTeams`. Escudo e foto não entram (marca do clube, licença das imagens).

### Environment variables

Split by runtime boundary:
- `packages/env/src/server.ts` — `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `LOCATIONIQ_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NODE_ENV`
- `apps/web/src/lib/env.ts` — client-safe `VITE_*` vars only

**E-mail (WEB-476):** todo envio passa por `sendEmail`
(`packages/auth/src/verification-email.ts`), um `POST <EMAIL_API_URL>/emails` no
da MillionSend (plano Free da nuvem, 100 por dia). O provedor é `EMAIL_API_URL` (var do
`wrangler.jsonc`, padrão `https://api.millionsend.com`) com o segredo `EMAIL_API_KEY` e o
remetente `EMAIL_FROM`. A Resend saiu em 29/10/2026 (WEB-482). DNS de envio:
`docs/email-dns.md`.

Client env lives in the app, not in `packages/env`: `import.meta.env` is only
typed where Vite's types are, and the shared package needed an `any` cast to
compile — which erased the boundary it existed to provide.

Import from the correct boundary or you'll expose server secrets to the browser.

Onde os valores de produção moram (Worker `onside-web`): o que não é segredo em
`vars` no `apps/web/wrangler.jsonc`; segredos por `wrangler secret put` (lista em
`apps/web/.dev.vars.example`); `VITE_*` são de build e vêm das `vars` do GitHub
Actions no job `deploy`. O Worker não lê `DATABASE_URL` — o banco vem do binding
`HYPERDRIVE`; ela só existe para migration e scripts.

### Cobrança (Stripe)

Cartão pelo Stripe, via plugin `@better-auth/stripe` (WEB-31). Checkout
(`/api/auth/subscription/upgrade`), portal (`/api/auth/subscription/billing-portal`)
e webhook (`/api/auth/stripe/webhook`, com assinatura conferida) são rotas do plugin.

- **Fonte do app é a tabela `subscription`** (`packages/db/src/schema/platform.ts`):
  plano, situação, fim do período. Quem a mantém é o `onEvent` do plugin, em
  `packages/auth/src/stripe-sync.ts`, que busca no Stripe o estado atual da
  assinatura a cada evento — por isso evento repetido ou fora de ordem não estraga
  nada. A tabela de tradução Stripe → `subscription_status` está no topo desse arquivo.
- `stripe_subscription` é do plugin (é como ele evita segunda assinatura para o mesmo
  dono). O app não lê plano dali.
- Planos são achados por **lookup key** (`starter_monthly`, `pro_monthly`,
  `elite_monthly`), iguais no sandbox e em produção: `packages/auth/src/stripe-plan.ts`.
- **Teste grátis nasce no cadastro, sem cartão**: 90 dias para todo bar novo,
  contados de quando ele vai ao ar no `completePub` (`ONBOARDING_TRIAL`, em
  `packages/api/src/lib/plan-limits.ts`), no plano que a rotina do cadastro recomenda
  (`recommendPlan`, `packages/api/src/lib/pub-routine.ts`; ver "Cadastro do bar e
  primeiro valor"). Cliente anterior, sem rotina, nasce no Elite. Quem contrata antes
  do fim herda a data: o checkout manda `trial_end` e o Stripe só cobra quando o teste
  acabaria (`packages/auth/src/stripe-checkout.ts`).
- **O teste do cadastro vale para qualquer plano** (WEB-358): o dono escolhe o do teste
  depois do primeiro jogo e troca em `/plan` ("Testar o X grátis"), sem cartão e
  quantas vezes quiser, por `pub.changeTrialPlan`. Só `subscription.plan` muda (e
  `bar.trial_plan_chosen_at`, a primeira vez); o fim do teste é o mesmo. Com
  assinatura no Stripe ou teste vencido a troca é recusada: o caminho é contratar.
  No Starter o limite de jogos conta por mês, de trás para frente a partir do fim do
  teste (`getEventCreationPeriod`), e **o primeiro jogo que o bar publicou na vida não
  conta** ("por conta da Onside", `countedTowardsLimit` em
  `lib/event-creation-policy.ts`).
- **Teste do cadastro vencido tira o bar do ar** (WEB-357): sem assinatura no Stripe e
  com o período encerrado, a reconciliação diária (`reconcileBarPlans`, em
  `packages/api/src/lib/bar-plan-sync.ts`) desliga `bar.is_active` junto com o
  rebaixamento de plano — então há até um dia entre o vencimento e a saída do ar.
  Contratar um plano religa o bar pelo `applyStripeSubscription`. `past_due` não entra
  nessa regra: continua no ar com os recursos do Starter.
- **Excluir a conta encerra a assinatura no Stripe** (WEB-336): assinatura viva não
  bloqueia mais a exclusão; o servidor cancela no Stripe e só então apaga a conta, e se
  o Stripe falhar nada é excluído (`packages/auth/src/account-deletion.ts`).
- **Nome e empresa da assinatura vêm do cadastro, não do checkout** (WEB-328): o
  checkout não pede nenhum dos dois. Antes de a sessão abrir, o cliente do Stripe
  recebe `user.name`, `bar.name` e, se ainda não tiver endereço, o do bar
  (`stripe-checkout.ts`); no `checkout.session.completed` os nomes são regravados
  (`stripe-sync.ts`). O checkout hospedado não mostra esses dados preenchidos: o
  endereço de cobrança é digitado na primeira compra. `/plan` avisa em nome de quem
  a assinatura sai. Cobrança sempre em BRL (Adaptive Pricing desligado na sessão).
- **Cobrança não tem chave em `app_config`** (WEB-233): a contratação está sempre
  aberta, o teste do cadastro é a constante acima e o cupom de fundador é
  `FOUNDER_COUPON_ID` (`stripe-checkout.ts`), o mesmo id no sandbox e em produção.
  Todo checkout novo sai com ele enquanto o Stripe o der como válido; esgotado,
  expirado ou inexistente na conta, o checkout segue a preço de tabela
  (`usableFounderCoupon`). A oferta acaba no painel do Stripe, não no app.
- **Dados da nota** (WEB-444): razão social, CNPJ e e-mail para notas em
  `/admin/billing` (`components/painel/dados-da-nota.tsx`), nas colunas
  `bar.legal_name`, `cnpj` e `invoice_email`, por `pub.updateInvoiceDetails`. Com
  cliente no Stripe, ele recebe os três antes do banco (recusa ou Stripe fora do ar
  não grava nada): a razão social vira a empresa, o CNPJ o único `br_cnpj` e o
  e-mail o do cliente (vazio volta ao de acesso). CNPJ conferido pelo dígito, com
  letras ou só números (`@findsports_oficial/db/cnpj`).
- **Motivo do cancelamento** (WEB-445): "Por que está cancelando?"
  (`components/painel/cancelar-plano.tsx`) grava em `subscription_cancel_reason` ao
  abrir o portal (intenção). Só quando o webhook vê a assinatura agendada para acabar
  ou encerrada o último motivo do dia antes do pedido vai a `cancellation_details` no
  Stripe (`stripe-sync.ts`), sem sobrescrever o que o portal trouxe. Lista em
  `packages/db/src/cancel-reasons.ts`.

### Avisos por e-mail do bar (WEB-441)

Em `/admin/configuracoes` → Avisos por e-mail o dono liga e desliga três e-mails
(`bar.notice_*`, `pub.updateNotices`, interruptores que gravam na hora; padrões do
design 2b: resumo e jogo lotando ligados, grade vazia desligada). Regras, textos e envio
em `packages/api/src/lib/bar-notices.ts`, pelo `sendEmail` de sempre:
- **Resumo da semana** e **grade vazia** saem às segundas pelo cron diário (rotina
  `bar_notices` em `lib/jobs.ts`, a última do `runScheduledJobs`, 01:00 de Brasília;
  nos outros dias ela não faz nada). Só bar no ar. Presenças e códigos só no resumo do
  Elite (`bar.plan`). Com os dois ligados e a semana vazia vai só o resumo.
- **Jogo lotando** sai na marcação (`setAttendance`) que passa de 20, uma vez por jogo,
  depois da resposta (`runInBackground`). O e-mail não diz o número exato.
- `bar_notice` (bar, tipo, semana ou jogo) garante uma vez só; envio recusado apaga a
  linha e a falha sobe para o `job_run` (Bastidores do Houdini, que roda a rotina na
  hora e só manda o que faltou).
- "Notificações no celular" segue "em breve".

### Números do painel para todos os planos (WEB-449)

A série diária do Desempenho e do "Seu bar nos últimos 30 dias" de Hoje é de todos os
planos: `dailyProfileViews` e `dailyHighIntentActions` (WhatsApp, rota e telefone já
somados por dia, então o plano sem os canais não vê a divisão). O card "Interesse de
hoje" de Hoje é `commercialAnalytics.getMyWeekdayInterest`
(`lib/commercial-analytics/weekday-interest.ts`): pessoas interessadas no dia da casa,
da meia-noite até agora, contra a média da mesma janela nas quatro semanas antes (cabem
nos 30 dias do Starter; semana de antes de o bar existir não entra; com menos de duas,
"—").

### Baixar meus dados (WEB-418)

`account.requestExport` monta o JSON no servidor e o manda de anexo para o e-mail da
sessão: para o bar, conta, bar (com os dados da nota), plano e jogos, nada de torcedor;
para quem não é bar, perfil, preferências, bares salvos, jogos e avaliações (o web não
tem amigos nem conquistas, e o arquivo não inventa essas seções). Um pedido a cada 24 h
por conta (`rate_limit`, chave `data-export:user:<id>`): o segundo volta
`TOO_MANY_REQUESTS` com a frase para a tela, e envio que falha devolve o pedido. No
painel, Configurações → Privacidade → "Pedir arquivo". Testes de integração e E2E não
mandam e-mail: dublê da API (`fakeEmailApi`) e outbox do E2E.

### Avaliação do bar (WEB-398, WEB-408, WEB-451)

"Voltaria para ver jogo aqui?", presa a um jogo (`bar_rating`, uma por bar, torcedor e
jogo). Junto vão "O que pesou?" (seis etiquetas de `RATING_REASONS`,
`packages/api/src/lib/rating-reasons.ts`, id nunca reusado), estrelas de 1 a 5,
comentário de até 280 e "Mostrar meu nome" (`identified`; limites em
`@findsports_oficial/db/rating-limits`). Quem pode responder: quem mostrou intenção de ir
àquele jogo (rota, WhatsApp ou telefone, "Vou assistir aqui" ou check-in), depois do fim
e por 14 dias. As regras moram em `packages/api/src/lib/post-game.ts` (`postGame.pending`,
`answer`, `undo`: "Você foi?" e "Voltaria?" numa fila só, a resposta numa transação). No
web, os cards antigos do `/dashboard` seguem em `ratings.submit` e `attendance.report`,
que agora são adaptadores dela; o servidor aceita a avaliação sem estrelas (o app novo as
exige na tela), e o card do web não as pergunta.

- **Só a verificada entra na nota** (WEB-408): código validado no balcão (e não desfeito)
  ou check-in "Estou aqui" (`attendance.checkIn`, `lib/check-in.ts`: até 150 m do bar, na
  janela do código, um por jogo; o web não tem tela, quem chama é o app).
  `bar_rating.verified` é do banco (triggers da migration 0083, a mesma regra de
  `lib/visits.ts`); `rating_count`, `rating_positive` e `rating_stars_*` do bar contam só
  as verificadas. A 0083 recontou os bares: quem só tinha avaliação sem código validado
  ficou sem nota pública.
- **Piso público: 5 avaliações verificadas** (`RATING_PUBLIC_FLOOR`, `lib/rating.ts`,
  decisão do dono para não expor o bar com uma única negativa). Abaixo dele nada da nota
  sai na leitura pública: nem %, nem estrelas, nem "O que pesou?", nem comentários. Vale
  para `pubs.getById` (`rating`, `ratingReasons`, `reviews`), a busca e a ordenação por
  nota, e o `app_config` `rating.public_display` continua por cima.
- **Comentário passa pela revisão da Onside** (`/houdini/revisao`,
  `adminReview.decideComment`, decisão no Grimório como `bar.rating_comment_*`). Recusado
  não aparece em lugar nenhum e o torcedor não é avisado; o resto da avaliação vale.
  Comentário trocado volta à revisão; o mesmo texto reenviado guarda a decisão.
- **Leitura**: `readRatingList` (`lib/rating-list.ts`). A pública ("O que dizem",
  `pubs.getById().reviews`) traz os 3 mais recentes verificados e aprovados, com nome só
  de quem quis. O dono (`pub.getMyRatings`) vê todas desde a primeira, com a nota das
  verificadas, a média das estrelas, quantas não verificadas ficam fora (`unverified`),
  o comentário aprovado e `commentPending` (há comentário esperando, sem o texto). No
  painel são "Avaliações recentes" (Hoje) e "Voltariam pra ver jogo aqui?" (Meu espaço),
  a mesma linha `ListaDeAvaliacoes` (`components/painel/avaliacao.tsx`), com o selo
  "Não verificada".

### Código do balcão pela comanda (WEB-412)

Opção do bar Elite, **desligada por padrão** (`bar.confirms_codes_later`), escolhida
no card "Oferta da casa" do `/admin` (Na hora / Depois do jogo, pela comanda), por
`pub.updateCodeConfirmation`. Ligada, a tela do código do torcedor fala com o garçom
("anote na comanda"), o card traz o recado pronto para a equipe, e o dono lança os
códigos anotados em `/admin/validate` por `reservationValidation.logLate`, até 48 h
depois do fim do jogo (`getLateEntryWindow`). Acima da caixa, "Faltou lançar?"
(`reservationValidation.notLogged`) lista pelo nome quem marcou e não foi lançado, sem
ler `attendance_report`. O uso fica com `late = true` e `used_at` na
hora do lançamento: quem conta visita usa a data do jogo (`event.starts_at`). A Onside não confere se o cliente estava no bar: fraude é risco do bar,
decisão do dono. Bar "na hora" não lança depois. O alfabeto do código não tem O, 0,
I, 1 nem L (`CODE_ALPHABET`), para não confundir anotado à mão.

### UI / Styling

Global styles and design tokens: `packages/ui/src/styles/globals.css`. Tailwind v4.

Add shared primitives (used across multiple apps):
```bash
npx shadcn@latest add <component> -c packages/ui
```

Add app-specific blocks: run shadcn CLI from `apps/web`.

Import shared components: `import { Button } from "@findsports_oficial/ui/components/button"`

### Mapa

MapLibre GL JS com basemap Protomaps: archive `.pmtiles` no R2, tiles ZXY via
Worker `apps/tiles` em `tiles.onside.sh` (WEB-218). Componente em
`apps/web/src/components/app/onside-map.tsx`, estilo em
`apps/web/src/lib/map-style.ts`, glyphs e sprite em `apps/web/public/map/`.
**Antes de mexer em tiles, estilo ou rebuild, leia `docs/map-tiles.md`** —
runbook, deploy do Worker e armadilhas (URL absoluta para sprite/glyphs,
`maplibre-gl` fora do `optimizeDeps` do Vite).

### SEO

Nome do site no Google (JSON-LD `WebSite`/`Organization` da home), o que é
indexável, `robots.txt` e favicons: **leia `docs/seo.md` antes de mexer em
`<title>`, `head`, sitemap ou ícones.**

### Página pública do bar (`/bar/$slug`)

Aberta sem login (decisão do dono, 05/11/2026, que revoga "web só para bares" nesta
página) e indexável com o bar no ar. Endereço `/bar/<nome-e-bairro>-<8 hex do id>`
(`packages/db/src/bar-slug.ts`): quem resolve é o prefixo; nome diferente redireciona
301 para o atual, prefixo que bate em mais de um bar é 404 (teto anotado lá; o caminho
é uma coluna `slug`). `/pub/<id>` antigo (QR, WhatsApp, app, painel, Houdini) responde
301 para o canônico. O HTML do servidor sai de `readPublicBarPage`
(`packages/api/src/lib/public-bar-page.ts`, pela server function `functions/public-bar.ts`),
sem nada da sessão; presença, código do balcão, salvo e amigos que vão (só amigo aceito
que deixa ver, `readFriendsGoing`) vêm depois, no cliente, por `pubs.pageViewer`. O que
grava pede login pela folha da própria página, que leva a ação em `?acao=vou|salvar`
(com `?jogo=`) e a conclui na volta, inclusive do cadastro, da confirmação de e-mail e
do 2FA. Nota, "% voltariam" e "O que pesou?" (etiquetas sem número) só acima do piso
público (`rating`, decidido no servidor); abaixo, a seção diz que as primeiras
avaliações estão chegando. Bar fora do ar: 200 com `noindex` (o dono vê a prévia).
Telas e contas em `apps/web/src/components/bar-page/`; título, descrição, cartão do
WhatsApp e JSON-LD (`BarOrPub` + um `Event` por jogo) em `bar-page-model.ts`. Ver
`docs/seo.md`.

Performance da home no celular (pôster com `srcset`, prioridade das fontes,
o que não pode entrar no JavaScript de entrada) e como medir com Lighthouse:
`docs/perf-home.md`.

### E2E

Playwright em `apps/e2e`, job `e2e` no CI. **Antes de escrever ou rodar teste de
navegador, leia `docs/e2e.md`** — fixtures, dublês (outbox de e-mail, stub da
LocationIQ, R2, API e webhook do Stripe), por que o servidor roda sem cache e as
variáveis `E2E_PORT`/`E2E_DATABASE_URL` para rodar em paralelo entre worktrees.

### Houdini (painel interno)

O painel interno é o Houdini (projeto Houdini no Linear, WEB-383 em diante), em
`houdini.onside.sh`, servido pelo mesmo Worker; o antigo `/internal` saiu (WEB-393). As rotas são `/houdini/*`; no host
próprio o `rewrite` do router tira o prefixo (`apps/web/src/lib/houdini-host.ts`). No
`www` o caminho `/houdini` dá 404 (admin é mandado para o host); no preview e no
`vite dev` o Houdini responde em `/houdini`. Quem entra é decidido no servidor por
`lib/houdini-gate.ts`: só admin com 2FA ligado; o resto recebe o 404 de verdade (a
"Cortina"). Telas novas entram em `routes/houdini/_app/` e no grupo delas em
`HOUDINI_NAV_GROUPS` (`components/houdini/shell.tsx`). O visual é o redesign na
linguagem da Onside (WEB-480, canvas https://claude.ai/artifact/DmzHetdEyDNRP3eWaXqzHz),
todo em `components/houdini/houdini.css`, preso a `.houdini`: Anton, Archivo e Geist
Mono, acid e sombra dura. O tema segue o do sistema (escuro por padrão), e toda
diferença entre claro e escuro é token `--hd-*`.

Revisão (`/houdini/revisao`, `adminReview`, WEB-462, WEB-478 e WEB-451): fotos e
descrições dos bares e comentários das avaliações (ver "Avaliação do bar"), aprovar ou
recusar com motivo, cada decisão no Grimório (`bar.photo_*`, `bar.description_*`,
`bar.rating_comment_*`). **Toda foto do bar (`bar_photo`, até 12 em todo plano; recusada
não conta) e toda descrição passam por ela antes de o torcedor ver**: `pubs.getById`
só devolve fotos `approved`, e `bar.description` é a última aprovada (o dono escreve
em `description_pending`; apagar tira do ar na hora). A capa é uma foto da galeria, de
todo plano: "Usar como capa" numa aprovada grava `bar.photo_url` na hora; numa em
revisão (`cover_requested`), quando for aprovada. As outras fotos são do Pro e do
Elite (`lib/bar-gallery.ts`). Upload por `/api/bar/photo?galeria` (`&capa` deixa o
Starter mandar a capa) e `pub.addPhoto`; `bar.gallery_photos` é a coluna antiga, sem
leitura. Painel: `components/painel/espaco-fotos.tsx`.

### Cadastro do bar e primeiro valor (WEB-501)

Protótipo `docs/design/redesign-2026-11/painel/index.src.html` (branch do guia
navegável). Duas partes:

- **Cadastro** (`routes/(onboarding)/onboarding.pub.tsx`): Boas-vindas,
  Estabelecimento, Características, Sua rotina e Revisão, sem passo de plano. A rotina
  (jogos por mês, gasto por cliente, o que o dono espera; `routineSchema`) vai no
  rascunho e no `completePub`, que a grava em `bar.routine` e começa o teste no plano
  que ela recomenda, com `bar.trial_plan_chosen_at` nulo. O comprovante não tem plano
  ("você escolhe já já") e traz "Primeiro jogo por conta da Onside".
- **Depois do "no ar"** (`/onboarding/pub/no-ar`, `PUB_LIVE_PATH`, `?passo=`):
  "Seu primeiro jogo" (sugestões abaixo e o "Novo jogo" do painel), "Assim o torcedor
  vê" (o `CartaoBar` de verdade do Explorar, a página `/bar/<slug>` num iframe, e
  WhatsApp, copiar link e QR para imprimir) e "Plano do teste" (`PubPlanStep`, o
  recomendado marcado; escolher é o `pub.changeTrialPlan`). Os dois primeiros dá para
  pular ("Ir para o painel", "Fazer depois"); o passo pulado não ganha o visto no topo
  (`PubObShell` com `done`). O plano não: enquanto `precisaEscolherPlano`
  (`lib/trial-plan-choice.ts`: data nula, teste do cadastro em vigor e sem Stripe), o
  layout de `/admin` leva à escolha. A rotina fica no bar, então a escolha abre igual
  em outro aparelho; "Mudar minhas respostas" ali só muda a recomendação da tela.
  Bar de antes da coluna e o criado pelo código anterior contam como escolhidos (o
  padrão da coluna é `now()`).
- **Sugestões de jogo** (`packages/api/src/lib/game-suggestions/`): a tela só conhece
  `pub.gameSuggestions` e `GameSuggestion`; a fonte é trocável (`GameSuggestionSource`
  em `index.ts`). Hoje há uma, `nearby-bars.ts`: jogos publicados (sem rascunho) por
  outros bares no ar da mesma cidade (`search_normalize`) nos próximos 7 dias, um por
  jogo (início + título), até 6, os mais marcados primeiro, sem os que o bar já tem. O
  catálogo semanal do WEB-433 entra como outra fonte ali. Um toque é um `createEvent`
  com campeonato, times, texto livre e horário; telão e som herdam das
  características. Mesma peça em "Seu primeiro jogo" e em Jogos (`SugestoesDeJogo`).
- **Passeio e Primeiros passos** (`components/painel/passeio.tsx`): só para o bar do
  cadastro novo (`bar.routine`); o de antes não vê nada sozinho. A volta do plano do
  teste abre `/admin?passeio=1`, que começa o passeio: troca de rota de verdade (Hoje,
  Jogos, Meu espaço, Quem vai só no Elite, Desempenho, fim em Hoje), destaque com furo
  no elemento (`data-passeio="…"` nas telas), "N de M", Voltar/Próximo e "Pular o
  passeio". Starter e Pro têm 5 telas, Elite 6, sem as do que já está feito. **Nenhum
  passo anda sozinho**: a ação do passo (publicar a sugestão, validar o código de
  exemplo) só troca o texto e o botão; Esc e "Pular" pausam, e "Continuar o passeio"
  no card segue das telas não vistas. O card "Primeiros passos" em Hoje marca pelo dado
  real (jogos publicados, capa ou capa pedida e horário, plano escolhido) e, o que não
  tem dado (passeio, link mandado, código de exemplo, card escondido), por conta no
  `localStorage` (`primeiros-passos-local.ts`, leitura e escrita em `try`). Some ao
  completar ou com "Esconder". O código de exemplo ("Treine o balcão", em Quem vai) é
  só na tela: não grava código nem visita.

### Web do torcedor (WEB-501)

**Ver sem login, agir com login (dono, 05/11/2026; revoga o "web só para bares" de
24/10/2026).** O torcedor volta ao web no desenho "O Telão do Bar" (protótipo
`docs/design/redesign-2026-11/torcedor/index.html`). O Explorar (`/dashboard`) abre
para visitante; as telas de baixo dele (`/dashboard/*`: Meus jogos, código, Seus bares,
perfil, Bares pra você, preferências) pedem conta (`applyAuthGuards`). Bar continua
mandado ao `/admin`.

- **Casca:** `TorcedorShell` (`components/torcedor/shell.tsx`), com o cabeçalho, as
  abas de baixo no celular, o aviso e a folha de entrar. CSS do protótipo em
  `components/torcedor/torcedor.css`, preso a `.tc`; ícones em `icones.tsx` (o `IC`
  do protótipo). O escuro é o `data-theme` do `<html>`, como no painel.
- **O que grava pede login e volta concluído:** favoritar, "Vou assistir aqui" e o
  resto passam por `useTorcedor().agir`. Sem sessão abre a folha de entrar com o
  contexto (o bar, o jogo); entrando por ela a ação sai na hora. Cadastro, e-mail
  e 2FA levam a ação na URL, `?acao=<tipo>.<id>` (`vou.<jogo>`, `fav.<bar>`,
  `lembrar.<jogo>`, `app`; `components/torcedor/acao.ts`, dentro do `callbackUrl`), e quem a
  recebe com sessão a conclui uma vez: a casca do torcedor e a página do bar
  (`/bar/$slug`; `/pub/<id>` repassa a `acao`), pelo mesmo módulo. O formato antigo da
  página do bar (`?acao=vou` com `?jogo=`, `?acao=salvar`) continua aceito na leitura
  (`lerAcao` com o bar e o jogo da página).
- **Conta nova por uma ação: a ação primeiro, as preferências depois** (protótipo
  `bem-vindo-curto`). Torcedor sem onboarding com `?acao=` no destino não vai ao
  onboarding (`applyAuthGuards`, `acaoPulaOnboarding`; a confirmação do e-mail e a
  folha de entrar fazem o mesmo): a ação é concluída e ele cai na tela dela com o card
  escuro "Conta criada e presença marcada / bar salvo / lembrete marcado", pela URL
  `?novo=vou|vouc|fav` (`destinoContaNova`): o código (Elite) ou Meus jogos, e Seus
  bares › Favoritos; o lembrete vai direto à tela curta. "Escolher agora" abre
  `/dashboard/bem-vindo` (esportes, times e raio numa página, tudo opcional, com a
  tag do que já foi feito; `components/torcedor/conta-nova.tsx`). "Depois" (no card ou
  na tela) e "Salvar" chamam `onboarding.completeFan`, que aceita vir vazio: o
  "Depois" grava só `onboardingCompleted` (raio padrão da coluna, 3 km, nenhum
  esporte), e o app, que lê o mesmo `onboardingCompleted`, não pede o onboarding
  dele. Sem onboarding, a guarda só deixa a tela da ação, a do card (`?novo=`) e a
  curta (`contaNovaPodeVer`); fora delas, o onboarding de 5 passos. A ação `app` ("Me
  avise") e o cadastro sem ação seguem pelo onboarding de 5 passos, com a ação no
  `callbackUrl`. O aviso (`.toast`) que precisa sobreviver à troca de rota usa
  `avisarNaProxima` (cada rota monta a sua casca).
- **Aviso de cookies:** um só em todo o site, o "Placar" (`consent/cookie-consent.css`):
  cartão no canto no desktop, folha no pé no celular. O que é preso ao pé da janela sobe
  por `--onside-consent-space`; no Explorar, as abas, o aviso da casca e o mapa do
  celular (com a folha de bares) acabam onde ele começa (`torcedor.css`).

- **Telas:** Explorar (`/dashboard`, régua do dia por `pubs.gameBoard`, aberta, em
  `lib/game-board.ts`; mapa `OnsideMap` com a gota, só por `import()`; na ordem
  padrão o Elite do clássico vai na frente e a tela grava `classic_exposure` e
  `classic_click`, com as regras da busca antiga; abaixo dos bares do jogo vem
  sempre "Sem jogo marcado", os bares do raio sem jogo publicado no dia, por
  `pubs.barsWithoutGame` (aberta, `lib/bars-without-game.ts`), que somem com a
  "Oferta da casa" e no mapa são o ponto oco `quiet`), Meus jogos
  (`/dashboard/games`, ingressos), "Como foi?" (`/dashboard/avaliar/$eventId`, a fila
  `postGame.pending` numa tela: estrelas obrigatórias, comentário em revisão, nome e a
  faixa de visita verificada só com código validado ou check-in), o código (`/dashboard/codigo/$eventId`), Seus bares (`/dashboard/seus-bares`,
  `attendance.visits`), perfil (`/dashboard/profile`, `achievements.mine`), Bares pra
  você (`/dashboard/pra-voce`, `recommendations.today`, frases de `domain/pra-voce.ts`,
  as mesmas do app) e Preferências (`/dashboard/preferencias`; conta e privacidade com as
  peças das Configurações do painel). Link para bar é `/pub/<id>`.
- **Landing:** sem sessão, a chamada do torcedor ("Ver jogos de hoje") leva ao
  Explorar; a do bar segue no cadastro.
- **"Me avise quando o app chegar"** (`AppChegando`, em Meus jogos e no perfil): tabela
  `app_waitlist`, um e-mail único em minúsculas por linha, com `user_id` opcional (cascade
  na exclusão), `source` (`landing` ou `web`), `notified_at` e `unsubscribed_at`; o web
  grava o e-mail da sessão por `appWaitlist.join` (visitante passa pela folha de entrar) e
  "Não quero mais" (`leave`) marca `unsubscribed_at` em vez de apagar, o registro da
  recusa para o envio do lançamento. Nenhum e-mail sai ainda; a linha entra em "Baixar
  meus dados".
- **Em breve no web:** escolher avisos, quem vê onde você foi e ranking (ficam no app),
  nomes de amigos em "quem vai".

### App mobile

`apps/mobile` (pacote `mobile`), montado como o Better-T-Stack monta `native-uniwind`, sem a
HeroUI Native. Esquema `onside://`, identificador `sh.onside.app` (iOS e Android).

**Design do app:** projeto no Claude Design,
<https://claude.ai/design/p/5185ab40-42b3-4469-a0a7-9e96448d9e24> (a tela de entrada é o
arquivo `Onside Selecao 1 Entrada.dc.html`). É a referência de desenho e de texto das telas:
leia o arquivo da tela antes de implementá-la (`DesignSync`, depois de `/design-login`) e não
invente layout que o projeto não tem.

- **Não tem backend próprio.** Fala com a API do web: `EXPO_PUBLIC_SERVER_URL` + `/api/trpc` e
  `/api/auth` (`apps/mobile/.env`, modelo em `.env.example`). Só o **tipo** do router cruza a
  fronteira (`import type { AppRouter }` em `lib/trpc.ts`); código de servidor nunca entra no
  bundle do app.
- **Sessão:** `@better-auth/expo` guarda a sessão no SecureStore e a manda como cabeçalho
  `Cookie`. No servidor, o plugin `expo()` e o esquema `onside://` em
  `packages/auth/src/trusted-origins.ts` (`APP_SCHEME`, igual ao `scheme` do `app.json`).
  `exp://` e `localhost:8081` só valem em `development`.
- **Turnstile no app:** o servidor exige o desafio em `sign-in`, `sign-up` e nos envios de
  e-mail sempre que tem `TURNSTILE_SECRET_KEY` (o `.env` local tem). O app resolve numa WebView
  (`apps/mobile/components/turnstile.tsx`, mesmo contrato do `useTurnstile` do web) com a
  chave pública em `EXPO_PUBLIC_TURNSTILE_SITE_KEY`. A WebView se apresenta com o host de
  `EXPO_PUBLIC_SERVER_URL`, que precisa estar liberado na chave. **A chave de verdade recusa
  `localhost` e IP de rede local** (Turnstile `110200`, e o servidor responde
  `MISSING_RESPONSE`): em desenvolvimento, suba o web com o par de teste da Cloudflare, que
  passa sempre (`TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` e
  `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` antes de `vite dev`), e o Metro com
  `EXPO_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`. Variável de ambiente ganha do
  `.env`, então nenhum arquivo muda.
- **Login por e-mail sem `callbackURL`:** com ele o servidor responde `redirect: true` e o
  plugin do Expo abre a janela de login social do iOS ("deseja usar … para iniciar sessão").
- **React próprio:** o app usa o React que o Expo exige (19.2.3), separado do web. Não suba a
  versão à mão: `bunx expo install --check` diz o que o SDK aceita.
- `EXPO_PUBLIC_*` vai embutida no bundle: nunca é lugar de segredo.
- Tokens da Onside em `apps/mobile/global.css` (`bg-ink`, `text-paper`, `bg-acid`...).
- **Splash:** `apps/mobile/components/splash.tsx`, a tela "02 Splash" do design (agenda do dia
  em faixas atrás do "ON / SIDE"), clara ou escura pelo tema do sistema. A splash nativa
  (`app.json`) é só a cor de fundo e fica até as fontes carregarem (`app/_layout.tsx`). As
  letras grandes são vetor (`splash-letters.ts`), não texto.
- **Agenda da splash:** os jogos de hoje vêm de `pubs.todayGames` (pública: bares no ar, dia de
  Brasília, o mesmo jogo em vários bares conta uma vez). A abertura espera a resposta por até
  600 ms; sem jogo hoje, ou sem resposta, usa a agenda de exemplo do design e **esconde a
  contagem** "N jogos hoje".
- **Apresentação:** `app/intro.tsx` (+ `components/intro-art.tsx`), a seção "03 Apresentação"
  do design. Quem abre sem sessão cai nela (`app/index.tsx`). O mapa da primeira tela é
  imagem (`assets/images/intro/map.jpg`) tirada do nosso estilo (`map-style.ts`) com os tiles
  da Onside, não do ArcGIS do design; por ser OpenStreetMap leva o "© OpenStreetMap".
  O design só desenha o claro; a apresentação segue o tema do sistema com tinta e papel
  trocados e o acid no lugar do vermelho (a regra da tab bar do design), e o mapa tem
  versão escura (`map-dark.jpg`, mesma vista com a paleta escurecida).
- **Conta ("04 Conta"):** `profile` (torcedor ou bar, vira `role` no cadastro), `sign-up`,
  `verify-email`, `sign-in`, `forgot-password`, `reset-sent`, `reset-password`, `two-factor`;
  peças em `components/ui.tsx`. O link de confirmação abre no navegador; o servidor entra e
  redireciona para o app (`callbackURL: '/verified'`, que o cliente vira `onside://` ou
  `exp://`) com a sessão em `?cookie=`, e `app/verified.tsx` a guarda (`adoptSessionCookie`):
  o cliente do Expo só faz isso sozinho no login social. O reset usa `redirectTo` com
  `Linking.createURL`, porque o cliente não converte esse campo. Em dev o link do e-mail sai
  com `PUBLIC_APP_URL` (senão `BETTER_AUTH_URL`, `localhost`), que não abre no celular: para
  testar no aparelho, suba o web com `PUBLIC_APP_URL=http://<ip-do-mac>:3001`.
- **Onboarding do torcedor ("05", 4i–4n):** `app/onboarding/*`, escolhas num contexto
  (`components/onboarding.tsx`) e um envio só no fim (`onboarding.completeFan`), como no web.
  A tela inicial manda para lá o torcedor com `onboardingCompleted` falso. Cidade por
  `pubs.searchCities` e a contagem "N bares com jogo hoje" por `pubs.countTodayNear`.
  Depois de salvar, `refreshSession` (`lib/auth-client.ts`) expira o cache da sessão (com
  corpo `{}`, senão 415) e relê com `disableCookieCache`. O banco local nasce sem times:
  `NODE_ENV=development bun run db:catalog:sync` (o resolver fixa o Postgres local).
- **Avulsas ("06"):** `app/+not-found.tsx` (404) e `app/legal.tsx` (Termos e Privacidade).
  O texto legal vem de `packages/legal`, o mesmo do site.
- **Explorar ("07"):** `app/explore.tsx`, onde o torcedor com onboarding feito começa, e
  `app/bar/[id].tsx` (página do bar); peças em `components/explore.tsx`, contas puras em
  `lib/explore.ts`. O mapa é o nativo, pelo `react-native-maps` (decisão do dono em
  15/10/2026): Apple Maps na versão apagada (`mutedStandard`, sem pontos de interesse) no
  iOS, Google Maps com `customMapStyle` nas cores da Onside (`lib/map-style.ts`) no Android.
  Roda no Expo Go. Os pinos, o raio e os cards são nossos. A busca é `pubs.search` a partir
  do aparelho, senão da cidade do perfil (`pubs.getMyCity`), senão São Paulo; o fim do jogo
  ("ao vivo") vem de `@findsports_oficial/db/event-window`, a mesma fonte do servidor. A
  página do bar registra `profile_view` em `/api/bar/commercial-event`, como o web. A página do bar segue
  o design até "O que dizem", menos "Horário" e as avaliações escritas, que não têm dado (o
  bar não cadastra horário; a avaliação da Onside é só "voltaria"). "Ampliar", no fim da
  lista, dobra o raio só na visita. **Não existe reserva de mesa** (decisão do
  dono em 16/10/2026, card da seção 08; ADR 0003 revista): "Vou assistir aqui"
  marca presença e, no bar Elite, o servidor já emite o código do balcão
  (`packages/api/src/lib/attendance-ticket.ts`).
- **Vou assistir ("08"):** o botão da página do bar abre a folha `app/vou/[barId].tsx`
  (`formSheet` nativo com o vidro do iOS 26: fundo transparente em `contentStyle` e na
  tela; o `ScrollView` é filho direto da tela, com `flex: 1`, senão o
  `react-native-screens` o mede pelo caminho antigo e o conteúdo sai do lugar ou some), que marca a presença; no bar Elite (`pubs.getById` → `issuesCode`) ela dá lugar
  ao código no balcão, `app/codigo/[eventId].tsx` (tela cheia no escuro, brilho no máximo
  pelo `expo-brightness`, QR do `react-qr-code`). O QR leva a
  `/admin/validate?code=`, que no web já abre buscando o código. `app/(fan)/voce/meus-jogos.tsx`
  (menu "Você"; fica na pilha da aba, com a barra, e tocar "Você" volta ao menu) lista os próximos e os anteriores; "Avaliar" abre o pós-jogo
  `app/pos-jogo/[eventId].tsx` ("Você foi?" é `attendance.report`, "Voltaria?" é
  `ratings.submit`; marcar "Vou assistir aqui" libera a avaliação). O que o design da 08
  mostra e ainda não existe, cada um com ticket e comentário no lugar onde entra: "O que
  pesou?" no pós-jogo (WEB-398), "Sua Nª resenha" e o rodapé de conquistas (WEB-403),
  "entre elas Marina e Rafael" (WEB-404), "Desmarcado" nos anteriores (WEB-405) e o botão
  de calendário (WEB-406). A busca com
  IA (2h, WEB-400) também não entrou: o que o design mostra e não existe avisa "chega em
  breve" (`components/soon.tsx`).
- **Abas do torcedor:** são a barra
  nativa do iOS 26 (`NativeTabs` em `app/(fan)/_layout.tsx`, UITabBar com liquid glass,
  distorção e arraste do sistema; roda no Expo Go): ícones em PNG gerados dos nossos
  (`assets/images/tabs/`, claro e escuro, `renderingMode="original"`; a aba selecionada
  troca para `*-on`, o ícone com o nome ao lado, e o rótulo nativo fica oculto), IA na aba de papel
  `search` (o círculo à direita) e Favoritos e IA desabilitadas com `tabPress`. A barra tem Favoritos onde o design tem Ranking (o dono trocou em 16/10/2026); o Ranking fica no menu "Você". "Você" é aba
  de verdade (a barra a mantém marcada): mostra o mesmo Explorar com o menu de vidro por
  cima (`components/tab-bar.tsx`), e o estado que as duas dividem (filtros, folha,
  localização) fica em `components/explore-state.tsx`. Borda tracejada de um
  lado só não aparece no iOS: o picote do card é `react-native-svg`. O banco local nasce sem jogos: crie
  eventos para hoje nos bares de teste para ver os pinos, ou rode
  `apps/mobile/scripts/bar-do-ze.sql`, que monta o "Bar do Zé" completo da tela 2g (jogo ao
  vivo, próximos jogos, oferta, nota, 34 presenças, todas as características). Publicar no Android vai pedir
  chave do Maps SDK for Android em `app.json`.
- **Tema escuro:** o design só desenha conta, onboarding e avulsas no claro; no escuro valem
  as mesmas formas com tinta e papel trocados e o acid no lugar do vermelho. As cores que
  seguem o tema estão em `components/ui.tsx` (`FG`, `BG`, `SUB`, `HOT`, `CARD`, `LINE`,
  `DROP`, `EDGE`, `SPARK`, e `themed(claro, escuro)` para um valor avulso): são
  `DynamicColorIOS`, trocam sozinhas e servem no `StyleSheet` de módulo e no SVG. Onde a cor
  é calculada em JS (`interpolateColor`, gradiente, imagem, tom do `Glass`) use
  `useColorScheme`. Texto sem `color` sai preto: passe `FG`. `INK`/`PAPER` são as cores
  fixas (texto e ícone sobre acid ficam `INK`, com `accent={LIVE}`). No Android as cores
  dinâmicas ficam no claro.
- **Barra de status:** `useStatusBar` (`components/ui.tsx`), no foco e no `transitionEnd`.
  Não use `<StatusBar>` (com telas empilhadas, a de baixo ganha) nem a opção
  `statusBarStyle` da pilha (o Expo Go não liga `UIViewControllerBasedStatusBarAppearance`
  e mostra erro).
- **Movimento das telas de conta:** `components/motion.tsx` (entrada em sequência pelo
  `Screen`, pressão dos botões, erro que treme, háptico do `expo-haptics`). Animação de
  entrada (`entering`) é **constante de módulo** (`POP`, `SWAP`...): o Reanimated 4
  recomeça a entrada quando o objeto muda, e um `ZoomIn.delay(...)` escrito no JSX é um
  objeto novo a cada renderização. Nada de transparência animada em cima de vidro.
- **Navegador de telas (só em desenvolvimento):** a aba "DEV" na borda direita
  (`components/dev-tab.tsx`) abre `app/dev.tsx`, a lista das telas pelo código do design
  (4b…4n, 2p, 11p…11x, 2d/2e; 8a/8b recarrega o app para ver a splash). Tocar num item abre a
  tela montada de novo; "Recarregar esta tela", ou segurar a aba, monta a atual outra vez
  (a entrada toca de novo). Tela nova entra na lista de `SECTIONS`.
- **Tocar e digitar no simulador:** `idb` (`brew install facebook/fb/idb-companion` e
  `pip install fb-idb`; `idb connect <udid>`, `idb ui tap --udid <udid> x y` em pontos,
  `idb ui text`). Com `recordVideo` dá para conferir a microinteração quadro a quadro.
- **Liquid glass:** o que o design faz em vidro (botão "Pular", card sobre mapa ou foto) usa
  `Glass` (`components/glass.tsx`), que é o `GlassView` do `expo-glass-effect` no iOS 26 e
  cor translúcida mais opaca onde o vidro do sistema não existe (Android, iOS anterior).
- **Busca com IA:** a quarta tela da apresentação anuncia uma busca que o produto ainda não
  tem; o dono confirmou (14/10/2026) que ela vai existir e a tela fica como no design.
- **Fontes:** `apps/mobile/assets/fonts/*.ttf`, convertidas dos `.woff2` do web (React Native
  não lê woff2). Só existem os pesos em uso; para um novo, gere a instância com `fonttools`
  e **dê nome próprio a ela** (IDs 1, 4 e 6 da tabela `name`): o instanciador mantém o nome
  da fonte variável, e o iOS registra uma só das instâncias com nome repetido (os pesos
  saem todos iguais). Texto em Anton ou Geist Mono não leva `lineHeight` menor que a altura
  natural da fonte (1,505em e 1,3em), senão o iOS corta o topo das letras: use margem
  vertical negativa (ver `title` em `app/intro.tsx`).
- **Duas versões de React no repositório:** o Expo traz `react` e `react-dom` 19.2.3 próprios.
  Pacote de `packages/*` que dependa de biblioteca de React **declara `react` e `react-dom`
  na faixa do web** (`^19.2.5`), senão o bun liga a biblioteca à versão do Expo e o web quebra
  com "Incompatible React versions". `@types/react` é um só, pelo catálogo da raiz. Por isso o
  app não tem alvo web (`react-dom` próprio): quem confere é o aparelho.
- Conferir sem aparelho: `cd apps/mobile && bunx expo export --platform ios --output-dir <pasta>`
  empacota com o Metro. Mapa e outros módulos nativos vão exigir build de desenvolvimento
  (`expo run:ios` / `expo run:android`), não Expo Go.
- **Ver a tela no simulador** (Xcode 27, `xcode-select` já apontando para ele): o iPhone 16e
  tem 390 x 844, a medida do design. `bunx expo start --ios --port 8082` instala o Expo Go e
  abre o app; `xcrun simctl openurl booted "exp://<ip>:8082/--/intro?page=3"` leva a uma tela
  e `xcrun simctl io booted screenshot <arquivo>.png` tira o print, para comparar lado a lado
  com o design renderizado a 3x. O botão flutuante do Expo Go some com
  `EXDevMenuShowFloatingActionButton = false` no plist de preferências do Expo Go no simulador.
- `Image` com só `StyleSheet.absoluteFill` sai no tamanho original da imagem neste app: passe
  `width` e `height` explícitos.

### Routing

TanStack Router file-based routing — `routeTree.gen.ts` is auto-generated, never edit manually. Route context carries `trpc` (TRPCOptionsProxy) and `queryClient`.

## Linear

Este repositório é rastreado no Linear (workspace `onside-sh`, time `WEB`), via
`orca linear`. Existe também o time `PRO`, para decisão de produto que não vira commit
aqui. **Antes de criar ou atualizar qualquer ticket, leia `docs/linear.md`** — ele define
em qual time abrir, a taxonomia obrigatória (Type, Area, project), a estrutura da
descrição, e a diferença entre `Done` e `Shipped`.

Regra que vale em toda tarefa, mesmo sem o usuário pedir: ao terminar, rode a varredura
da seção 1 de `docs/linear.md` e **pergunte** sobre cada achado — defeito fora do escopo,
correção sem ticket, bloqueio, ticket existente que ficou desatualizado, decisão de
implementação tomada. Uma pergunta só, no fim, listando os itens. Não crie nem edite
ticket sem resposta do usuário.

## Product context

Brazilian app connecting football fans to bars/pubs showing specific matches. Signup is open to everyone — two roles: `fan` and `pub`.
