-- ESC-07 / ESC-12: índices que faltavam nas tabelas de analytics.
--
-- O índice existente em bar_commercial_event é (bar_id, occurred_at) e não
-- cobre `type`, que aparece em todo filtro do painel. Com o overview agora
-- resolvido numa única passagem por faixa de data, o par (bar_id, type,
-- occurred_at) é o acesso real.
--
-- user_favorite_bars só tinha a chave primária composta (user_id, bar_id):
-- buscar pelos favoritos de um bar isolado varria a tabela.
--
-- Migration puramente aditiva: nenhum registro é alterado ou removido.

CREATE INDEX IF NOT EXISTS "bar_commercial_event_barId_type_occurredAt_idx"
  ON "bar_commercial_event" ("bar_id", "type", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_favorite_bars_barId_idx"
  ON "user_favorite_bars" ("bar_id");
