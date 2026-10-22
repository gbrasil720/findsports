-- Amigos da tela 11a do design para um torcedor: Marina e Rafael amigos,
-- pedidos da Júlia e do Pedro, Lucas e Ana como sugestão (amigos da Marina e
-- do Rafael), Thiago para achar na busca. Marina marcou "Vou assistir aqui"
-- no jogo mais próximo do Bar do Zé (scripts/bar-do-ze.sql) e teve código
-- validado lá e em Casa 92 e Aspicuelta 40 (scripts/conquistas.sql, se o
-- torcedor também tiver ido: bares em comum). Marina chamou o torcedor para
-- esse jogo (chamado pendente em Avisos) e o torcedor chamou o Rafael, que
-- disse "Vou também" (Rodada 24). Só para o banco local.
--
--   docker exec -i findsports_dev psql -U <usuário> -d findsports_dev \
--     -v ON_ERROR_STOP=1 -v fan=<e-mail do torcedor> < apps/mobile/scripts/amigos.sql
--
-- Rodar de novo refaz tudo.
begin;
delete from "user" where id like 'am-%';

insert into "user" (id, name, email, email_verified, role, onboarding_completed,
  username, friend_code, search_city_name, search_city_uf)
values
  ('am-marina', 'Marina Costa', 'am-marina@onside.local', true, 'fan', true, 'marinac', 'MC-2210', 'São Paulo', 'SP'),
  ('am-rafael', 'Rafael Lima', 'am-rafael@onside.local', true, 'fan', true, 'rafael.lima', 'RL-3301', 'São Paulo', 'SP'),
  ('am-julia', 'Júlia Prado', 'am-julia@onside.local', true, 'fan', true, 'juliaprado', 'JP-4402', 'São Paulo', 'SP'),
  ('am-lucas', 'Lucas Andrade', 'am-lucas@onside.local', true, 'fan', true, 'lucasandrade', 'LA-5503', 'São Paulo', 'SP'),
  ('am-ana', 'Ana Luiza', 'am-ana@onside.local', true, 'fan', true, 'analuiza', 'AL-6604', 'Rio de Janeiro', 'RJ'),
  ('am-thiago', 'Thiago Sá', 'am-thiago@onside.local', true, 'fan', true, 'thiagosa', 'TS-7705', 'São Paulo', 'SP'),
  ('am-pedro', 'Pedro Okada', 'am-pedro@onside.local', true, 'fan', true, 'pedrookada', 'PO-8806', 'São Paulo', 'SP');

insert into friendship (requester_id, addressee_id, via, created_at, accepted_at)
select r, a, 'search', at, accepted from (values
  ('am-marina', (select id from "user" where email = :'fan'), timestamptz '2026-09-10 20:00', timestamptz '2026-09-10 21:00'),
  ((select id from "user" where email = :'fan'), 'am-rafael', timestamptz '2026-10-02 20:00', timestamptz '2026-10-02 22:00'),
  ('am-julia', (select id from "user" where email = :'fan'), now() - interval '2 hours', null),
  ('am-pedro', (select id from "user" where email = :'fan'), now() - interval '5 hours', null),
  ('am-lucas', 'am-marina', timestamptz '2026-08-01 20:00', timestamptz '2026-08-01 20:30'),
  ('am-ana', 'am-marina', timestamptz '2026-08-02 20:00', timestamptz '2026-08-02 20:30'),
  ('am-ana', 'am-rafael', timestamptz '2026-08-03 20:00', timestamptz '2026-08-03 20:30'),
  ('am-julia', 'am-marina', timestamptz '2026-08-04 20:00', timestamptz '2026-08-04 20:30')
) as f(r, a, at, accepted);

-- Marina vai ao próximo jogo do Bar do Zé.
insert into attendance (user_id, event_id)
select 'am-marina', e.id from event e
where e.bar_id = 'b0b0b0b0-0000-4000-8000-000000000e01' and e.starts_at > now() at time zone 'UTC'
order by e.starts_at limit 1;

-- Chamado de amigo: Marina chamou o torcedor; o Rafael aceitou o do torcedor.
insert into friend_call (id, from_user_id, to_user_id, event_id, bar_id, status, created_at, responded_at)
select 'am-call-' || f.k, f.de, f.para, e.id, e.bar_id, f.status, now() - f.ago, f.answered
from (select e.id, e.bar_id from event e
  where e.bar_id = 'b0b0b0b0-0000-4000-8000-000000000e01' and e.starts_at > now() at time zone 'UTC'
  order by e.starts_at limit 1) e,
(values
  ('marina', 'am-marina', (select id from "user" where email = :'fan'), 'pending', interval '20 minutes', null::timestamptz),
  ('rafael', (select id from "user" where email = :'fan'), 'am-rafael', 'going', interval '3 hours', now() - interval '1 hour')
) as f(k, de, para, status, ago, answered);
insert into attendance (user_id, event_id)
select 'am-rafael', event_id from friend_call where id = 'am-call-rafael';

-- E teve o código validado no último jogo que já passou lá.
insert into reservation (id, event_id, user_id, party_size, status, created_at)
select 'am-res-marina', e.id, 'am-marina', 1, 'confirmed', e.starts_at - interval '1 day'
from event e
where e.bar_id = 'b0b0b0b0-0000-4000-8000-000000000e01' and e.starts_at < now() at time zone 'UTC'
order by e.starts_at desc limit 1;
insert into reservation_code (id, code, reservation_id, max_uses)
select 'am-code-marina', 'AMTEST1', 'am-res-marina', 1 where exists (select 1 from reservation where id = 'am-res-marina');
insert into reservation_code_use (id, code_id, validated_by_user_id, used_at)
select gen_random_uuid()::text, 'am-code-marina',
  (select user_id from bar where id = 'b0b0b0b0-0000-4000-8000-000000000e01'), now()
where exists (select 1 from reservation_code where id = 'am-code-marina');

-- E nos jogos de Casa 92 e Aspicuelta 40 das conquistas, se existirem.
insert into reservation (id, event_id, user_id, party_size, status, created_at)
select 'am-res-marina-' || e.id, e.id, 'am-marina', 1, 'confirmed', e.starts_at - interval '1 day'
from event e join bar b on b.id = e.bar_id
where b.id like 'c0c0c0c0-%' and b.name in ('Casa 92', 'Aspicuelta 40');
insert into reservation_code (id, code, reservation_id, max_uses)
select 'am-code-' || r.event_id, 'AM' || upper(left(md5(r.event_id), 6)), r.id, 1
from reservation r where r.id like 'am-res-marina-%';
insert into reservation_code_use (id, code_id, validated_by_user_id, used_at)
select gen_random_uuid()::text, c.id, b.user_id, e.starts_at + interval '20 minutes'
from reservation_code c
join reservation r on r.id = c.reservation_id
join event e on e.id = r.event_id
join bar b on b.id = e.bar_id
where c.id like 'am-code-c0c0%';
commit;
