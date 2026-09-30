-- WEB-67: a busca do /dashboard compara texto sem acento e sem caixa, para
-- que `gremio` e `Grêmio` devolvam o mesmo.
--
-- `unaccent()` é STABLE (depende do dicionário resolvido pelo search_path),
-- então não entra em índice de expressão. A função abaixo fixa dicionário e
-- schema e se declara IMMUTABLE — o padrão documentado para indexar
-- `unaccent`. Índice (pg_trgm) fica para quando a medição pedir.
--
-- Migration puramente aditiva: nenhum registro é alterado ou removido.

CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION search_normalize(text) RETURNS text
	LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
	AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, $1)) $$;
