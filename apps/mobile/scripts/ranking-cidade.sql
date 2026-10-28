-- Lista da cidade (27a do design): 1.300 torcedores de São Paulo com o
-- ranking global ligado e códigos validados nos jogos de outubro de
-- `scripts/ranking.sql` (rode `conquistas.sql` e `ranking.sql` antes). Liga
-- também o ranking global dos amigos do `ranking.sql`, menos o Pedro
-- ("Ninguém"). O seu torcedor fica como está: desligado, a aba Global mostra
-- o 27c, e o interruptor dela o põe na lista. Só para o banco local.
--
--   docker exec -i findsports_dev psql -U <usuário> -d findsports_dev \
--     -v ON_ERROR_STOP=1 < apps/mobile/scripts/ranking-cidade.sql
--
-- Rodar de novo refaz tudo.
begin;
delete from "user" where id like 'rc-%';

update "user" set ranking_global = true where id like 'rk-%';

insert into "user" (id, name, email, email_verified, role, onboarding_completed,
  username, search_city_name, search_city_uf, activity_visibility, ranking_global)
select 'rc-' || n,
  (array['Lucas','Fernanda','Thiago','Ana','Pedro','Bia','Caio','Júlia','Rafa',
    'Duda','Igor','Lia','Marcos','Paula','Gabi','Leo'])[1 + n % 16] || ' ' ||
  (array['Andrade','Rocha','Sá','Luiza','Okada','Torres','Mendes','Prado','Lima',
    'Alves','Paz','Moura','Reis','Campos','Ferraz','Vaz','Lemos'])[1 + n % 17],
  'rc-' || n || '@onside.local', true, 'fan', true, 'rc.torcedor' || n,
  'São Paulo', 'SP', 'friends', true
from generate_series(1, 1300) n;

-- O torcedor n foi aos n % 8 primeiros jogos (0 a 7 bares no mês).
insert into reservation (id, event_id, user_id, party_size, status, created_at)
select 'rc-res-' || n || '-' || e, 'rk-ev-' || e, 'rc-' || n, 1, 'confirmed',
  timestamp '2026-09-30 12:00'
from generate_series(1, 1300) n, generate_series(1, 7) e
where e <= n % 8;
insert into reservation_code (id, code, reservation_id, max_uses)
select 'rc-code-' || n || '-' || e, 'RC' || upper(left(md5(n || '-' || e), 8)),
  'rc-res-' || n || '-' || e, 1
from generate_series(1, 1300) n, generate_series(1, 7) e
where e <= n % 8;
insert into reservation_code_use (id, code_id, validated_by_user_id, used_at)
select gen_random_uuid()::text, 'rc-code-' || n || '-' || e, 'cq-dono-' || e,
  (select starts_at from event where id = 'rk-ev-' || e) + interval '20 minutes'
from generate_series(1, 1300) n, generate_series(1, 7) e
where e <= n % 8;
commit;
