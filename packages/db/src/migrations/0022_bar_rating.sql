-- Avaliação de bar: "voltaria para ver jogo aqui?".
--
-- Binária e presa a UM jogo, não ao bar. Amarrar ao jogo é o que faz a nota
-- envelhecer sozinha — um bar que piorou acumula jogo ruim novo, em vez de
-- carregar para sempre uma média formada há dois anos.
--
-- A busca não faz agregação em tempo de consulta. `bar.rating_count` e
-- `bar.rating_positive` são contadores mantidos por trigger, e
-- `bar.rating_score` é coluna GERADA a partir deles. Diferente de `bar.plan`
-- (0018), aqui não existe caminho de dessincronia para o score: o Postgres o
-- recalcula sozinho a cada mudança dos contadores, porque a fórmula é
-- aritmética imutável.

CREATE TABLE IF NOT EXISTS "bar_rating" (
  "id" text PRIMARY KEY NOT NULL,
  "bar_id" text NOT NULL REFERENCES "bar"("id") ON DELETE CASCADE,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "event_id" text NOT NULL REFERENCES "event"("id") ON DELETE CASCADE,
  "would_return" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Uma avaliação por torcedor POR JOGO. Não por bar: quem volta ao mesmo bar
-- em outro jogo avalia de novo, e é assim que a nota acompanha o presente.
ALTER TABLE "bar_rating"
  ADD CONSTRAINT "bar_rating_actor_event_key"
  UNIQUE ("bar_id", "actor_user_id", "event_id");
--> statement-breakpoint

-- O painel do dono lista as avaliações do bar, da mais recente para a mais
-- antiga.
CREATE INDEX IF NOT EXISTS "bar_rating_barId_createdAt_idx"
  ON "bar_rating" ("bar_id", "created_at" DESC);
--> statement-breakpoint

-- "O que eu ainda não avaliei": a busca parte do torcedor.
CREATE INDEX IF NOT EXISTS "bar_rating_actor_idx"
  ON "bar_rating" ("actor_user_id", "event_id");
--> statement-breakpoint

ALTER TABLE "bar"
  ADD COLUMN IF NOT EXISTS "rating_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bar"
  ADD COLUMN IF NOT EXISTS "rating_positive" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- Limite inferior do intervalo de confiança de Wilson (z = 1,96), a chave de
-- ordenação do modo "melhor avaliados".
--
-- Média crua não serve: um bar com UMA avaliação positiva marca 1,0 e
-- passaria na frente de um com quarenta avaliações e 0,85. No estágio atual
-- do produto esse é o caso comum, não a exceção. O Wilson dá ~0,21 para a
-- única avaliação positiva e sobe conforme a amostra cresce, sem ninguém
-- precisar arbitrar.
--
-- Coluna GERADA, e não trigger: a fórmula é só aritmética e `sqrt`, ambas
-- imutáveis, então o Postgres a mantém sozinho. Trigger aqui só criaria uma
-- segunda cópia da fórmula para dessincronizar.
--
-- A mesma conta existe em TypeScript (`packages/api/src/lib/rating.ts`), e
-- as duas precisam concordar — é o que o teste de integração trava.
ALTER TABLE "bar"
  ADD COLUMN IF NOT EXISTS "rating_score" double precision
  GENERATED ALWAYS AS (
    CASE WHEN "rating_count" <= 0 THEN 0
    ELSE (
      (
        "rating_positive"::double precision / "rating_count"
        + (1.96 * 1.96) / (2 * "rating_count")
      )
      - 1.96 * sqrt(
          (
            ("rating_positive"::double precision / "rating_count")
            * (1 - "rating_positive"::double precision / "rating_count")
            + (1.96 * 1.96) / (4 * "rating_count")
          ) / "rating_count"
        )
    ) / (1 + (1.96 * 1.96) / "rating_count")
    END
  ) STORED;
--> statement-breakpoint

-- Mantém os contadores colados em `bar_rating`.
CREATE OR REPLACE FUNCTION "bar_rating_sync"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE "bar"
      SET "rating_count" = GREATEST("rating_count" - 1, 0),
          "rating_positive" = GREATEST(
            "rating_positive" - (CASE WHEN OLD."would_return" THEN 1 ELSE 0 END),
            0
          )
      WHERE "id" = OLD."bar_id";
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Trocar de ideia mexe só no numerador, e só quando o valor mudou. Bar
    -- reapontado é impossível (a chave única inclui o bar), então não há o
    -- caso de migrar contador entre bares.
    IF OLD."would_return" IS DISTINCT FROM NEW."would_return" THEN
      UPDATE "bar"
        SET "rating_positive" = GREATEST(
          "rating_positive"
            + (CASE WHEN NEW."would_return" THEN 1 ELSE -1 END),
          0
        )
        WHERE "id" = NEW."bar_id";
    END IF;
    RETURN NEW;
  END IF;

  UPDATE "bar"
    SET "rating_count" = "rating_count" + 1,
        "rating_positive" = "rating_positive"
          + (CASE WHEN NEW."would_return" THEN 1 ELSE 0 END)
    WHERE "id" = NEW."bar_id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "bar_rating_sync_trigger" ON "bar_rating";
--> statement-breakpoint
CREATE TRIGGER "bar_rating_sync_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "bar_rating"
  FOR EACH ROW EXECUTE FUNCTION "bar_rating_sync"();
--> statement-breakpoint

-- Ordenação do modo "melhor avaliados". O predicado é `rating_count > 0` e
-- não o piso público (3): assim subir o piso é editar uma constante em
-- TypeScript, sem migration.
CREATE INDEX IF NOT EXISTS "bar_rating_score_idx"
  ON "bar" ("rating_score" DESC, "id")
  WHERE "is_active" AND "rating_count" > 0;
