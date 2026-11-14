-- WEB-401, segunda metade: o que só a reserva de mesa usava sai do banco.
--
-- SÓ ENTRA DEPOIS DO DEPLOY DA 0095. O código anterior à 0095 ainda lista
-- estas colunas nos SELECTs do Drizzle, e o CI migra antes de publicar: rodar
-- isto com ele no ar quebra toda leitura de `reservation`, `event` e `bar`.
--
-- O enum `reservation_status` fica com `pending` e `declined`: tirar valor de
-- enum no Postgres é recriar o tipo e reescrever a tabela, e nenhum código
-- grava ou lê esses dois.

-- A guarda da 0034 sem a regra `reservation_code_max_uses_matches_party_size`
-- (`party_size` sai abaixo). Fica a de `used_count` derivado dos usos.
CREATE OR REPLACE FUNCTION "reservation_code_guard"() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."used_count" <> 0 THEN
      RAISE EXCEPTION 'reservation_code.used_count é derivado dos usos e nasce zerado'
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'reservation_code_used_count_derived';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."used_count" IS DISTINCT FROM OLD."used_count" THEN
    RAISE EXCEPTION 'reservation_code.used_count só muda por reservation_code_use'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'reservation_code_used_count_derived';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

-- O gatilho que levava `party_size` para `max_uses` depende da coluna.
DROP TRIGGER IF EXISTS "reservation_party_size_sync_trigger" ON "reservation";--> statement-breakpoint
DROP FUNCTION IF EXISTS "reservation_party_size_sync"();--> statement-breakpoint

ALTER TABLE "reservation" DROP CONSTRAINT IF EXISTS "reservation_party_size_positive";--> statement-breakpoint
ALTER TABLE "reservation" DROP CONSTRAINT IF EXISTS "reservation_note_length";--> statement-breakpoint
ALTER TABLE "event" DROP CONSTRAINT IF EXISTS "event_reservation_cap_range";--> statement-breakpoint
ALTER TABLE "bar" DROP CONSTRAINT IF EXISTS "bar_reservation_cap_range";--> statement-breakpoint

ALTER TABLE "reservation" DROP COLUMN IF EXISTS "party_size";--> statement-breakpoint
ALTER TABLE "reservation" DROP COLUMN IF EXISTS "note";--> statement-breakpoint
ALTER TABLE "event" DROP COLUMN IF EXISTS "reservation_cap";--> statement-breakpoint
ALTER TABLE "event" DROP COLUMN IF EXISTS "accepts_reservations";--> statement-breakpoint
ALTER TABLE "bar" DROP COLUMN IF EXISTS "reservation_cap";--> statement-breakpoint

-- O id 10 era "Aceita reserva" e hoje é o filtro "Com oferta da casa", que
-- não se marca (`declaredAmenityIds`): quem marcou a reserva antes ainda o
-- tem gravado. A escrita já o descarta; aqui sai o que ficou.
UPDATE "bar" SET "amenities" = array_remove("amenities", 10)
  WHERE 10 = ANY("amenities");
