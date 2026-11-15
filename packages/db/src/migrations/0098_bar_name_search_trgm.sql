-- WEB-539: busca com texto raro (time ou campeonato que quase nenhum bar
-- tem). O pré-filtro do texto também aceita bar pelo nome, e sem índice no
-- nome a camada starter lia todo bar do raio só para testar o nome (3.057
-- buffers num raio de 3 km do dataset de 100 mil bares). Com o trigram,
-- `texto_candidatos` (pub-search) acha esses bares direto: 1.727. Ver
-- `tiered.ts`.
--
-- A expressão e o `WHERE is_active` são os da consulta, letra por letra.
-- Com 100 mil bares o índice tem 3,2 MB e é criado em menos de um segundo;
-- produção tem ordens de grandeza menos, então o CREATE INDEX comum (dentro
-- da transação do migrate) não segura escrita em `bar` por tempo que importe.
--
-- Migration puramente aditiva: nenhum registro é alterado ou removido.

CREATE INDEX "bar_name_search_trgm_idx" ON "bar" USING gin (search_normalize("name") gin_trgm_ops) WHERE is_active;
