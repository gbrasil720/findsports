-- Jogos de hoje nos bares de teste da Vila Madalena e Pinheiros, para o
-- Explorar ter pinos: dois ao vivo e o resto nas próximas horas. Só para o
-- banco local; os horários são relativos a agora, então rode de novo no dia
-- seguinte. Os jogos de dias anteriores ficam (somem do Explorar sozinhos).
--
--   docker exec -i findsports_dev psql -U findsports_dev -d findsports_dev \
--     -v ON_ERROR_STOP=1 < apps/mobile/scripts/jogos-hoje.sql
--
-- O simulador precisa estar perto (Vila Madalena) e com localização liberada:
--   xcrun simctl location booted set -23.5615,-46.6875
--   xcrun simctl privacy booted grant location host.exp.Exponent
with g(bar, sport, champ, txt, hours) as (values
  ('Bar do Zé',      'Futebol',  'Brasileirão',      'Corinthians × Palmeiras', -0.6),
  ('Copo Sujo',      'Futebol',  'Champions League', 'Real Madrid × Barcelona', -0.3),
  ('Casa 92',        'Futebol',  'Libertadores',     'Flamengo × River Plate',   1.0),
  ('Bar da Esquina', 'Basquete', 'NBB',              'Franca × Flamengo',        1.5),
  ('Boteco Sete',    'Basquete', 'NBA',              'Lakers × Celtics',         2.0),
  ('Rede Alta',      'Futebol',  'Premier League',   'Arsenal × Chelsea',        2.5),
  ('Bar do Largo',   'Futebol',  'Brasileirão',      'São Paulo × Santos',       3.5),
  ('Aspicuelta 40',  'Futebol',  'Copa do Brasil',   'Grêmio × Internacional',   4.0)
)
insert into event (id, bar_id, sport_id, championship, starts_at, participant_free_text, accepts_reservations)
select gen_random_uuid()::text, b.id, s.id, g.champ,
       (now() at time zone 'utc') + make_interval(mins => (g.hours * 60)::int),
       g.txt, false
from g join bar b on b.name = g.bar join sport s on s.name = g.sport;
