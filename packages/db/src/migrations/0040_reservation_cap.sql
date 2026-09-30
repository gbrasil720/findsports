-- WEB-152: teto de pessoas confirmadas por jogo. Aditiva: colunas nulas (sem
-- teto), nenhum bar ou jogo existente passa a recusar pedido por causa desta
-- migration. O valor efetivo é o do jogo, ou o padrão do bar.
ALTER TABLE "bar" ADD COLUMN "reservation_cap" smallint;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "reservation_cap" smallint;--> statement-breakpoint
ALTER TABLE "bar" ADD CONSTRAINT "bar_reservation_cap_range" CHECK ("bar"."reservation_cap" IS NULL OR "bar"."reservation_cap" BETWEEN 1 AND 5000);--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_reservation_cap_range" CHECK ("event"."reservation_cap" IS NULL OR "event"."reservation_cap" BETWEEN 1 AND 5000);