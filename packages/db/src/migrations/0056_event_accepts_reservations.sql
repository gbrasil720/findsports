-- Reservas por jogo: o interruptor sai do bar e vai para cada jogo.
-- Expand: `bar.accepts_reservations` fica até o código anterior sair do ar.
ALTER TABLE "event" ADD COLUMN "accepts_reservations" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Escrita à mão: quem já recebia continua recebendo em todos os jogos que
-- tinha. Jogos encerrados também, para o histórico dizer o que valia.
UPDATE "event" SET "accepts_reservations" = true
FROM "bar"
WHERE "bar"."id" = "event"."bar_id" AND "bar"."accepts_reservations";
