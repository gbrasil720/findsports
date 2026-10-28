-- WEB-422/WEB-464: oferta da casa por jogo. Aditiva (expand): coluna nula e
-- booleano com padrão falso, então todo jogo existente herda a oferta do bar
-- e o código anterior, que não lê as colunas, segue igual. Os CHECKs são os
-- da oferta do bar (sem string vazia, até 140) e "sem oferta" sem texto.
ALTER TABLE "event" ADD COLUMN "house_offer" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "no_house_offer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_house_offer_length" CHECK ("event"."house_offer" IS NULL OR char_length("event"."house_offer") BETWEEN 1 AND 140);--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_no_house_offer_without_text" CHECK (NOT "event"."no_house_offer" OR "event"."house_offer" IS NULL);