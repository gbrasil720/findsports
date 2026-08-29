# @findsports_oficial/db

Drizzle ORM package for findsports.

## Local Database

### Start Postgres

```bash
docker compose up -d
```

This creates a `findsports_dev` database on `localhost:5432` (loopback only).

### Stop Postgres

```bash
docker compose down
```

### Stop and destroy data

```bash
docker compose down -v
```

### Push schema (development only)

```bash
bun run db:push
```

### Generate migrations

```bash
bun run db:generate
```

### Open Drizzle Studio

```bash
bun run db:studio
```

## Safety Rules

- **Never** run `TRUNCATE` or schema reset on the persistent dev database. Use `docker compose down -v` for a clean slate.
- **Never** connect to Neon from `development` or `test` environments. The resolver will reject remote hosts.
- **Always** set `NODE_ENV` before running DB commands.

## Environment

| Variable | Development | Production |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `DATABASE_URL` | Optional (defaults to localhost) | Required |
