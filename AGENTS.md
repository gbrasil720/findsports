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
bun run build        # full build
bun run check-types  # TypeScript across monorepo
bun run check        # Biome lint + format (auto-fix)
bun run test         # full test suite from repo root (env fake: raiz .env.test via bunfig preload)
bun run test:e2e     # Playwright (apps/e2e): desktop + mobile, banco e portas próprios — docs/e2e.md

bun run db:generate  # generate migration files
bun run db:migrate   # run migrations (NODE_ENV=development localmente)
bun run db:journal   # relatório do journal; --upto <tag> / --all reconciliam
bun run db:push      # empurra o schema sem gerar migration (ver aviso abaixo)
bun run db:studio    # open Drizzle Studio
```

Turbo filter syntax: `turbo -F <package-name> <task>` — use the `name` field from that package's `package.json`.

## Architecture

Turborepo monorepo, `bun` package manager, Biome for lint/format (2 spaces, single quotes).

### Apps
- **`apps/web`** — fullstack app: TanStack Start (SSR) + TanStack Router (file-based) + React 19. Runs on `localhost:3001`.
- **`apps/e2e`** — Playwright E2E suite against `vite dev` and a disposable Postgres. See `docs/e2e.md`.

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

Schema files live in `packages/db/src/schema/`. Each domain gets its own file; all are re-exported from `schema/index.ts`. Currently: `auth.ts` (better-auth tables) and `waitlist.ts`.

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

### Environment variables

Split by runtime boundary:
- `packages/env/src/server.ts` — `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `LOCATIONIQ_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NODE_ENV`
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
- **Teste grátis nasce no cadastro, sem cartão** (`billing.onboarding_trial`). Quem
  contrata antes do fim herda a data: o checkout manda `trial_end` e o Stripe só cobra
  quando o teste acabaria (`packages/auth/src/stripe-checkout.ts`).
- **Nome e empresa da assinatura vêm do cadastro, não do checkout** (WEB-328): o
  checkout não pede nenhum dos dois. Antes de a sessão abrir, o cliente do Stripe
  recebe `user.name`, `bar.name` e, se ainda não tiver endereço, o do bar
  (`stripe-checkout.ts`); no `checkout.session.completed` os nomes são regravados
  (`stripe-sync.ts`). O checkout hospedado não mostra esses dados preenchidos: o
  endereço de cobrança é digitado na primeira compra. `/plan` avisa em nome de quem
  a assinatura sai. Cobrança sempre em BRL (Adaptive Pricing desligado na sessão).
- Chaves de `app_config`: `billing.checkout_enabled` (abre a contratação),
  `billing.onboarding_trial` (teste do cadastro) e `billing.founder_coupon` (cupom de
  fundador no checkout).

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

### E2E

Playwright em `apps/e2e`, job `e2e` no CI. **Antes de escrever ou rodar teste de
navegador, leia `docs/e2e.md`** — fixtures, dublês (outbox de e-mail, stub da
LocationIQ, R2, API e webhook do Stripe), por que o servidor roda sem cache e as
variáveis `E2E_PORT`/`E2E_DATABASE_URL` para rodar em paralelo entre worktrees.

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

Brazilian app connecting football fans to bars/pubs showing specific matches. Currently in waitlist phase — two roles: `fan` and `pub`.
