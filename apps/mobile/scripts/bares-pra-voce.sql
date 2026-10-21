-- "Bares pra você" (23a–23k) com dados: o torcedor `fan` (e-mail) com
-- futebol e Corinthians no perfil, raio de 5 km, o Bar do Zé salvo, dois
-- jogos abertos do Casa 92 nesta semana, e jogos nos bares de teste da Vila
-- Madalena e Pinheiros: hoje 21:30 no Casa 92, sábado no Copo Sujo, e o
-- Boteco Sete só com jogos passados (futebol e F1, o "Costuma passar").
-- Apaga a rodada de hoje do torcedor, para ela nascer de novo. Só para o
-- banco local.
--
--   docker exec -i findsports_dev psql -U findsports_dev -d findsports_dev_<sufixo> \
--     -v ON_ERROR_STOP=1 -v fan=<e-mail> < apps/mobile/scripts/bares-pra-voce.sql
--
-- O simulador precisa estar na Vila Madalena:
--   xcrun simctl location <udid> set -23.5568,-46.6916
begin;
select id as fan_id from "user" where email = :'fan' \gset

update "user"
set email_verified = true, onboarding_completed = true, role = 'fan',
    search_radius_km = 5
where id = :'fan_id';

delete from user_preference_sports where user_id = :'fan_id';
insert into user_preference_sports (user_id, sport_id)
select :'fan_id', id from sport where slug = 'futebol';

delete from user_favorite_teams where user_id = :'fan_id';
insert into user_favorite_teams (user_id, team_id, sport_id)
select :'fan_id', id, sport_id from team where name = 'Corinthians' order by relevance desc limit 1;

insert into user_favorite_bars (user_id, bar_id)
select :'fan_id', id from bar where name = 'Bar do Zé'
on conflict do nothing;

delete from recommendation_round where actor_user_id = :'fan_id';
delete from recommendation_event where actor_user_id = :'fan_id';
delete from event where championship like 'WEB-425 %';

-- Hora de Brasília → UTC sem fuso, como `event.starts_at`.
with g(bar, sport, champ, txt, starts) as (values
  ('Casa 92', 'futebol', 'WEB-425 Brasileirão', 'Grêmio × Internacional',
    (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '21 hours 30 minutes')),
  ('Copo Sujo', 'futebol', 'WEB-425 Brasileirão', 'Palmeiras × São Paulo',
    (date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '5 days 16 hours')),
  ('Boteco Sete', 'futebol', 'WEB-425 Passado', 'Santos × Ponte Preta',
    (now() at time zone 'America/Sao_Paulo' - interval '9 days')),
  ('Boteco Sete', 'formula-1', 'WEB-425 Passado', 'GP de Interlagos',
    (now() at time zone 'America/Sao_Paulo' - interval '20 days'))
)
insert into event (id, bar_id, sport_id, championship, participant_free_text, starts_at)
select gen_random_uuid()::text, b.id, s.id, g.champ, g.txt, (g.starts at time zone 'America/Sao_Paulo') at time zone 'UTC'
from g join bar b on b.name = g.bar join sport s on s.slug = g.sport;

-- Abriu o jogo do Casa 92 duas vezes nesta semana.
insert into bar_commercial_event (id, bar_id, actor_user_id, type, source_event_id, occurred_at, commercial_day)
select gen_random_uuid()::text, e.bar_id, :'fan_id', 'profile_view', e.id,
  now() - (n || ' days')::interval, (now() - (n || ' days')::interval)::date
from event e join bar b on b.id = e.bar_id, generate_series(1, 2) n
where b.name = 'Casa 92' and e.championship like 'WEB-425 %';
commit;
