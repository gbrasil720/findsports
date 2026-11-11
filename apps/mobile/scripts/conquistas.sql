-- Conquistas da tela 2i do design para um torcedor: 7 bares com o código
-- validado em 4 bairros e 3 esportes, e 6 avaliações. Dá nível 4
-- (Frequentador, 5 de 8), Desbravador no Boteco Sete em 4/10, Rato de bar
-- 7/10, Cidadão 4/6, Poliesportivo 3/4 e Crítico 6/10. Só para o banco local.
--
--   docker exec -i findsports_dev psql -U <usuário> -d findsports_dev \
--     -v ON_ERROR_STOP=1 -v fan=<e-mail do torcedor> < apps/mobile/scripts/conquistas.sql
--
-- Rodar de novo refaz tudo. Datas em UTC (a coluna é sem fuso): 22h UTC = 19h.
begin;
delete from bar where id like 'c0c0c0c0-%';
delete from "user" where id like 'cq-%';

create temp table cq (n int, name text, neighborhood text, sport text, at timestamp, game text) on commit drop;
insert into cq values
 (1, 'Bar da Esquina', 'Vila Madalena', 'Futebol', '2026-09-12 22:00', 'Corinthians × Santos'),
 (2, 'Copo Sujo', 'Consolação', 'Futebol', '2026-09-14 22:00', 'Palmeiras × São Paulo'),
 (3, 'Bar do Largo', 'Pinheiros', 'Futebol', '2026-09-21 22:00', 'Flamengo × Vasco'),
 (4, 'Casa 92', 'Pinheiros', 'Basquete', '2026-09-28 23:30', 'Lakers × Warriors'),
 (5, 'Boteco Sete', 'Vila Madalena', 'Futebol', '2026-10-04 22:00', 'Grêmio × Internacional'),
 (6, 'Rede Alta', 'Moema', 'Vôlei', '2026-10-09 22:00', 'Brasil × Itália'),
 (7, 'Aspicuelta 40', 'Vila Madalena', 'Futebol', '2026-10-14 22:00', 'Corinthians × Palmeiras');

insert into "user" (id, name, email, email_verified, role, onboarding_completed)
select 'cq-dono-' || n, 'Dono ' || n, 'cq-dono-' || n || '@onside.local', true, 'pub', true from cq;

insert into bar (id, user_id, name, description, phone, address, neighborhood, city, uf,
  latitude, longitude, is_active, plan)
select 'c0c0c0c0-0000-4000-8000-00000000000' || n, 'cq-dono-' || n, name, '', '',
  'Rua de teste, ' || n, neighborhood, 'São Paulo', 'SP', -23.56 - n * 0.002, -46.68, true, 'elite'
from cq;

insert into event (id, bar_id, sport_id, championship, starts_at, participant_free_text)
select 'c0c0c0c0-0000-4000-8000-00000000010' || n, 'c0c0c0c0-0000-4000-8000-00000000000' || n,
  (select id from sport s where s.name = cq.sport), 'Teste', at, game
from cq;

insert into reservation (id, event_id, user_id, party_size, status, created_at)
select 'c0c0c0c0-0000-4000-8000-00000000020' || n, 'c0c0c0c0-0000-4000-8000-00000000010' || n,
  (select id from "user" where email = :'fan'), 1, 'confirmed', at - interval '1 day'
from cq;

insert into reservation_code (id, code, reservation_id, max_uses)
select 'c0c0c0c0-0000-4000-8000-00000000030' || n, 'CQTEST' || n,
  'c0c0c0c0-0000-4000-8000-00000000020' || n, 1
from cq;

insert into reservation_code_use (id, code_id, validated_by_user_id, used_at)
select gen_random_uuid()::text, 'c0c0c0c0-0000-4000-8000-00000000030' || n, 'cq-dono-' || n, at + interval '20 minutes'
from cq;

-- Seis avaliações, a primeira no dia seguinte ao primeiro jogo.
insert into bar_rating (id, bar_id, actor_user_id, event_id, would_return, created_at)
select gen_random_uuid()::text, 'c0c0c0c0-0000-4000-8000-00000000000' || n, (select id from "user" where email = :'fan'),
  'c0c0c0c0-0000-4000-8000-00000000010' || n, true,
  case n when 1 then timestamp '2026-09-13 15:00' else at + interval '1 day' end
from cq where n <= 6;
commit;
