-- WEB-232, Fase 2, etapa A: a lista de espera sai do banco.
--
-- Nenhum código no ar lê ou escreve estes objetos desde a Fase 1 (#249), então
-- a migration pode rodar com o Worker anterior ainda servindo. As linhas de
-- `waitlist_entries` são dado pessoal (e-mail, telefone, nome de bar) e somem
-- junto com a tabela, sem cópia.

-- Criado à mão pela 0020 e ausente do schema do Drizzle: o `db:generate` não
-- gera este drop. Cairia com a tabela; fica explícito por ser o objeto do drift.
DROP INDEX IF EXISTS "waitlist_approved_email_idx";--> statement-breakpoint
-- Sem CASCADE: nada depende da tabela (não há FK nem view), e se um dia
-- depender a migration tem de falhar, não levar o dependente junto.
DROP TABLE "waitlist_entries";--> statement-breakpoint
DROP TYPE "public"."waitlist_role";--> statement-breakpoint
-- Contadores de `waitlist:email:*`, `waitlist:ip:*` e `waitlist:invite-resend*`.
DELETE FROM "rate_limit" WHERE "key" LIKE 'waitlist:%';--> statement-breakpoint
-- Chaves que saíram do registro na Fase 1. As de `billing.*` NÃO entram aqui:
-- o código anterior à WEB-233 lê `billing.checkout_enabled` (padrão: fechado),
-- e apagar a linha com ele no ar, ou num rollback para ele, fecharia a
-- contratação. Elas saem na etapa B.
DELETE FROM "app_config" WHERE "key" IN ('launch.waitlist_gate', 'waitlist.rate_limit');

-- `user.admitted_at` NÃO cai aqui, de propósito. O snapshot desta migration já
-- diz que a coluna não existe (é o schema novo), mas ela continua no banco.
--
-- O `db:generate` gerou `ALTER TABLE "user" DROP COLUMN "admitted_at"` e a
-- linha foi removida à mão: o CI migra produção antes de publicar o Worker, e o
-- código que está no ar até lá ainda tem `admittedAt` no schema do Drizzle. O
-- Drizzle lista todas as colunas do schema em todo SELECT de `user` (inclusive
-- os do better-auth), então derrubar a coluna com esse código servindo faz
-- login e leitura de sessão responderem 500 (`column "admitted_at" does not
-- exist`) até o deploy terminar — e um `wrangler rollback` não desfaz
-- migration. O preview tem o mesmo problema: um banco só, servindo o código do
-- último PR publicado.
--
-- A coluna cai na etapa B, numa migration escrita à mão (o `db:generate` não
-- vai propor o drop, porque o snapshot já não tem a coluna), depois que esta
-- PR estiver em produção.
