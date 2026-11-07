ALTER TABLE "event" ADD COLUMN "published_at" timestamp DEFAULT now();--> statement-breakpoint
-- Jogo que já existia estava publicado desde que foi criado: o limite do
-- Starter passa a contar por esta data e não pode mudar a conta de ninguém.
UPDATE "event" SET "published_at" = "created_at";
