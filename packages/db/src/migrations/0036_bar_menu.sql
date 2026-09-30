-- WEB-39: link do cardápio e gasto médio por pessoa, declarados pelo bar.
-- Aditiva: colunas nulas, nenhum bar existente viola os CHECKs. Quem pode
-- gravar (Pro/Elite vigente) e quando aparece no perfil é decidido na API; o
-- banco só garante http(s), ausência de string vazia e os limites de
-- `packages/db/src/bar-menu.ts`.
--
-- Reverter sem tocar em outras colunas:
--   ALTER TABLE "bar" DROP CONSTRAINT "bar_average_spend_cents_range";
--   ALTER TABLE "bar" DROP CONSTRAINT "bar_menu_url_valid";
--   ALTER TABLE "bar" DROP COLUMN "average_spend_cents";
--   ALTER TABLE "bar" DROP COLUMN "menu_url";
ALTER TABLE "bar" ADD COLUMN "menu_url" text;--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "average_spend_cents" integer;--> statement-breakpoint
ALTER TABLE "bar" ADD CONSTRAINT "bar_menu_url_valid" CHECK ("bar"."menu_url" IS NULL OR ("bar"."menu_url" ~ '^https?://' AND char_length("bar"."menu_url") <= 2048));--> statement-breakpoint
ALTER TABLE "bar" ADD CONSTRAINT "bar_average_spend_cents_range" CHECK ("bar"."average_spend_cents" IS NULL OR "bar"."average_spend_cents" BETWEEN 1 AND 100000);