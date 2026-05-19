# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # install deps
bun run dev          # all apps
bun run dev:web      # web only
bun run build        # full build
bun run check-types  # TypeScript across monorepo
bun run check        # Biome lint + format (auto-fix)

bun run db:push      # push schema to DB (no migration files)
bun run db:generate  # generate migration files
bun run db:migrate   # run migrations
bun run db:studio    # open Drizzle Studio
```

Turbo filter syntax: `turbo -F <package-name> <task>` — use the `name` field from that package's `package.json`.

## Architecture

Turborepo monorepo, `bun` package manager, Biome for lint/format (tabs, double quotes).

### Apps
- **`apps/web`** — fullstack app: TanStack Start (SSR) + TanStack Router (file-based) + React 19. Runs on `localhost:3001`.

### Packages
| Package | Import | Purpose |
|---|---|---|
| `packages/api` | `@findsports_oficial/api` | tRPC router + context |
| `packages/auth` | `@findsports_oficial/auth` | better-auth config |
| `packages/db` | `@findsports_oficial/db` | Drizzle ORM + PostgreSQL schema |
| `packages/env` | `@findsports_oficial/env/server` or `/web` | type-safe env vars (t3-oss) |
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

IDs use `crypto.randomUUID()` as default. Prefer `db:push` in development, migration files for production.

### Environment variables

Split by runtime boundary:
- `packages/env/src/server.ts` — `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NODE_ENV`
- `packages/env/src/web.ts` — client-safe vars only

Import from the correct boundary or you'll expose server secrets to the browser.

### UI / Styling

Global styles and design tokens: `packages/ui/src/styles/globals.css`. Tailwind v4.

Add shared primitives (used across multiple apps):
```bash
npx shadcn@latest add <component> -c packages/ui
```

Add app-specific blocks: run shadcn CLI from `apps/web`.

Import shared components: `import { Button } from "@findsports_oficial/ui/components/button"`

### Routing

TanStack Router file-based routing — `routeTree.gen.ts` is auto-generated, never edit manually. Route context carries `trpc` (TRPCOptionsProxy) and `queryClient`.

## Product context

Brazilian app connecting football fans to bars/pubs showing specific matches. Currently in waitlist phase — two roles: `fan` and `pub`.
