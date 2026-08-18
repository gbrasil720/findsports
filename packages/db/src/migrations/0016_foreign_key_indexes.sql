-- ESC-12: chaves estrangeiras sem índice.
--
-- O Postgres não cria índice automático no lado que REFERENCIA. Sem ele,
-- apagar uma linha do lado referenciado obriga uma varredura sequencial da
-- tabela filha para resolver o ON DELETE — segurando lock durante a varredura.
--
-- As três abaixo estavam descobertas, e nenhuma constava da lista original do
-- relatório; apareceram só quando a auditoria passou a olhar as constraints em
-- vez de olhar as queries.
--
--   bar_commercial_event.source_event_id -> event          (ON DELETE SET NULL)
--   event_participants.team_id           -> team           (ON DELETE CASCADE)
--   user_preference_sports.sport_id      -> sport          (ON DELETE CASCADE)
--
-- Nos dois últimos a chave primária composta começa pela OUTRA coluna, então
-- não serve para busca por esta.
--
-- Migration puramente aditiva: nenhum registro é alterado ou removido.

CREATE INDEX IF NOT EXISTS "bar_commercial_event_sourceEventId_idx"
  ON "bar_commercial_event" ("source_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_participants_teamId_idx"
  ON "event_participants" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_preference_sports_sportId_idx"
  ON "user_preference_sports" ("sport_id");
