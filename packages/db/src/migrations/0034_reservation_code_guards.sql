-- Guardas de `reservation_code` que faltaram na 0033 (revisão do PR #93).
--
-- A 0033 garantia `used_count <= max_uses`, mas deixava três furos:
--
--   1. `used_count` era gravável. Zerar um código de 2 pessoas passava pelo
--      CHECK, e a trigger de uso voltava a contar do zero: 4 usos ativos.
--   2. `max_uses` não era conferido contra `reservation.party_size`.
--   3. Código aposentado continuava aceitando uso.
--
-- Os erros saem como `check_violation` (23514) com o nome da regra em
-- CONSTRAINT, para a API traduzir sem casar texto de mensagem.
--
-- Escrita vinda de outra trigger (`pg_trigger_depth() > 1`) é a via
-- legítima: é assim que a trigger de uso mexe em `used_count` e a trigger de
-- reserva mexe em `max_uses`.

CREATE OR REPLACE FUNCTION "reservation_code_guard"() RETURNS trigger AS $$
DECLARE
  party smallint;
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

    -- FOR SHARE segura a reserva até o fim da transação: um ajuste de
    -- `party_size` concorrente espera, em vez de passar entre a leitura e o
    -- insert do código.
    SELECT "party_size" INTO party
      FROM "reservation"
      WHERE "id" = NEW."reservation_id"
      FOR SHARE;

    IF party IS NOT NULL AND NEW."max_uses" <> party THEN
      RAISE EXCEPTION 'reservation_code.max_uses (%) difere de reservation.party_size (%)',
          NEW."max_uses", party
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'reservation_code_max_uses_matches_party_size';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW."used_count" IS DISTINCT FROM OLD."used_count" THEN
    RAISE EXCEPTION 'reservation_code.used_count só muda por reservation_code_use'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'reservation_code_used_count_derived';
  END IF;

  IF NEW."max_uses" IS DISTINCT FROM OLD."max_uses"
    OR NEW."reservation_id" IS DISTINCT FROM OLD."reservation_id" THEN
    RAISE EXCEPTION 'reservation_code.max_uses acompanha reservation.party_size e não é editado direto'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'reservation_code_max_uses_matches_party_size';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "reservation_code_guard_trigger"
  BEFORE INSERT OR UPDATE ON "reservation_code"
  FOR EACH ROW EXECUTE FUNCTION "reservation_code_guard"();--> statement-breakpoint

-- Mudou a quantidade de pessoas, o código ativo acompanha. Reduzir abaixo dos
-- usos já feitos esbarra em `reservation_code_used_count_bounds` e aborta a
-- alteração da reserva. Códigos aposentados guardam o valor da época.
CREATE OR REPLACE FUNCTION "reservation_party_size_sync"() RETURNS trigger AS $$
BEGIN
  IF NEW."party_size" IS DISTINCT FROM OLD."party_size" THEN
    UPDATE "reservation_code"
      SET "max_uses" = NEW."party_size",
          "updated_at" = now()
      WHERE "reservation_id" = NEW."id"
        AND "retired_at" IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "reservation_party_size_sync_trigger"
  AFTER UPDATE OF "party_size" ON "reservation"
  FOR EACH ROW EXECUTE FUNCTION "reservation_party_size_sync"();--> statement-breakpoint

-- Mesma função da 0033, agora recusando uso novo em código aposentado.
--
-- O `retired_at IS NULL` fica no WHERE do UPDATE, e não num SELECT antes: se
-- o código for aposentado enquanto a validação espera a trava da linha, o
-- Postgres reavalia o WHERE na versão nova e o uso é recusado.
CREATE OR REPLACE FUNCTION "reservation_code_use_sync"() RETURNS trigger AS $$
DECLARE
  delta smallint := 0;
  target text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target := NEW."code_id";
    IF NEW."undone_at" IS NULL THEN
      delta := 1;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."code_id";
    IF OLD."undone_at" IS NULL THEN
      delta := -1;
    END IF;
  ELSE
    IF NEW."code_id" IS DISTINCT FROM OLD."code_id" THEN
      RAISE EXCEPTION 'reservation_code_use.code_id não pode ser alterado';
    END IF;
    target := NEW."code_id";
    IF OLD."undone_at" IS NULL AND NEW."undone_at" IS NOT NULL THEN
      delta := -1;
    ELSIF OLD."undone_at" IS NOT NULL AND NEW."undone_at" IS NULL THEN
      delta := 1;
    END IF;
  END IF;

  IF delta > 0 THEN
    UPDATE "reservation_code"
      SET "used_count" = "used_count" + delta,
          "updated_at" = now()
      WHERE "id" = target
        AND "retired_at" IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'código de reserva aposentado não aceita uso'
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'reservation_code_use_code_not_retired';
    END IF;
  ELSIF delta < 0 THEN
    -- Desfazer vale mesmo em código aposentado: corrige um uso registrado
    -- por engano antes da aposentadoria.
    UPDATE "reservation_code"
      SET "used_count" = "used_count" + delta,
          "updated_at" = now()
      WHERE "id" = target;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
