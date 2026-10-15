CREATE TYPE "public"."team_kind" AS ENUM('team', 'athlete');--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "kind" "team_kind" DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "catalog_key" text;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "relevance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_catalog_key_unique" UNIQUE("catalog_key");--> statement-breakpoint
-- Os times que já existem são a lista escolhida à mão: seguem aparecendo sem busca.
UPDATE "team" SET "featured" = true;--> statement-breakpoint
UPDATE "team" SET "kind" = 'athlete' WHERE "sport_id" IN (SELECT "id" FROM "sport" WHERE "slug" = 'mma-ufc');--> statement-breakpoint
-- Até o primeiro `db:catalog:sync`, a busca acha pelo nome sem acento.
UPDATE "team" SET "search_text" = lower(translate("name", 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'));
