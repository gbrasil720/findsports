-- Amigos da tela 11a do design para um torcedor: Marina e Rafael amigos,
-- pedido da Júlia, Lucas e Ana como sugestão (amigos da Marina e do Rafael),
-- Thiago para achar na busca. Marina marcou "Vou assistir aqui" no jogo mais
-- próximo do Bar do Zé (scripts/bar-do-ze.sql) e teve um código validado lá
-- no último jogo dele. Só para o banco local.
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
  ('am-thiago', 'Thiago Sá', 'am-thiago@onside.local', true, 'fan', true, 'thiagosa', 'TS-7705', 'São Paulo', 'SP');

insert into friendship (requester_id, addressee_id, via, created_at, accepted_at)
select r, a, 'search', at, accepted from (values
  ('am-marina', (select id from "user" where email = :'fan'), timestamptz '2026-09-10 20:00', timestamptz '2026-09-10 21:00'),
  ((select id from "user" where email = :'fan'), 'am-rafael', timestamptz '2026-10-02 20:00', timestamptz '2026-10-02 22:00'),
  ('am-julia', (select id from "user" where email = :'fan'), now() - interval '2 hours', null),
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
commit;
