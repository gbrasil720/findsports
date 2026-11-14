-- WEB-401, primeira metade: `reservation.party_size`, `reservation.note`,
-- `event.accepts_reservations`, `event.reservation_cap` e
-- `bar.reservation_cap` saíram do schema do Drizzle, mas continuam no banco
-- até a migration seguinte, que só entra depois deste deploy (o CI migra
-- antes de publicar, e o código anterior ainda lista essas colunas nos
-- SELECTs).
--
-- Enquanto isso, o código novo grava `reservation` sem `party_size`, que é
-- NOT NULL: o padrão 1 cobre (o código de quem vai é sempre de uma pessoa, e a
-- guarda `reservation_code_max_uses_matches_party_size` da 0034 continua
-- vendo 1 = 1). O código anterior manda o 1 explícito, então nada muda para
-- ele. As outras colunas já aceitam nulo ou têm padrão.
ALTER TABLE "reservation" ALTER COLUMN "party_size" SET DEFAULT 1;--> statement-breakpoint
-- `pending` saiu de uso: a marcação nasce em vigor.
ALTER TABLE "reservation" ALTER COLUMN "status" SET DEFAULT 'confirmed';
