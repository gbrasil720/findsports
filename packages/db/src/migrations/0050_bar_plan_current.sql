-- WEB-129: `bar.plan` passa a projetar o plano VIGENTE, não o contratado.
--
-- A projeção da 0018 copiava só `subscription.plan`. Um bar Elite em
-- `past_due`, ou com trial vencido, continuava na camada `elite` da busca,
-- nos destaques e com selo no perfil público.
--
-- A regra é a de `getCurrentPlan` (packages/api/src/lib/current-plan.ts):
-- `active`, ou `trialing` com período vigente. Fora disso o bar é tratado
-- como `starter`. `subscription.plan` não muda: continua guardando o plano
-- contratado, que é o que `/plan` e a cobrança leem.
--
-- `current_period_end` é `timestamp` sem fuso, lido pelo app como UTC. A
-- comparação usa `now() AT TIME ZONE 'UTC'` para não depender do fuso da
-- sessão. Argumentos nulos (bar sem assinatura num LEFT JOIN) caem em
-- `starter`.
CREATE OR REPLACE FUNCTION "subscription_current_plan"(
  "p_plan" "subscription_plan",
  "p_status" "subscription_status",
  "p_period_end" timestamp
) RETURNS "subscription_plan" AS $$
  SELECT CASE
    WHEN p_status = 'active' THEN p_plan
    WHEN p_status = 'trialing'
      AND p_period_end > (now() AT TIME ZONE 'UTC') THEN p_plan
    ELSE 'starter'::"subscription_plan"
  END;
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- Mesma trigger da 0018 (`subscription_bar_plan_sync`), que já dispara em
-- qualquer UPDATE de `subscription`: mudança de status rebaixa na hora.
--
-- O que a trigger não vê é o trial que vence sem ninguém escrever na linha.
-- Esse caso é da reconciliação diária (`reconcileBarPlans`, chamada pelo
-- `scheduled()` do Worker), que reaplica a mesma função.
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

  UPDATE "bar"
    SET "plan" = "subscription_current_plan"(
      NEW."plan", NEW."status", NEW."current_period_end"
    )
    WHERE "id" = NEW."bar_id"
      AND "plan" IS DISTINCT FROM "subscription_current_plan"(
        NEW."plan", NEW."status", NEW."current_period_end"
      );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Backfill: põe em dia quem já estava fora da regra.
UPDATE "bar" b
  SET "plan" = "subscription_current_plan"(
    s."plan", s."status", s."current_period_end"
  )
  FROM "subscription" s
  WHERE s."bar_id" = b."id"
    AND b."plan" IS DISTINCT FROM "subscription_current_plan"(
      s."plan", s."status", s."current_period_end"
    );
