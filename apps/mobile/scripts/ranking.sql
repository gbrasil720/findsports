-- Ranking do mês (10d do design) para um torcedor: onze amigos com códigos
-- validados em outubro nos bares de `scripts/conquistas.sql` (rode antes; o
-- torcedor fica com 3 bares no mês), mais o Pedro, que escolheu "Ninguém" em
-- "Quem vê os bares que você validou" e por isso não aparece. Só para o banco
-- local.
--
--   docker exec -i findsports_dev psql -U <usuário> -d findsports_dev \
--     -v ON_ERROR_STOP=1 -v fan=<e-mail do torcedor> < apps/mobile/scripts/ranking.sql
--
-- Rodar de novo refaz tudo. Datas em UTC: 22h UTC = 19h em Brasília.
begin;
delete from event where id like 'rk-%';
delete from "user" where id like 'rk-%';

-- Um jogo de outubro em cada bar das conquistas.
insert into event (id, bar_id, sport_id, championship, starts_at, participant_free_text)
select 'rk-ev-' || n, 'c0c0c0c0-0000-4000-8000-00000000000' || n,
  (select id from sport where slug = 'futebol'), 'Teste', at, 'Jogo do ranking ' || n
from (values
  (1, timestamp '2026-10-02 22:00'), (2, timestamp '2026-10-06 22:00'),
  (3, timestamp '2026-10-11 22:00'), (4, timestamp '2026-10-16 22:00'),
  (5, timestamp '2026-10-19 22:00'), (6, timestamp '2026-10-21 22:00'),
  (7, timestamp '2026-10-23 22:00')
) as e(n, at);

create temp table rk (k text, name text, username text, bars int[], visibility text) on commit drop;
insert into rk values
  ('marina', 'Marina Costa', 'rk.marinac', '{1,2,3,4,5}', 'friends'),
  ('rafael', 'Rafael Lima', 'rk.rafael', '{1,2,7}', 'friends'),
  ('julia', 'Júlia Prado', 'rk.julia', '{3,6}', 'everyone'),
  ('caio', 'Caio Mendes', 'rk.caio', '{1,2}', 'friends'),
  ('bia', 'Bia Torres', 'rk.bia', '{4,5}', 'friends'),
  ('bruno', 'Bruno Vaz', 'rk.bruno', '{6}', 'friends'),
  ('sofia', 'Sofia Lemos', 'rk.sofia', '{1}', 'friends'),
  ('nina', 'Nina Ferraz', 'rk.nina', '{2}', 'friends'),
  ('lia', 'Lia Moraes', 'rk.lia', '{7}', 'friends'),
  ('otavio', 'Otávio Reis', 'rk.otavio', '{}', 'friends'),
  ('igor', 'Igor Campos', 'rk.igor', '{}', 'friends'),
  ('pedro', 'Pedro Okada', 'rk.pedro', '{1,2,3,4,5,6,7}', 'nobody');

insert into "user" (id, name, email, email_verified, role, onboarding_completed,
  username, search_city_name, search_city_uf, activity_visibility)
select 'rk-' || k, name, 'rk-' || k || '@onside.local', true, 'fan', true,
  username, 'São Paulo', 'SP', visibility
from rk;

insert into friendship (requester_id, addressee_id, via, created_at, accepted_at)
select 'rk-' || k, (select id from "user" where email = :'fan'), 'search',
  timestamptz '2026-09-01 20:00', timestamptz '2026-09-01 21:00'
from rk;

insert into reservation (id, event_id, user_id, party_size, status, created_at)
select 'rk-res-' || k || '-' || n, 'rk-ev-' || n, 'rk-' || k, 1, 'confirmed', timestamp '2026-09-30 12:00'
from rk, unnest(bars) as n;
insert into reservation_code (id, code, reservation_id, max_uses)
select 'rk-code-' || k || '-' || n, 'RK' || upper(left(md5(k || n), 6)), 'rk-res-' || k || '-' || n, 1
from rk, unnest(bars) as n;
insert into reservation_code_use (id, code_id, validated_by_user_id, used_at)
select gen_random_uuid()::text, 'rk-code-' || k || '-' || n, 'cq-dono-' || n,
  (select starts_at from event where id = 'rk-ev-' || n) + interval '20 minutes'
from rk, unnest(bars) as n;
commit;
