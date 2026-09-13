-- WEB-120: oferta da casa. Texto curto e opcional do bar para quem chega pela
-- Onside. Aditiva: coluna nula, nenhum bar existente viola o CHECK. Quem pode
-- gravar (Elite vigente) e quando aparece no perfil é decidido na API; o
-- banco só garante que não existe string vazia nem texto acima do limite de
-- `packages/db/src/house-offer.ts`.
ALTER TABLE "bar" ADD COLUMN "house_offer" text;--> statement-breakpoint
ALTER TABLE "bar" ADD CONSTRAINT "bar_house_offer_length" CHECK ("bar"."house_offer" IS NULL OR char_length("bar"."house_offer") BETWEEN 1 AND 140);