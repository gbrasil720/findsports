-- ESC-11: contador de rate limit compartilhado entre instâncias.
--
-- O better-auth guardava o contador num Map em memória do processo. Em
-- serverless, cada instância tem o seu e ele some entre invocações, então o
-- limite não valia nada na prática. Esta tabela é o armazenamento que o
-- `storage: 'database'` do better-auth utiliza.
--
-- Migration puramente aditiva: nenhum registro é alterado ou removido.

CREATE TABLE IF NOT EXISTS "rate_limit" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "count" integer NOT NULL,
  "last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_key_unique" ON "rate_limit" ("key");
