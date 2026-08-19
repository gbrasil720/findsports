-- ESC-09: corta o custo da busca por proximidade.
--
-- Medido no harness local (dataset grande: 100k bares, 500k eventos, raio de
-- 3 km em São Paulo devolvendo 6.100 bares):
--
--   antes:  24 ms de execução, 44.363 buffers
--   depois: 5,5 ms de execução, 1.355 buffers
--
-- Dois custos dominavam o plano, ambos repetidos uma vez por candidato do
-- raio (6.100 vezes) e somando 96% dos buffers:
--
--   1. `LEFT JOIN subscription` para descobrir o plano  -> 24.401 buffers
--   2. `MIN(starts_at)` do próximo jogo                 -> 18.304 buffers
--
-- (1) morre com esta migration: o plano passa a viver na própria linha do
-- bar, mantido por trigger a partir de `subscription`. (2) encolhe porque a
-- query passa a avaliar os planos em camadas — o plano é a primeira chave de
-- ordenação, então se os bares `elite` do raio já preenchem o LIMIT, os
-- planos `pro` e `starter` nunca são varridos.
--
-- Migration aditiva: nenhuma linha é removida e nenhuma coluna existente
-- muda de tipo. `subscription` continua sendo a fonte da verdade do plano;
-- `bar.plan` é projeção derivada dela.

ALTER TABLE "bar"
  ADD COLUMN IF NOT EXISTS "plan" "subscription_plan" DEFAULT 'starter' NOT NULL;
--> statement-breakpoint

-- Backfill. Bares sem assinatura ficam em 'starter', que é exatamente o que
-- o `COALESCE(s.plan, 'starter')` da query antiga produzia.
UPDATE "bar" b
  SET "plan" = s."plan"
  FROM "subscription" s
  WHERE s."bar_id" = b."id"
    AND b."plan" IS DISTINCT FROM s."plan";
--> statement-breakpoint

-- Mantém `bar.plan` colado em `subscription.plan`. Cobre troca de plano,
-- cancelamento (linha some -> volta para 'starter') e o caso raro de a
-- assinatura ser reapontada para outro bar.
CREATE OR REPLACE FUNCTION "bar_plan_sync"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE "bar" SET "plan" = 'starter'
      WHERE "id" = OLD."bar_id" AND "plan" IS DISTINCT FROM 'starter';
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."bar_id" IS DISTINCT FROM NEW."bar_id" THEN
    UPDATE "bar" SET "plan" = 'starter'
      WHERE "id" = OLD."bar_id" AND "plan" IS DISTINCT FROM 'starter';
  END IF;

  UPDATE "bar" SET "plan" = NEW."plan"
    WHERE "id" = NEW."bar_id" AND "plan" IS DISTINCT FROM NEW."plan";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "subscription_bar_plan_sync" ON "subscription";
--> statement-breakpoint

CREATE TRIGGER "subscription_bar_plan_sync"
  AFTER INSERT OR UPDATE OR DELETE ON "subscription"
  FOR EACH ROW EXECUTE FUNCTION "bar_plan_sync"();
--> statement-breakpoint

-- Um índice GiST por camada de plano. A camada `elite` tem ~5% das linhas,
-- então o bitmap scan dela devolve ~300 candidatos onde o índice global
-- devolvia 10.700.
CREATE INDEX IF NOT EXISTS "bar_geo_elite_idx"
  ON "bar" USING GIST ("geo") WHERE "is_active" AND "plan" = 'elite';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bar_geo_pro_idx"
  ON "bar" USING GIST ("geo") WHERE "is_active" AND "plan" = 'pro';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bar_geo_starter_idx"
  ON "bar" USING GIST ("geo") WHERE "is_active" AND "plan" = 'starter';
