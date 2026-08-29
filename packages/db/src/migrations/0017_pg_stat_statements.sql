-- ESC-18: visibilidade de query lenta no banco.
--
-- A recomendação original era ligar `log_min_duration_statement`. O Neon não
-- permite esse parâmetro pelo papel da aplicação — e, de todo modo, a
-- extensão abaixo é melhor: em vez de raspar log, ela mantém estatística
-- agregada por forma de consulta (chamadas, tempo total, tempo médio), que é
-- o que responde "qual query está custando caro".
--
-- Migration puramente aditiva: nenhum registro é alterado ou removido.

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
