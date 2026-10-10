-- WEB-232, Fase 2, etapa B: o que a 0054 deixou para depois.
--
-- Só pode rodar com a etapa A (0054) e a WEB-233 em produção: até lá o código
-- no ar listava `admitted_at` em todo SELECT de `user` e lia
-- `billing.checkout_enabled` de `app_config`. As duas já estão no ar desde
-- 10/10/2026.

-- Escrita à mão: o snapshot da 0054 já não tem a coluna, então o
-- `db:generate` não propõe este drop. IF EXISTS porque um banco local que
-- passou por `db:push` do schema novo já perdeu a coluna.
ALTER TABLE "user" DROP COLUMN IF EXISTS "admitted_at";--> statement-breakpoint
-- Chaves de cobrança que saíram do registro na WEB-233. Chave desconhecida já
-- era descartada na leitura; aqui a linha órfã sai do banco.
DELETE FROM "app_config" WHERE "key" LIKE 'billing.%';
