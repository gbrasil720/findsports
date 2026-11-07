-- Busca com texto raro (time ou campeonato que quase nenhum bar do raio tem):
-- sem índice, a busca ia bar a bar no raio procurando o jogo, 57 ms no
-- dataset de 100 mil bares. Com o trigram, `texto_jogos` (pub-search) acha
-- primeiro os jogos que casam. Medido em 29/10/2026: ver `tiered.ts`.
--
-- `fastupdate=false`: cada gravação de jogo paga o índice na hora
-- (+0,08 ms em média) em vez de uma fila que, ao esvaziar, segurava uma
-- gravação por até 16 ms.
--
-- JIT desligado no banco: o Postgres compila a consulta quando o custo
-- estimado passa de `jit_above_cost`, e a busca com texto passava: 121 ms de
-- compilação para uma consulta de 8 ms. Consulta curta de aplicativo não
-- ganha nada com JIT. Vale para conexões novas; o dono do banco é o mesmo
-- papel que migra e que o Hyperdrive usa (`neondb_owner`).
--
-- Migration puramente aditiva: nenhum registro é alterado ou removido.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET jit = off', current_database());
END $$;
--> statement-breakpoint
CREATE INDEX "event_search_text_trgm_idx" ON "event" USING gin (search_normalize(coalesce("championship", '') || ' ' || coalesce("participant_free_text", '')) gin_trgm_ops) WITH (fastupdate=false) WHERE published_at IS NOT NULL;
