-- Características do bar.
--
-- `amenities` guarda os ids do vocabulário que vive em
-- `packages/api/src/lib/amenities.ts`. Array em vez de tabela de junção
-- porque o filtro da busca é `@>` (contém todos = AND) e o índice GIN entra
-- no mesmo BitmapAnd dos índices GiST de geo: os candidatos do raio são
-- cortados ANTES do LATERAL que calcula o próximo jogo — o lookup mais caro
-- da query.
--
-- Medido no harness de carga (100.000 bares, 500.000 jogos, raio de 3 km,
-- LIMIT 20, cache quente), filtrando por duas características que 4,3% dos
-- bares têm:
--
--   sem filtro                          2,1 ms /  1.789 buffers
--   amenities @> ARRAY[...] (este)      2,4 ms /  1.506 buffers
--   EXISTS x2 em tabela de junção      10,5 ms / 11.630 buffers
--   HAVING count(*) = N em junção      37,3 ms / 35.915 buffers
--
-- A diferença não é o custo do predicado, é onde ele cai: com o GIN, o plano
-- reduz 300 candidatos a 14 antes do LATERAL; com EXISTS, o LATERAL roda nos
-- 300 e só depois o filtro se aplica.
ALTER TABLE "bar"
  ADD COLUMN IF NOT EXISTS "amenities" integer[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint

-- Número de telas. Só exibição — não é filtro da busca.
ALTER TABLE "bar" ADD COLUMN IF NOT EXISTS "screen_count" smallint;
--> statement-breakpoint

-- Não é parcial em `is_active`: quem traz esse predicado é o índice de geo
-- do outro lado do BitmapAnd, que já é parcial.
CREATE INDEX IF NOT EXISTS "bar_amenities_gin_idx"
  ON "bar" USING gin ("amenities");
