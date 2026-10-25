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

Para subir o web de outra worktree no seu próprio banco de desenvolvimento, crie
`findsports_dev_<sufixo>` no container do dev e rode com
`DEV_DATABASE_URL=postgres://findsports_dev:findsports_dev_local@localhost:5432/findsports_dev_<sufixo>`
(só vale em `development`, só em loopback e só com esse nome; `DATABASE_URL` continua ignorada).

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
`PUBLIC_APP_URL` em `onside.sh`, e produção sem `RESEND_API_KEY` continua falhando alto.
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

### Relógio do jogo

"Que dia é" e "o jogo acabou" têm um dono só: `packages/db/src/event-window.ts`
(`brasiliaDay`, `brasiliaDayStart`, `getEventEnd`, `isEventLive`, `hasEventEnded`),
sem imports, lido pelo servidor, pelo web e pelo app. Em SQL, os mesmos nomes estão em
`event-window-sql.ts` (só servidor: `eventEndSql`, `eventEndedSql`, `eventNotEndedSql`,
`brasiliaDaySql`, `brasiliaTodaySql`, `brasiliaDayStartSql`, `onBrasiliaDaysSql`,
`utcNowSql`), e `event-window-sql.integration.test.ts` confere os dois lados no Postgres.
"Hoje" é sempre o dia de Brasília; o fim derivado é exclusivo (no instante do fim o jogo
já acabou). `starts_at`, `ends_at` e `current_period_end` são `timestamp` sem fuso em
UTC: não compare com `now()` cru nem passe `Date` cru no `sql` (o driver o escreve no
fuso do processo); use `utcNowSql(now?)`. Não escreva `toLocaleDateString('en-CA', …)`,
`AT TIME ZONE 'America/Sao_Paulo'` nem `coalesce(ends_at, …)` à mão.

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

### Título do jogo e card do bar

O título de um jogo sai de `gameTitle` em `packages/db/src/game-title.ts`, sem imports:
web, app e servidor (chat da IA) usam o mesmo. A regra (dono, 24/10/2026): **dois
participantes → "A × B"; qualquer outro número (0, 1, ou 3+, como numa corrida, que não
é confronto) → o texto livre do bar, senão o campeonato**. Leitura em SQL cru usa o irmão
`gameTitle` de `packages/api/src/lib/game-participants.ts`; um teste de integração
confere que os dois concordam. Tela que põe um lado de cada (escudos, ticket do código)
usa `matchSides` (só com dois) e nunca quebra o título de volta.

O card do bar nas listas (`pubs.search`, `nearbyWithoutGames`, `searchByLocation`) é
completado depois do cache por `toBarCards` (`routers/pubs.ts`): gasto médio pela
assinatura vigente, características, quem vai (piso do `readGoing`) e a exibição pública
da nota. O que pode envelhecer um TTL fica no cache; o que não pode, ali.

### Environment variables

