-- "Bar do Zé" completo, igual à tela 2g do design ("Bar · página · v2"):
-- jogo ao vivo, próximos jogos, oferta, gasto médio, 142 avaliações (87%),
-- 34 presenças e todas as características. Só para o banco local.
--
--   docker exec -i findsports_dev psql -U <usuário> -d findsports_dev \
--     -v ON_ERROR_STOP=1 -v photo=http://<ip-do-mac>:3001/hero-bar.jpg < apps/mobile/scripts/bar-do-ze.sql
--
-- Pede o catálogo de times sincronizado (`db:catalog:sync`). Os horários são
-- relativos a agora: rode de novo para o jogo voltar a estar ao vivo.
begin;
delete from bar where id = 'b0b0b0b0-0000-4000-8000-000000000e01';
delete from "user" where id like 'ze-%';

insert into "user" (id, name, email, email_verified, role, onboarding_completed)
values ('ze-dono', 'Zé do Bar', 'ze-dono@onside.local', true, 'pub', true);

insert into bar (id, user_id, name, description, phone, address, neighborhood, city, uf,
  latitude, longitude, photo_url, is_active, plan, amenities, screen_count,
  rating_count, rating_positive, house_offer, average_spend_cents)
values ('b0b0b0b0-0000-4000-8000-000000000e01', 'ze-dono', 'Bar do Zé',
  'Boteco da Vila Madalena com telão e som do jogo.', '', 'Rua Aspicuelta, 214',
  'Vila Madalena', 'São Paulo', 'SP', -23.55680000, -46.68780000,
  :'photo', true, 'elite', '{1,2,3,4,5,6,7,12,13,14}', 6,
  142, 124, 'Chopp em dobro até o intervalo para quem reservar pela Onside.', 8000);

insert into subscription (id, bar_id, plan, status, current_period_end)
values (gen_random_uuid()::text, 'b0b0b0b0-0000-4000-8000-000000000e01', 'elite', 'trialing',
  now() + interval '120 days');

-- Horários em UTC (a coluna é sem fuso): Brasília = UTC - 3.
insert into event (id, bar_id, sport_id, championship, starts_at, participant_free_text, accepts_reservations) values
 ('ze-ev-live', 'b0b0b0b0-0000-4000-8000-000000000e01', (select id from sport where name = 'Futebol'), 'Brasileirão', (now() at time zone 'utc') - interval '40 minutes', null, false),
 ('ze-ev-nba',  'b0b0b0b0-0000-4000-8000-000000000e01', (select id from sport where name = 'Basquete'), 'NBA', date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '22 hours' + interval '3 hours', 'Lakers × Celtics', false),
 ('ze-ev-fla',  'b0b0b0b0-0000-4000-8000-000000000e01', (select id from sport where name = 'Futebol'), 'Brasileirão', date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day 16 hours' + interval '3 hours', null, true),
 ('ze-ev-f1',   'b0b0b0b0-0000-4000-8000-000000000e01', (select id from sport where name = 'Fórmula 1'), 'Fórmula 1', date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '2 days 14 hours' + interval '3 hours', 'McLaren no GP de São Paulo', false),
 ('ze-ev-copa', 'b0b0b0b0-0000-4000-8000-000000000e01', (select id from sport where name = 'Futebol'), 'Copa do Brasil', date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '4 days 21 hours 30 minutes' + interval '3 hours', null, true);

insert into event_participants (event_id, team_id, position) values
 ('ze-ev-live', (select id from team where name = 'Corinthians' and kind = 'team' limit 1), 0),
 ('ze-ev-live', (select id from team where name = 'Palmeiras' and kind = 'team' limit 1), 1),
 ('ze-ev-fla',  (select id from team where name = 'Flamengo' and kind = 'team' limit 1), 0),
 ('ze-ev-fla',  (select id from team where name = 'Fluminense' and kind = 'team' limit 1), 1),
 ('ze-ev-copa', (select id from team where name = 'Palmeiras' and kind = 'team' limit 1), 0),
 ('ze-ev-copa', (select id from team where name = 'Corinthians' and kind = 'team' limit 1), 1);

-- 34 torcedores no jogo ao vivo; os três últimos a marcar: Marina, Rafael, João.
insert into "user" (id, name, email, email_verified, role, onboarding_completed)
select 'ze-fan-' || n, 'Torcedor ' || n, 'ze-fan-' || n || '@onside.local', true, 'fan', true
from generate_series(1, 31) n;
insert into "user" (id, name, email, email_verified, role, onboarding_completed) values
 ('ze-fan-joao', 'João Pedro', 'ze-fan-joao@onside.local', true, 'fan', true),
 ('ze-fan-rafael', 'Rafael Lima', 'ze-fan-rafael@onside.local', true, 'fan', true),
 ('ze-fan-marina', 'Marina Costa', 'ze-fan-marina@onside.local', true, 'fan', true);
insert into attendance (user_id, event_id, created_at)
select 'ze-fan-' || n, 'ze-ev-live', now() - interval '3 hours' + n * interval '1 minute'
from generate_series(1, 31) n;
insert into attendance (user_id, event_id, created_at) values
 ('ze-fan-joao', 'ze-ev-live', now() - interval '3 minutes'),
 ('ze-fan-rafael', 'ze-ev-live', now() - interval '2 minutes'),
 ('ze-fan-marina', 'ze-ev-live', now() - interval '1 minute');
commit;