Split by runtime boundary:
- `packages/env/src/server.ts` — `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `LOCATIONIQ_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NODE_ENV`
- `apps/web/src/lib/env.ts` — client-safe `VITE_*` vars only

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
- **Teste grátis nasce no cadastro, sem cartão**: 120 dias no Elite, para todo bar
  novo (`ONBOARDING_TRIAL`, em `packages/api/src/lib/plan-limits.ts`). Quem
  contrata antes do fim herda a data: o checkout manda `trial_end` e o Stripe só cobra
  quando o teste acabaria (`packages/auth/src/stripe-checkout.ts`).
- **O teste do cadastro vale para qualquer plano** (WEB-358): o bar nasce no Elite
  e troca em `/plan` ("Testar o X grátis"), sem cartão e quantas vezes quiser,
  por `pub.changeTrialPlan`. Só `subscription.plan` muda; o fim do teste é o mesmo.
  Com assinatura no Stripe ou teste vencido a troca é recusada: o caminho é contratar.
  No Starter o limite de jogos conta por mês, de trás para frente a partir do fim do
  teste (`getEventCreationPeriod`).
- **Teste do cadastro vencido tira o bar do ar** (WEB-357): sem assinatura no Stripe e
  com o período encerrado, a reconciliação diária (`reconcileBarPlans`, em
  `packages/api/src/lib/bar-plan-sync.ts`) desliga `bar.is_active` junto com o
  rebaixamento de plano — então há até um dia entre o vencimento e a saída do ar.
  Contratar um plano religa o bar pelo `applyStripeSubscription`. `past_due` não entra
  nessa regra: continua no ar com os recursos do Starter.
- **Excluir a conta encerra a assinatura no Stripe** (WEB-336): assinatura viva não
  bloqueia mais a exclusão; o servidor cancela no Stripe e só então apaga a conta, e se
  o Stripe falhar nada é excluído (`packages/auth/src/account-deletion.ts`).
- **Motivo do cancelamento** (WEB-445): "Por que está cancelando?" grava em
  `subscription_cancel_reason` ao abrir o portal (intenção). Só quando o webhook vê a
  assinatura agendada para acabar ou encerrada o último motivo do dia antes do pedido
  (`canceled_at`) vai a `cancellation_details` no Stripe (`stripe-sync.ts`), sem
  sobrescrever o que o portal trouxe. Lista e feedback do Stripe em
  `packages/db/src/cancel-reasons.ts`.
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

### Código do balcão pela comanda (WEB-412)

Opção do bar Elite, **desligada por padrão** (`bar.confirms_codes_later`), escolhida
no card "Oferta da casa" do `/admin` (Na hora / Depois do jogo, pela comanda), por
`pub.updateCodeConfirmation`. Ligada, a tela do código do torcedor fala com o garçom
("anote na comanda"), o card traz o recado pronto para a equipe, e o dono lança os
códigos anotados em `/admin/quem-vai` por `reservationValidation.logLate`, até 48 h
depois do fim do jogo (`getLateEntryWindow`). Acima da caixa, "Faltou lançar?"
(`reservationValidation.notLogged`) lista pelo nome quem marcou e não foi lançado, sem
ler `attendance_report`. O uso fica com `late = true` e `used_at` na
hora do lançamento: quem conta visita usa a data do jogo (`event.starts_at`). A Onside não confere se o cliente estava no bar: fraude é risco do bar,
decisão do dono. Bar "na hora" não lança depois. O alfabeto do código não tem O, 0,
I, 1 nem L (`CODE_ALPHABET`), para não confundir anotado à mão.

### IA (Workers AI, WEB-424; busca com IA, WEB-400)

Binding `AI` no `wrangler.jsonc` (produção e preview) e um AI Gateway por ambiente em
`AI_GATEWAY_ID` (`onside-prod`, `onside-preview`; **crie os dois no painel da Cloudflare**,
com o teto de US$ 40/mês e alertas em 50% e 80% no de produção). Sem Gateway em produção a
IA não chama nada. O `worker.ts` entrega o binding a `packages/api/src/lib/ai/binding.ts`; o
`vite dev` roda em Node sem ele, e em `development` a chamada vai pela API REST do Workers
AI com o token do login do `wrangler` e o Gateway `default` (o `getPlatformProxy` trava no
Bun). Toda chamada passa por `runAi` (`lib/ai/run.ts`): confere `ai.enabled` (desligada por
padrão, no `app_config`), o teto do mês somando `ai_run.cost_usd`, US$ 1,50/mês e 30
chamadas/dia por pessoa, manda `run_id`, `variant` e `feature` como metadados do Gateway e
grava uma linha em `ai_run` (assim como polegar e ações em `ai_action`). Tetos e sorteio
(hash de usuário + teste, pesos em `ai.variant_weights`, que somam 100 em cada teste) são
puros em `lib/ai/limits.ts`; os valores dos tetos e limites moram em `ai.limits` no
`app_config` (padrão: US$ 40, US$ 1,50 e 30 chamadas por pessoa, 10 e 100 mensagens), e o
teto do Gateway de produção é à parte: subir um sem o outro não libera nada.

A tela "IA" do Houdini (`routes/houdini/_app/ia.tsx`, `houdini.ia.overview` e `runs`, só
admin) mostra a situação, os braços dos dois testes, quem mais gasta e o registro, e muda
`ai.enabled`, pesos e limites pelo `appConfig.set` (sem prazo, com confirmação e Grimório).
As contas estão em `lib/ai/report.ts`: conversa é a sequência da mesma pessoa no mesmo braço
sem pausa de mais de 30 min; converte com `ai_action` em até 24 h da resposta; a diferença
B − A sai com intervalo de 95% só com 100 conversas por braço e 5 com e 5 sem ação em cada.

O chat (`routers/ai.ts`, `lib/ai/chat.ts`) só consulta a Onside pelas ferramentas de
`lib/ai/chat-tools.ts`, que chamam `pubs.*` com a sessão do torcedor (máximo 3 por mensagem,
termina em `responder`); bar citado que nenhuma ferramenta devolveu sai da resposta.
Característica acima das 6 que a busca aceita não recusa o pedido (WEB-458): ficam as de
"Para ver o jogo", depois as outras na ordem do modelo, e o app acrescenta à resposta
quais ficaram de fora (`searchAmenities`, `withLeftOut`). Falha:
nova tentativa no mesmo modelo, depois o outro braço. Limite do chat: 10 por dia e 100 por
mês (Brasília), contando só resposta útil (`ai_run.useful`). Modelos e preços em
`lib/ai/models.ts`, com o raciocínio de cada um (`reasoningEffort`: o Gemini recusa `none`
e vai em `minimal`). Modelo de fora chamado sem Gateway responde `2021 Insufficient
balance`; pelo Gateway os cinco respondem (`packages/api/scripts/ai-smoke.ts`). No `vite
dev`, ligue `ai.enabled` no seu banco (cada mensagem chama os modelos de verdade e gasta
crédito; para testar sem rede, os testes dublam o modelo com `setAiBinding`). Só os modelos
decididos: nada de trocar por outro do catálogo sem o dono. Conjunto
offline (só roda com autorização e teto de custo): `packages/api/scripts/ai-chat-eval.ts` (34 pedidos: filtros certos, bares
inventados, tempo e custo).

**Chat em eventos (Rodada 24):** `ai.converse` é uma mutation que devolve um async iterable
(`ChatEvent`, `lib/ai/events.ts`, que o app importa como tipo): `step` ("Entendi o pedido",
"Achei o jogo", "Procurando bares que vão passar", "Comparar e ordenar", só os que o pedido
usa; numa busca, "Comparar e ordenar" chega já como `todo` e o app o mantém vazio no fim),
`tool` (`run` → `done`, ou `wait` na proposta), `bars` assim que a busca devolve (sai de
novo antes do texto se a resposta escolheu outros ou outra ordem: a última lista vale),
`text` com citação `[[n]]` (renumerada depois da conferência; fora do intervalo sai),
`proposal` e `done` (chips com `key` = `<argumento do pubs.search>:<valor>`, fontes,
até 3 sugestões, `thoughtMs`, `searches`). Trava, braços, reserva e `ai_run` são os do chat.
`marcar_vou_assistir` e `lembrar` só propõem: a proposta vira `ai_proposal` depois da linha
do `ai_run` e só `ai.confirm` executa (uma vez, só o dono; "Vou assistir" pelo
`setAttendance`, chamado por `createFriendCall`, lembrete por `recommendations.remind` com
`beforeMinutes: 180`, o "Me lembrar 3 h antes", que aparece em Avisos 3 h antes do jogo e,
com push (WEB-416), avisa nessa hora; sem `beforeMinutes`, o "Lembrar" de Bares pra você vale o dia;
cada ação grava `ai_action`; falha volta com `code` estável, `ConfirmFailure`). Só propõe
quando a mensagem pede (marcar, chamar, lembrar), e "Chamar" só com o nome escrito nela;
amigo é achado só entre os aceitos. O trabalho vai pelo `waitUntil` (`runInBackground`):
o app desconectar não perde o `ai_run`. A resposta sai com `Cache-Control: no-transform`,
para a compressão da borda não juntar os eventos. O app fala com
`ai.converse` pelo `httpBatchStreamLink` com o `fetch` de `expo/fetch` (`splitLink` em
`apps/mobile/lib/trpc.ts`). Fumaça contra um web rodando:
`packages/api/scripts/ai-converse-smoke.ts`.

### UI / Styling

Global styles and design tokens: `packages/ui/src/styles/globals.css`. Tailwind v4.

Add shared primitives (used across multiple apps):
```bash
npx shadcn@latest add <component> -c packages/ui
```

Add app-specific blocks: run shadcn CLI from `apps/web`.

Import shared components: `import { Button } from "@findsports_oficial/ui/components/button"`

### Mapa

O web não tem mais mapa (painel do bar, Rodada 3, 24/10/2026): o mapa MapLibre do
torcedor saiu com o painel do torcedor, e o app usa o mapa nativo
(`react-native-maps`, ver "App mobile"). O Worker `apps/tiles` (`tiles.onside.sh`),
o archive `.pmtiles` no R2 e `apps/web/scripts/build-map-tiles.ts` continuam como
estão, sem quem os use: são infra de produção e só saem por decisão do dono. O
runbook segue em `docs/map-tiles.md`; o código do mapa está no histórico do git.

### SEO

Nome do site no Google (JSON-LD `WebSite`/`Organization` da home), o que é
indexável, `robots.txt` e favicons: **leia `docs/seo.md` antes de mexer em
`<title>`, `head`, sitemap ou ícones.**

Performance da home no celular (pôster com `srcset`, prioridade das fontes,
o que não pode entrar no JavaScript de entrada) e como medir com Lighthouse:
`docs/perf-home.md`.

### E2E

Playwright em `apps/e2e`, job `e2e` no CI. **Antes de escrever ou rodar teste de
navegador, leia `docs/e2e.md`** — fixtures, dublês (outbox de e-mail, stub da
LocationIQ, R2, API e webhook do Stripe), por que o servidor roda sem cache e as
variáveis `E2E_PORT`/`E2E_DATABASE_URL` para rodar em paralelo entre worktrees.

### Painel do bar no web

Design "Bar Web" (Rodada 2) no Claude Design. O painel **segue o tema do sistema**
(`prefers-color-scheme`), claro e escuro; o resto do site continua só no claro.

- **Tokens e estilos:** `apps/web/src/components/painel/painel.css` (variáveis
  `--painel-*`, sombras sólidas `--painel-sh*`), carregado só pelas rotas `/admin/*`
  (link no `head` de `routes/admin.tsx`) e preso a `.painel`.
- **Peças:** `apps/web/src/components/painel/` (`import { Card, Botao } from
  '@/components/painel'`; a lista está no topo de `index.ts`): ícones duotom, card,
  botão, badge e "em breve", chip, seg, toggle, campo, avatar, progresso, KPI e os
  cabeçalhos de página e de card. Peça nova que mais de uma tela usa entra ali.
- **Shell:** `PainelShell` (`components/painel/shell.tsx`), a barra lateral com o bar, a
  navegação com contadores, "Validar código" e o menu do dono; vira trilho de ícones
  até 1180 px. Montado uma vez pelo layout `routes/admin.tsx`.
- **Rotas:** `/admin` (Hoje), `/admin/jogos`, `/admin/desempenho`, `/admin/quem-vai` (só Elite ou com código
  em aberto, senão volta a `/admin`), `/admin/meu-espaco`, `/admin/configuracoes`,
  `/admin/billing`, `/admin/validate`, todas filhas do layout. As abas antigas por hash
  (`/admin#admin-espaco`) são levadas à rota nova no cliente (`getAdminRouteFromHash`).
- Tela antiga que ainda não foi refeita fica num `div.painel-legado`, que no escuro vira
  uma folha clara.
- **Hoje** (`/admin`, `components/admin/hoje.tsx`, contas em `hoje-model.ts`): o dia da
  casa vira às 6h de Brasília (`diaDaCasa`), e "A noite" vai de 18h a 2h, esticando
  para caber os jogos do dia. Quem vai e quem chegou saem de
  `commercialAnalytics.getMyEventAnalytics` (`reservedPeople`, `arrivals`, só no Elite);
  "Chegaram agora", de `barReservations.going`. "Novo jogo" abre
  `/admin/jogos?novo=1` (o `validateSearch` da rota), que abre o formulário; sem poder
  criar (limite, fora do ar), vira "Ver grade". No meio, o "Desempenho do bar" dos
  últimos 30 dias; à direita, o card do plano. Fora do ar, o resto da tela fica apagado.
- **Avisos do painel e card do plano** (Rodada 3, `components/admin/avisos.tsx`, regras
  puras em `avisos-model.ts`): no máximo um aviso por tela, na prioridade fora do ar,
  trial, Starter (dentro do limite, último jogo, limite), pagamento pendente, trial
  encerrado. O do trial só em Hoje, o do Starter dentro do limite só em Jogos; Pro ou
  Elite parado vê "Regularizar assinatura" mesmo no limite (WEB-331). Plano e cobrança
  tem o seu, com "Atualizar pagamento" (portal). O card do plano (seis estados) fica em
  Hoje e, no limite do Starter, em Jogos com "No Pro". A medalha dos planos é
  `Medalha` (`components/painel/medalha.tsx`), a mesma em `/plan`, cobrança,
  comprovante e onboarding.
- **Jogos** (`/admin/jogos`, `components/painel-jogos/jogos-page.tsx`, contas em
  `domain/painel-jogos.ts`): lista por dia ou semana (de domingo a sábado, decisão do
  dono; as setas andam sete dias), o jogo aberto à direita (abaixo de 1100 px e na semana, numa folha
  lateral) e o formulário na folha (`admin/event-form.tsx`). `?novo=1` abre o "Novo
  jogo" quando a criação está aberta e sai da URL; `?jogo=<id>` abre um jogo.
  "Duplicar" só abre o formulário com o jogo uma semana depois. Rascunho, sugestões e
  importação da rodada (WEB-433), oferta por jogo (WEB-422) e a lista de quem vai por
  jogo não existem no servidor: aparecem com "em breve". "Viram o jogo" é o
  `uniqueVisitors` do analytics por jogo. A aba Passados é "Como cada jogo foi"
  (`painel-jogos/como-cada-jogo-foi.tsx`): os jogos já começados do período do
  Desempenho, do que mais puxou público ao que menos, a linha que abre canais e
  códigos (estes só no Elite) e, no Pro e no Elite, "Comparar jogos" (entre jogos ou
  contra a média do bar, conta do servidor por `comparisonTarget`). `?passados=1`
  abre nela.
- **Desempenho** (`/admin/desempenho`, `components/admin/desempenho.tsx`): o
  `commercialAnalytics` do bar no período (30 dias, 12 meses e Tudo só se o histórico
  do plano deixa, e o personalizado, conferido contra ele). Os três números e a série
  diária são de `desempenho-dados.ts`, que o "Desempenho do bar" de Hoje também lê; o
  período, a ordem dos jogos e os códigos, de `desempenho-contas.ts`. O período
  escolhido vale também em Jogos · Passados até recarregar a página. O que o plano não
  vê vem nulo do servidor: atividade diária, entrega nos clássicos e "Quem foi pela
  Onside" só no Elite; os canais a partir do Pro. A semana do painel (Jogos e a
  contagem de Hoje) vai de domingo a sábado; comparação de período não é semana.
- **Quem vai** (`components/painel-jogos/quem-vai-page.tsx`): um card por jogo com a
  validação aberta, com as peças do jogo aberto (`PessoaQuemVai`); `#jogo-<id>` rola até
  o jogo ("Ver os 24 →"). O bar Elite que confirma pela comanda lança os códigos aqui
  (`admin/late-code-entry.tsx`), com o "Faltou lançar?".
- **Meu espaço** (`/admin/meu-espaco`, `components/admin/meu-espaco.tsx`, contas em
  `espaco-model.ts`): um formulário só, com rascunho local até "Salvar alterações", que
  manda cada parte à sua mutation (`updateMe`, `updateMenuInfo`, `updateHouseOffer`,
  `updateOpeningHours`) só se ela mudou; cardápio (Pro) e oferta (Elite) só entram com o
  plano em dia (`recursoPago`). Foto e "como o código é conferido" (WEB-412) gravam na
  hora. A prévia ao lado (`espaco-previa.tsx`) é a página do bar no app, desenhada do
  rascunho; Card e Mapa são "em breve". CEP também: o bar guarda rua e número
  num campo só. Galeria do ambiente (WEB-439, Pro e Elite): até 8 fotos além da capa
  (`GALLERY_MAX_PHOTOS`), em `bar.gallery_photos` na ordem da página; sobe pela rota da
  capa com `?galeria` (chave `bars/<id>/gallery/<uuid>`), entra por `pub.addGalleryPhoto`,
  ordena por `pub.reorderGallery` e apaga por `DELETE /api/bar/photo?galeria=<url>`. Sem o
  plano some do perfil e fica guardada (`lib/bar-gallery.ts`). No app vai num carrossel logo
  depois da capa: o design não desenha fotos do bar.
- **Configurações** (`/admin/configuracoes`, `components/account/configuracoes.tsx`): os
  diálogos de senha, 2FA e exclusão são os de `components/account/*`. "Baixar meus dados"
  ("Pedir arquivo") manda o JSON por e-mail pelo `account.requestExport` (conta, bar, plano
  e jogos; nada de torcedor), o mesmo do app: ver Configurações do app.
  Avisos por e-mail são "em breve".
- **Web só para bares (decisão do dono, 24/10/2026).** Não há mais tela de torcedor no
  web: quem não é bar e entra cai em `/torcedor` (`FAN_HOME`, `utils/auth-guards.ts`),
  "a Onside de torcedor está no app"; o link de um bar, `/pub/$pubId`, é a mesma página
  com o cartão do bar (`functions/get-bar-teaser.ts`, sem sessão, `noindex`), QR para a
  própria página e "Abrir no app" (`onside://bar/<id>`) no celular. Lojas: em breve.
- **Entrada:** login, cadastro (sempre `role: 'pub'`, sem escolha de perfil), recuperação
  de senha e confirmação de e-mail no `AuthSplit`; onboarding do bar no `ObShell`, com a
  prévia "Assim o torcedor vê" ao lado. Peças e estilos em `components/entrada/`
  (`entradaHead` carrega o `painel.css` e o `entrada.css`), no tema do sistema. O CEP
  preenche o endereço pelo ViaCEP, do navegador (`lib/cep.ts`; o servidor não recebe CEP).
  Depois do cadastro, `/onboarding/pub/no-ar` (`PUB_LIVE_PATH`, a única `/onboarding/*`
  aberta a bar pronto), com o atalho para cadastrar o primeiro jogo.

### Houdini (painel interno)

O painel interno é o Houdini (projeto Houdini no Linear, WEB-383 em diante), em
`houdini.onside.sh`, servido pelo mesmo Worker; o antigo `/internal` saiu (WEB-393). As rotas são `/houdini/*`; no host
próprio o `rewrite` do router tira o prefixo (`apps/web/src/lib/houdini-host.ts`). No
`www` o caminho `/houdini` dá 404 (admin é mandado para o host); no preview e no
`vite dev` o Houdini responde em `/houdini`. Quem entra é decidido no servidor por
`lib/houdini-gate.ts`: só admin com 2FA ligado; o resto recebe o 404 de verdade (a
"Cortina"). Telas novas entram em `routes/houdini/_app/` e no `HOUDINI_NAV` de
`components/houdini/shell.tsx`; o visual é o de `components/houdini/houdini.css`
(proposta 3 do canvas https://claude.ai/artifact/YbJ76gkJaTKaqTtuRLQmNt). Jogo em rascunho (WEB-436) fica fora de
Jogos e de toda contagem do Houdini; só a aba Jogos da ficha do bar o mostra, marcado "Rascunho". A seção IA está em "IA (Workers AI…)".

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
- **Cache das consultas:** `lib/query-client.ts`. Resposta vale 30 s (`staleTime`);
  esportes, times, cidade, preferências, `friends.me` e `appConfig.getPublic`, 5 min
  (`lib/trpc.ts`). Toda mutation que dá certo, o `refreshSession` e o `ai.confirm` vencem o
  cache inteiro sem buscar nada (`refetchType: 'none'`): a próxima tela que abrir busca de
  novo, e a tela à vista atualiza pelo `invalidateQueries` da própria mutation. Escrita
  nova fora do `useMutation` (como `authClient`) tem de vencer o cache do mesmo jeito.
  Voltar do segundo plano revalida o que venceu (`focusManager` no `AppState`) e, sem rede,
  as consultas esperam (`onlineManager` no `expo-network`).
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
  do design. Quem abre sem sessão cai nela (`app/index.tsx`). O mapa da primeira tela (4b) é o do Explorar de hoje, parado: o
  `MapView` nativo, as gotas da Rodada 21 (`MapDrop`), o raio tracejado e o seu ponto
  (`MeDot`), por cima em posições fixas para a entrada animar. A distância e a
  localização do onboarding usam o mesmo mapa (WEB-420), centrado na cidade escolhida
  (senão São Paulo), com `RadiusCircle` no raio escolhido: na distância o zoom sai do
  raio para o círculo crescer na tela. O Apple Maps encaixa a região na área segura, não
  na tela toda (conta em `onboarding/location.tsx`). O "Nada no raio" (23i) de Bares pra
  você usa o mesmo mapa; a imagem antiga (`intro/map.jpg`) saiu do repositório.
  O design só desenha o claro; a apresentação segue o tema do sistema com tinta e papel
  trocados e o acid no lugar do vermelho (a regra da tab bar do design).
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
  o design até "O que dizem", menos as avaliações escritas e "Ver todas" (a avaliação é
  "voltaria" mais etiquetas). "Horário" (WEB-397) só com horário informado: o dono grava em
  `/admin` (`pub.updateOpeningHours`), sete faixas em `bar.opening_hours` (0 = domingo, fechar
  antes de abrir vira a meia-noite) e `pubs.getById` devolve `openNow` no relógio de Brasília;
  a regra e o agrupamento ("Seg a qui") são de `packages/api/src/lib/opening-hours.ts`, que o
  web também usa. "Em dia de clássico" não entra. Em "Próximos jogos aqui" vai uma etiqueta
  por jogo: "Vou", senão "Telão", senão "Som ligado" (WEB-399: `event.on_big_screen` e
  `with_sound`, nulos herdam das características, `lib/event-screen.ts`; o dono desmarca no
  "Novo evento"). Abaixo da nota, o resumo de "O que pesou?" (WEB-398, `ratingReasons`):
  até três etiquetas de quem voltaria e de quem não voltaria, sem nome, pelo piso da nota. "Ampliar", no fim da
  lista, dobra o raio só na visita. Com menos de cinco bares com jogo (e fora do "Ao
  vivo"), a lista se completa com os bares perto sem jogo marcado, sob "Sem jogo
  marcado" (`pubs.nearbyWithoutGames`; decisão do dono e sócios em 21/10/2026). No
  mapa eles são um ponto oco pequeno (`QuietDot`), abaixo das gotas e fora de grupos e
  rótulos, para os com jogo continuarem na frente; tocado, vira a gota grande como os
  outros. **Não existe reserva de mesa** (decisão do
  dono em 16/10/2026, card da seção 08; ADR 0003 revista): "Vou assistir aqui"
  marca presença e, no bar Elite, o servidor já emite o código do balcão
  (`packages/api/src/lib/attendance-ticket.ts`; quem emite é `issuesCounterCode`, em
  `lib/current-plan.ts`, a mesma regra da oferta, de quem vai e da validação). Toda marcação passa por `setAttendance`
  (`packages/api/src/lib/attendance.ts`): `attendance.set`, `ai.confirm` e o "Vou também".
  O Elite desliga a lista de quem vai jogo a jogo no formulário do painel (WEB-437,
  `event.attendance_enabled`): o botão some para quem não marcou, marcação nova e
  chamado de amigo são recusados e Quem vai do painel deixa o jogo de fora; quem já
  marcou fica, com o código valendo.
- **Vou assistir ("08"):** o botão da página do bar abre a folha `app/vou/[barId].tsx`
  (`formSheet` nativo com o vidro do iOS 26: fundo transparente em `contentStyle` e na
  tela; o `ScrollView` é filho direto da tela, com `flex: 1`, senão o
  `react-native-screens` o mede pelo caminho antigo e o conteúdo sai do lugar ou some), que marca a presença; no bar Elite (`pubs.getById` → `issuesCode`) ela dá lugar
  ao código no balcão, `app/codigo/[eventId].tsx` (tela cheia no escuro, brilho no máximo
  pelo `expo-brightness`, QR do `react-qr-code`). O QR leva a
  `/admin/validate?code=`, que no web já abre buscando o código. `app/(fan)/voce/meus-jogos.tsx`
  (menu "Você"; fica na pilha da aba, com a barra; tocar "Você" numa tela da pilha abre o menu
  por cima dela, com `disablePopToTop` na aba, e fechar deixa a pessoa onde estava) lista os próximos e os anteriores, e o botão de calendário põe o jogo na agenda
  do celular pelo formulário de evento do iOS (`expo-calendar/legacy`, sem pedir permissão); "Avaliar" abre o pós-jogo
  `app/pos-jogo/[eventId].tsx`: "Você foi?" e "Voltaria?" são um item da fila
  `postGame.pending` e vão juntos em `postGame.answer`, numa transação
  (`packages/api/src/lib/post-game.ts`; web e app leem a mesma fila; `attendance.report`,
  `ratings.submit` e os vizinhos ficam como adaptadores do web publicado antes). Marcar
  "Vou assistir aqui" libera a avaliação, e "Não fui" a recusa. "O que pesou?" são as
  seis etiquetas de `RATING_REASONS` (`packages/api/src/lib/rating-reasons.ts`, id nunca
  reusado), opcionais, gravadas com o "voltaria" em `bar_rating.reasons`; o card de
  avaliação do dashboard web usa as mesmas. Não há avaliação "verificada": todas entram
  no resumo. O rodapé de Meus jogos abre o ranking do mês (WEB-409). "34
  pessoas vão, entre elas Marina e Rafael" (WEB-404) sai de `readGoing(eventIds,
  viewerId)` (`packages/api/src/lib/attendance.ts`): só nomeia amigo aceito com
  `activity_visibility` "todos" ou "amigos", mesmo abaixo do piso (aí sem contagem); quem
  não é amigo nunca é nomeado. Frase e pilha em `goingSummary` (`lib/explore.ts`). "Desmarcado" nos anteriores não entra (decisão
  do dono em 21/10/2026): desmarcar apaga a presença e não fica registro. O que o
  design mostra e não existe avisa "chega em breve" (`components/soon.tsx`).
- **Conquistas ("09", WEB-403):** `app/(fan)/voce/conquistas.tsx` (estante, 2i, no menu
  "Você") e `app/conquista/[id].tsx` (a medalha, 2j; com `?nova=1`, a conquista
  desbloqueada, 2k). O design só desenha o escuro; no claro, tinta e papel trocam, o
  vermelho entra no lugar do acid em texto e a bloqueada sai em cinza-pedra
  (`useMedalPalette` em `components/medal.tsx`, `LOCKED_LIGHT` em `lib/medals.ts`). As regras são do
  servidor (`packages/api/src/lib/achievements.ts`, `achievements.mine`): nada é gravado,
  tudo sai das visitas e das avaliações. **Visita** é uma fonte só,
  `packages/api/src/lib/visits.ts` (uma linha por torcedor e jogo; hoje o código validado
  no balcão e não desfeito): conquistas, "Já fui", amigos e recomendações a leem, e o
  check-in do WEB-408 entra lá como segunda fonte. "Quem vai", o alerta interno e a
  análise comercial leem o código de propósito (é o registro do bar, não a visita). A 2k abre sozinha quando sai medalha nova
  (`components/achievement-watcher.tsx`; a tela do código pergunta a cada 5 s até o
  balcão validar). **A medalha 3D é uma WebView**, não `expo-gl`: o three roda no WebGL
  do Safari (`assets/medal/viewer.html`), porque o `expo-gl` congelava a tela quando uma
  textura subia depois do primeiro quadro e não mostrava nada num segundo contexto. Estante,
  perfil e listas usam a miniatura pronta (`assets/images/medals/*.webp`). Visualizador e
  miniaturas saem do desenho do design (`o3d.js`) por `bun apps/mobile/scripts/medals/generate.ts`;
  medalha nova é uma linha em `ACHIEVEMENTS` e outra em `lib/medals.ts`, e o gerador de
  novo. Para ver com dados: `apps/mobile/scripts/conquistas.sql` (`-v fan=<e-mail>`).
- **Perfil (10, tela 2l):** `app/(fan)/voce/perfil.tsx`, aberto pelo menu "Você". Só lê
  o que já existe (`achievements.mine`, `attendance.visits` e `mine`, `pubs.getFavorites`,
  `getMyPreferences`, `getMyCity`, `postGame.pending`); as contas ficam em `lib/profile.ts`.
  "Suas comunidades" do design não entrou (comunidades não existem), "Tenho um bar"
  saiu a pedido do dono; a engrenagem, "Raio de busca" e "Esportes" abrem as
  Configurações.
- **Configurações (11f–11i, escolhidas pelo dono em 20/10/2026):** `app/configuracoes.tsx`
  (`?aba=preferencias|avisos|conta|privacidade`), pela engrenagem do menu "Você" e do
  Perfil, por "Preferências" no menu e pelo sino de Avisos. Contas puras em
  `lib/settings.ts`. Preferências: a frase do perfil, "Recomeçar sugestões"
  (`recommendations.reset`), esportes e times ("Editar" abre `onboarding/sports` e
  `teams` com `?edit=1`, que começam do que a pessoa tem e salvam no fim por
  `updateMyPreferences` e `updateMyTeams`; voltar sai da edição, porque o expo-router
  põe as boas-vindas por baixo) e o raio (`updateUser({ searchRadiusKm })`). Conta:
  nome (`updateUser`), cidade (`app/cidade.tsx`, `updateMyCity`), senha
  (`app/senha.tsx`, `changePassword`, derruba os outros aparelhos), sessões
  (`listSessions`, revogar por `/revoke-session-by-id`; a lista pede login de menos de
  um dia, `freshAge`, senão pede para entrar de novo), sair e excluir (`deleteUser` com
  a senha). Foto (WEB-419, `lib/avatar.ts`): seletor ou câmera do sistema com recorte
  quadrado, 512 px em JPEG e o mesmo `POST /api/user/avatar` do web (URL assinada do R2,
  depois `updateUser({ image })`); sem as chaves do R2 o servidor responde 503 e o app
  mostra a frase dele ("Upload de foto indisponível no momento."). Para testar o
  upload, suba o web com `R2_MEDIA_*`, `CF_ACCOUNT_ID` e `MEDIA_PUBLIC_ORIGIN` (o
  bucket é o de produção, `onside-media`, na chave `users/<id>/avatar`); para ver o
  503, suba com essas variáveis vazias. A foto aparece no menu Você, no Perfil, na Conta
  e no quadrinho dos amigos (`Avatar` com `image`). Duas etapas: `app/duas-etapas.tsx`
  (senha, "Abrir no app autenticador" com o `otpauth://`, QR e chave, código de 6
  dígitos em `components/code-boxes.tsx`, códigos de recuperação; ligada, desliga com a
  senha). Ligar troca a sessão: a lista de aparelhos é relida. O `@usuário`
  dos amigos se troca na Conta. Avisos segue o desenho com os controles desligados e o
  aviso de "em breve" (não há notificação); em Privacidade, "Onde você foi" funciona
  (quem vê os bares e jogos, quem pode te adicionar), "Aparecer no ranking global" e
  comunidades seguem "em breve" (o controle pede coluna nova), e "Baixar meus dados" pede o arquivo (`account.requestExport`, WEB-418): o
  servidor monta o JSON (perfil, preferências, favoritos, jogos, avaliações, amigos e
  conquistas; de outra pessoa, só nome e `@` de amigo; para bar, `barData`) e o manda de
  anexo para o e-mail da sessão, um pedido a cada 24 h por conta (`rate_limit`, chave
  `data-export:user:<id>`; o segundo volta `TOO_MANY_REQUESTS` com a frase para a tela, e
  envio que falha devolve o pedido). A política de privacidade (seção 13) cita o caminho. "Reservas" do 11g virou "Vou assistir", porque
  não existe reserva de mesa.
- **Amigos (S1 do design, 11a–11d, decisões do dono em 21/10/2026):** só na API e no
  app; o web não tem tela (por isso o branch só vai para master com o app pronto). Banco:
  `friendship` (`packages/db/src/schema/social.ts`, uma linha por dupla em qualquer
  direção, pendente até aceitar; recusar ou desfazer apaga) e, em `user`, `username`,
  `friend_code` ("GB-4821", o do QR), `activity_visibility` e `friend_requests_from`
  (Privacidade, 11i). `@` e código nascem no primeiro uso (`ensureSocialIdentity`). Regras
  em `packages/api/src/lib/friends.ts`, roteador `friends`. Telas: `app/amigos`
  (11a, item "Amigos" do menu "Você"; no design abre pelo Ranking), `amigos-busca` (11b,
  "Perto de você" é a mesma cidade), `meu-codigo` (11c, QR do link de convite e leitor
  pelo `expo-camera`), `amigo/[id]` (11d: nível, o mês lado a lado, o jogo marcado com
  "Vou também", bares em comum, tudo pela privacidade da pessoa), `contatos` (a conta não
  tem telefone: o app manda o SHA-256 dos e-mails da agenda, pelo `expo-contacts/legacy`,
  e só aparece quem aceita pedido de todos). Sugestões só de amigos de amigos. O link de
  convite é `/convite/<código>` no web (página `noindex` que abre `onside://convite/…`):
  conta criada há menos de um dia já entra como amiga; sem conta, o app guarda o código
  (`savePendingInvite`) e as abas do torcedor aceitam depois (`usePendingInvite`).
  "Convidar" (comunidades) avisa "em breve". Pedido respondido e
  sugestão adicionada ficam na tela com o botão trocado até ela abrir de novo
  (`useKept`): tirar a linha fazia o card pular, e `LinearTransition` não anima a
  altura do `Card`. Dados de teste: `apps/mobile/scripts/amigos.sql`.
- **Ranking do mês (13 do design, 10d e 11e; WEB-409):** `app/(fan)/voce/ranking.tsx`, pelo
  item "Ranking" do menu "Você" e pelo rodapé de Meus jogos. Nada é gravado: `ranking.friends`
  (`packages/api/src/lib/ranking.ts` e `ranking-read.ts`) conta das visitas (`visits.ts`) você
  e os amigos aceitos que deixam os amigos ver a atividade (`canSeeActivity`, como o perfil de
  amigo; "Ninguém" não entra). Métricas do design: bares diferentes (padrão), jogos, bairros e
  conquistas desbloqueadas no mês. O mês é o de Brasília pela data do jogo e vira à 0h do dia
  1º; empate vai para quem chegou primeiro ao número, e com zero pelo nome. As setas comparam
  com a posição de uma semana atrás (no começo do mês, sem setas). `ranking.city` dá só a
  posição em bares no mês entre os torcedores com a mesma cidade no perfil ("3º em São
  Paulo"), sem lista: a lista da cidade e a aba Comunidades avisam "em breve". Sozinho (sem
  amigo visível), a tela é o 11e. Dados de teste: `apps/mobile/scripts/ranking.sql`, depois de
  `conquistas.sql`.
- **Chamado de amigo ("Chamar Marina", Rodada 24):** tabela `friend_call` (um por de, para e
  jogo; pending, going, not_now). Quem cria é `createFriendCall`
  (`packages/api/src/lib/friend-calls.ts`; só amigo aceito, jogo começado recusa pela mesma
  precondição de marcar presença, `attendableGame`, bar fora do ar é `NOT_FOUND`, repetido devolve `duplicate`), chamado
  pelo `ai.confirm`. `friends.respondCall` só pelo destinatário e uma vez (o `update` só
  pega linha `pending`, na mesma transação da presença: se ela falhar, nada muda): "Vou
  também" passa por `setAttendance` (código no Elite), "Agora não" não avisa quem chamou. Desfazer ou
  recusar amizade apaga os chamados da dupla. Em Avisos (`CallCard` em `app/avisos.tsx`),
  aba Amigos e Tudo: `calls` (pendente some quando o jogo começa) e `callsAccepted` ("Marina
  vai também"); o "Vou também" sai dos dois lados se a presença for desmarcada. A frase do design ("o Gabriel foi avisado") vai sem gênero. A 24g (notificação)
  não entra: não há push (WEB-416).
- **Bares pra você (08 Sugestões, Rodadas 22 e 23, WEB-425):** `app/bares-pra-voce.tsx`
  (tela cheia, pelo item do menu "Você" com o selo "N novos"), `app/por-que.tsx` (22c, folha),
  baralho e card em `components/suggestions.tsx`, frases em `lib/suggestions.ts`. **Uma rodada de
  até cinco bares por dia** (dono, 21/10/2026), gravada em `recommendation_round` na primeira
  leitura do dia com localização (`recommendations.today`); vira às 10:00 de Brasília
  (`lib/recommendations/round.ts`) e não muda no dia. O ranking tem 5 posições (`count`; o perfil
  do web segue com 3). Curti = favorito + `high_intent`; Passo = `dismiss`, 30 dias; Voltar =
  `recommendations.undo` (sem resfriamento). Avisar (`bar_game_alert`, bar + esporte ou time) e
  Lembrar (`game_reminder`) viram avisos em Avisos por `recommendations.notices`; sem push.
  "Vou assistir" do card manda `runId` para `attendance.set` (atribuição `attend`). O card é escuro
  nos dois temas, como no design. As frases só usam números do servidor (`facts`); a nota pública
  respeita o piso e o `app_config`. Os nomes dos amigos no "Combinou" (23d) ainda não existem
  (WEB-404): hoje vai a contagem de `readGoing`, com o ponto de encaixe comentado. Dados de teste:
  `apps/mobile/scripts/bares-pra-voce.sql`; estados de fim e vazio no DEV (`?estado=`).
- **Busca, avisos e filtros (seção 08 nova, Rodada 18 do design, telas 19a–19i):**
  - **Filtros (19d):** `app/filtros.tsx`, folha nativa aberta pelo botão redondo da fileira
    do Explorar. Mexe num rascunho e aplica no "Ver N bares" (a contagem é uma
    `pubs.search` com o rascunho, montada por `searchInput` de `lib/filters.ts`, a mesma do
    mapa: mesmo raio e o mesmo limite de 30, então o botão diz "Ver 30+"). "Quando" conta jogos por dia com `pubs.gameDays`. "Só
    bares com jogo publicado" (`gamesOnly`) esconde os bares sem jogo da lista e do mapa;
    nasce desligado, ao contrário do design. Abaixo de "No bar", chips por grupo
    (`CHIP_GROUPS`, WEB-455): Pagamento (Pix, Cartão, Vale-refeição, Couvert = "cobra
    couvert") e os itens novos do catálogo que a folha do design não desenha (Drinks,
    Opção vegetariana, Perto do metrô, Bicicletário); todos podem virar atalho. O antigo
    "Pix e cartão" (id 14) está em `HIDDEN_AMENITY_IDS` (`packages/api/src/lib/amenities.ts`):
    os bares o mantêm gravado, a busca e a escrita o aceitam, nenhuma tela o mostra; a
    migration 0075 deu Pix e Cartão a quem o tinha.
  - **Atalhos (19e):** `app/atalhos.tsx`. Até cinco filtros fixados no topo do mapa, mais o
    "Ao vivo", que é fixo e só aparece com jogo rolando. Guardados no aparelho (SecureStore);
    sem nada salvo, a fileira é Hoje, Telão, Área externa e o esporte principal. Contas em
    `lib/filters.ts`; o estado (`filters`, `shortcuts`, `focus`) mora em
    `components/explore-state.tsx`, montado em `app/_layout.tsx` para a folha alcançar.
    "Fim de semana" não entrou: a busca filtra um dia só.
  - **Busca (19a, 19b):** `app/busca.tsx`, pela lupa do Explorar. Contas em `lib/search.ts`
    sobre os bares num raio de 10 km; time e campeonato vão também ao servidor
    (`pubs.search` com `championship`). Recentes no aparelho. "Ver no mapa" põe `focus` no
    estado e o Explorar leva o mapa até o bairro. "Pedido mais específico?" abre a busca com
    IA (2h).
  - **Avisos (19c):** `app/avisos.tsx`, pelo sino. Montados do que já existe
    (`lib/notices.ts`): oferta liberada (código validado com oferta), jogo dos seus times
    perto (`pubs.search` com `teamIds`), conquista desbloqueada e, dos amigos
    (`friends.notices`), pedido recebido (Aceitar e Recusar no cartão), pedido aceito
    (30 dias) e o chamado de amigo (Rodada 24). No topo, "Seu jogo de hoje" com os amigos que vão (`todayGoing`). As abas
    são as do design, Tudo, Jogos e Amigos; conquista só em Tudo. Ranking e comunidades
    ainda não existem. "Lido" fica no aparelho. Não há notificação no celular.
- **Pins do mapa (Rodada 21, família Gota, 21a, escolhida pelo dono em 20/10/2026):**
  gota com a ponta reta da marca (`MapDrop` em `components/explore.tsx`): tinta com copo,
  vermelha com telão e halo na ponta se ao vivo, acid com estrela se Elite. Só o ao vivo
  ganha a pílula com o nome à direita; o bar tocado vira a gota maior com o balão de nome e
  "HOJE 21:30" e os outros não apagam. Grupo é um círculo com selo. No Apple Maps o `anchor` é
  ignorado: a ponta cai no bar pelo `centerOffset` que `dropBox` calcula (o `anchor` fica
  para o Android). Cada tipo de marcador (gota, gota com pílula, tocado) tem chave própria
  e nasce de novo ao trocar: mudar tamanho e `centerOffset` de um marcador vivo o deixava
  fora do lugar, e o `zIndex` só vale na criação. O halo do ao vivo passa da caixa por
  baixo para não roubar o toque da gota vizinha. As mesmas gotas valem nos recortes de mapa da busca e no mapa da
  página do bar (a gota grande com o balão, como a do bar tocado), e
  o raio de busca aparece como círculo tracejado no Explorar (`RadiusCircle`, também nos
  filtros e na busca, com miolo mais forte).
- **Mapa sem amontoado (Rodada 20, 20a–20d):** cada bar vira grupo (colados a menos de
  60 pt na tela, com selo de quantos ao vivo; tocar aproxima), ponto (o padrão: tinta,
  vermelho se ao vivo, acid se Elite) ou rótulo (só ao vivo e Elite, por prioridade, que
  caibam sem encostar e fora do cabeçalho e da folha). Zoom de bairro (mais de 4 km na
  tela): grupos, pontos e nomes de bairro, sem rótulo; de rua: sem grupo, até 3 rótulos;
  mais perto que 1,5 km: rótulo em todos que couberem. Tocar num bar o seleciona: os outros apagam para 45% e a folha
  troca para o card dele; tocar no mapa solta. Grupos pela `supercluster` (tocar abre no zoom em que o
  grupo se separa; o índice só é refeito quando os bares mudam, `indexCache`) e o resto em `lib/map-layers.ts`, sobre os cantos reais da tela
  (`getMapBoundaries`); debaixo do cabeçalho não sai rótulo. A camada nativa do MapLibre
  faria isso sozinha, mas sai do Expo Go: WEB-417, sem compromisso. A câmera abre no raio da pessoa, com a
  região da tela toda e o centro deslocado para a faixa livre: `mapPadding` e
  `edgePadding` no iOS abriam três vezes mais longe. A folha abre mais baixa (título e
  um card, com o seguinte sumindo num degradê antes da barra de abas, para dizer que a
  lista continua; com um bar só, sem degradê) e o botão de alfinete acima dela volta ao raio.
- **Abas do torcedor:** são a barra
  nativa do iOS 26 (`NativeTabs` em `app/(fan)/_layout.tsx`, UITabBar com liquid glass,
  distorção e arraste do sistema; roda no Expo Go): ícones em PNG gerados dos nossos
  (`assets/images/tabs/`, claro e escuro, `renderingMode="original"`; a aba selecionada
  troca para `*-on`, o ícone com o nome ao lado, e o rótulo nativo fica oculto), IA na aba de papel
  `search` (o círculo à direita) e desabilitada com `tabPress`. Bares (a antiga Favoritos) é "Seus bares"
  (17b, 17d e 17e da Rodada 17), `app/(fan)/favoritos.tsx`: "Já fui" (calendário e visitas
  por mês, `attendance.visits`, os códigos validados), "Salvos" (a semana dos jogos dos
  salvos) e "Bares" (só os salvos, por bairro, perto ou A–Z, com quantas vezes foi a cada um). Seus bares leva `disableAutomaticContentInsets` na aba: sem ele o
  iOS somava o topo seguro ao `paddingTop` e o título descia 48 pt. As imagens selecionadas das abas
  (`*-on`) têm no máximo ~72 pt: mais largas, a ponta aparece na lente da aba vizinha. A barra tem Bares onde o design tem Ranking (o dono trocou em 16/10/2026); o Ranking fica no menu "Você". "Você" é aba
  de verdade (a barra a mantém marcada): mostra a aba de onde se veio (Explorar ou
  Seus bares) com o menu de vidro por cima (`components/tab-bar.tsx`), e fechar volta
  para ela, e o estado que as duas dividem (filtros, folha,
  localização) fica em `components/explore-state.tsx`. Por baixo do menu vai uma foto
  dessa aba (`react-native-view-shot`, `useShotSource`), tirada meio segundo depois
  de cada mudança na tela em foco: a aba troca no nativo, sem esperar o JS (com a
  aba desabilitada e o JS fotografando no toque, a lente da barra ia, voltava e ia
  de novo no aparelho), e uma segunda cópia viva montava outro mapa, que recarregava.
  Ao sair da aba "Você", a pilha dela volta ao menu (`voce/_layout.tsx`). A barra leva
  `rejectStaleNavStateUpdates` (via `unstable_nativeProps`): sem ele, no aparelho, um
  pedido de seleção antigo do JS chegava depois do toque e a lente ia, voltava e ia
  de novo. O simulador não mostra esse pulo; confira no celular. O menu só destaca o item da tela aberta
  (`MENU_SCREENS`). Borda tracejada de um
  lado só não aparece no iOS: o picote do card é `react-native-svg`. O banco local nasce sem jogos: crie
  eventos para hoje nos bares de teste para ver os pinos, ou rode
  `apps/mobile/scripts/jogos-hoje.sql` (oito jogos de hoje nos bares de teste; o simulador
  precisa da localização na Vila Madalena) ou
  `apps/mobile/scripts/bar-do-ze.sql`, que monta o "Bar do Zé" completo da tela 2g (jogo ao
  vivo, próximos jogos, oferta, nota, 34 presenças, todas as características). Publicar no Android vai pedir
  chave do Maps SDK for Android em `app.json`.
- **Tema escuro:** o design só desenha conta, onboarding e avulsas no claro; no escuro valem
  as mesmas formas com tinta e papel trocados e o acid no lugar do vermelho. **Uma tabela de
  cores só**, `PALETTE` em `components/theme.tsx` (claro e escuro), lida de dois jeitos:
  `usePalette()`, que lê o `PaletteProvider` montado em `app/_layout` (cor calculada em JS:
  `palette.dark ? … : …`, `interpolateColor`, gradiente, tom do `Glass`; é a forma que vale
  no Android), e as constantes de `components/ui.tsx` (`FG`, `BG`, `SUB`, `HOT`, `CARD`,
  `LINE`, `DROP`, `EDGE`, `SPARK`…), que saem da mesma tabela como `DynamicColorIOS`: trocam
  sozinhas e servem no `StyleSheet` de módulo e no SVG, sem hook. Cor nova que mais de uma
  peça usa entra na tabela; `themed(claro, escuro)` fica para um valor avulso de um lugar
  só. Peça não recebe a paleta por prop: chama `usePalette()`. Trocar uma cor de uma peça
  é prop dela (`Card fill`, `shadow`); um trecho com outra paleta (o ingresso claro sobre a
  tela escura) vai dentro de `<PaletteProvider value={…}>`, que vale para tudo dentro dele.
  A IA (`components/ai/theme.ts`) e a medalha (`useMedalPalette`) estendem a tabela com as
  cores só delas. Texto sem `color` sai preto: passe `FG`. `INK`/`PAPER` são as cores
  fixas (texto e ícone sobre acid ficam `INK`, com `accent={LIVE}`). No Android as
  constantes dinâmicas ficam no claro.
- **Fonte grande do iOS:** o `Text` de `components/ui.tsx` acompanha o "Texto maior" até
  `MAX_FONT_SCALE` (1,35×, o maior tamanho fora dos de acessibilidade); acima disso,
  chips, botões e cards de altura fixa cortavam o rótulo (nos de acessibilidade a letra
  chega a 3,1×). Já usam: filtros, página do bar e as peças de `ui`, `card` e `explore`;
  o resto ainda importa o `Text` do `react-native`. Um `maxFontSizeMultiplier` próprio vence.
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
  (`components/dev-tab.tsx`) abre `app/dev.tsx` (a tela fica em `dev/navegador.tsx`, que a
  rota só carrega com `__DEV__`, para ficar fora do bundle de produção), a lista das telas pelo código do design
  (4b…4n, 2p, 11p…11x, 2d/2e; 8a/8b recarrega o app para ver a splash). Tocar num item abre a
  tela montada de novo; "Recarregar esta tela", ou segurar a aba, monta a atual outra vez
  (a entrada toca de novo). Tela nova entra na lista de `SECTIONS`
  (`dev/navegador.tsx`). O dublê da IA (`lib/ai-dubla.ts`) também só entra por `require`
  dentro do `__DEV__`.
- **Tocar e digitar no simulador:** `idb` (`brew install facebook/fb/idb-companion` e
  `pip install fb-idb`; `idb connect <udid>`, `idb ui tap --udid <udid> x y` em pontos,
  `idb ui text`). Com `recordVideo` dá para conferir a microinteração quadro a quadro.
- **Liquid glass:** o que o design faz em vidro (botão "Pular", card sobre mapa ou foto) usa
  `Glass` (`components/glass.tsx`), que é o `GlassView` do `expo-glass-effect` no iOS 26 e
  cor translúcida mais opaca onde o vidro do sistema não existe (Android, iOS anterior).
- **Busca com IA (Rodada 24, 24a–24e; WEB-400):** `app/busca-ia.tsx`, folha alta
  (`formSheet`, detent 1) aberta pela aba IA, por "Pedido mais específico?" da busca e pelo
  coach. Fala com `ai.converse` em eventos (passos, ferramentas, `bars` antes do `text`,
  proposta, `done`) e `ai.confirm`; a fonte está em `lib/ai-stream.ts`, os tipos em
  `lib/ai-events.ts` (`import type` dos de `packages/api/src/lib/ai/events.ts` e do router) e as contas puras em `lib/ai-chat.ts` (eventos → resposta,
  citações `[[n]]` em pedaços, versões do "refazer", recentes, chips). As peças são de
  `components/ai/` (uma por arquivo, nomes do AI Elements da 24f) e o quadro delas (t24c) é a
  tela DEV `app/ai-pecas.tsx` (corpo em `dev/ai-pecas.tsx`). O raciocínio fica aberto enquanto pensa e fecha no primeiro
  texto ou proposta; ferramenta pronta entra nele, a que espera "Confirmar" fica à vista.
  Citação tocada rola até o card e o faz piscar. Tirar um chip de "Entendi assim" refaz a
  busca sem IA: a `key` do chip é `<argumento de pubs.search>:<valor>` (mais
  `neighborhood:` e `origin:`), e `chipSearch` monta a busca com os que sobram. "Ver no
  mapa" enquadra no Explorar os bares da resposta e o ponto da busca (`mapFocus`, WEB-432;
  o `ChatBar` traz `latitude` e `longitude`), na faixa livre entre os chips e a folha
  (`frameRegion`, a mesma conta do raio), e os desenha como gotas junto com os da busca
  do Explorar (`answer` em `explore-state`, `answerPins`), sem repetir os que ela já tem;
  tocar numa delas abre a página do bar. Ficam até a pessoa mexer na busca (filtros,
  atalhos, "Ao vivo", "Ampliar"), pedir outro "Ver no mapa" ou tocar no "voltar ao raio";
  arrastar o mapa ou tocar num bar não os solta. Chips de local
  e dia só no campo do início (24a); "+" troca o contexto depois. Recentes (até 20, com a
  conversa inteira) ficam no aparelho, em `busca-ia-recentes.json` (`Paths.document`): o
  servidor não guarda texto. Depois do "Confirmar" (24e) a frase é do app (`confirmText`) e
  o cartão do código abre `app/codigo/[eventId]`. Parar só deixa de mostrar: o servidor
  termina a mensagem e desconta. Abrir um bar fecha a folha antes e leva `?ai=<run_id>`.
  Limite, IA fora do ar e busca refeita sem bares não estão no design: frase no lugar da
  resposta e "Abrir a busca". O microfone só abre o teclado (ditado do sistema). **Dublê**
  (só em desenvolvimento): `?dubla=1` troca o servidor por `lib/ai-dubla.ts`, e `estado=
  pensando|resposta|confirmar|feito` já manda a pergunta de cada tela (navegador DEV, seção
  "24"); `dubla=pior|limite|fora` para o pior caso, o limite e a IA fora do ar.
- **Primeiro acesso (4o):** `components/ai-coach.tsx`, por cima do Explorar uma vez só
  (`onside.coach-ia` no SecureStore), montado em `app/(fan)/_layout.tsx`. O furo e o anel
  cercam o botão da IA da barra nativa, medido no iPhone 16e (centro 52 pt da direita e de
  baixo, não o 344/784 do design). `?coach=1` mostra de novo (navegador DEV, 4o).
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
- **Texto grande do iOS (WEB-410):** `Text` e `TextInput` vêm de `@/components/ui`, nunca do
  `react-native` (`components/text.tsx`). O `Text` para de crescer em 1,35× (`MAX_FONT_SCALE`),
  e em 1,2× (`DISPLAY_FONT_SCALE`) quando a fonte é Anton; um `Text` dentro de outro herda o
  teto de fora. Rótulo de botão em pílula leva `DISPLAY_FONT_SCALE`, uma linha e
  `adjustsFontSizeToFit`. `Animated.Text` não passa pelo `Text`: dê o teto à mão. Confira no
  simulador com `xcrun simctl ui <udid> content_size accessibility-extra-extra-extra-large`.
- `Image` com só `StyleSheet.absoluteFill` sai no tamanho original da imagem neste app: passe
  `width` e `height` explícitos.

### Falha de rede (WEB-460)

Uma regra só para o painel e o app, em `packages/api/src/lib/transient-error.ts`: falha
passageira (sem rede, timeout, 5xx, 429, página de gateway que não é JSON) tenta de novo
com espera crescente (1 s, 2 s, 4 s); recusa da regra não repete. Mutation só repete
sozinha se estiver em `IDEMPOTENT_MUTATIONS` (mandar duas vezes dá no mesmo; o porquê das
que ficaram de fora está no comentário): mutation nova entra lá só depois de conferir no
servidor. O resto volta ao botão como "Tentar de novo", com o que a pessoa digitou. O botão
conta a fase (`actionPhase`): no painel, `BotaoAcao` (rótulos na mesma célula, largura
fixa); no app, `phaseLabel` com `busy` no `PillButton`. Bloco que não carregou é
`ErroBloco` (painel) ou `ErrorState` (app), nunca some. A faixa de "sem conexão" está no
`PainelShell` e no `_layout.tsx` do app (por cima de folhas e modais); ao reconectar, a tela
é relida. No app, "Simular sem rede" no navegador DEV liga e desliga o `onlineManager`.

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
