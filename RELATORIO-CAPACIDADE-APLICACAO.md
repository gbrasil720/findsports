# Relatório de capacidade da aplicação

Data da medição: **18 de agosto de 2026**  
Escopo: **desenvolvimento local isolado; nenhuma carga enviada à produção**

## Resumo executivo

Não existe um número único e permanente de “máximo de usuários”. A capacidade
muda com o volume do banco, a mistura de rotas e o plano de infraestrutura.
Por isso este relatório separa o **maior patamar comprovado** do **primeiro
patamar reprovado** pelo SLO adotado: p95 menor que 300 ms e erros menores que
1%.

| Item | Maior volume/patamar comprovado | Primeiro limite observado |
|---|---:|---:|
| Contas | **1.100.000** | não há teto no código; storage/plano limita |
| Torcedores | **1.000.000** | não há teto no código; storage/plano limita |
| Bares | **100.000** | um bar por conta `pub`; storage/plano limita |
| Eventos esportivos | **500.000** | Starter: 5 por período; Pro/Elite: sem teto de produto |
| Sessões persistidas | **100.000** | sem teto no código; expiração e storage limitam |
| Favoritos | **2.000.000** | teoricamente torcedores × bares, com unicidade do par |
| Eventos comerciais | **1.003.732** | retenção/storage; 30 por fã/bar/minuto na ingestão |
| Waitlist | **3.039 inserts em uma rodada** | sem rate limit público hoje |
| Pessoas simultâneas, base inicial | **1.600 VUs dentro do SLO** | 1.800 VUs ultrapassaram o SLO |
| Pessoas simultâneas, base grande (manhã) | **350 VUs dentro do SLO** | 425 VUs ultrapassaram o SLO |
| Pessoas simultâneas, base grande (reteste após busca nova) | **425 VUs dentro do SLO** | 500 VUs ultrapassaram o SLO |

Esses números são **pisos verificados**, não máximos teóricos. O banco aceitou
todos os volumes acima e todas as rodadas tiveram 0% de erro. O limite de
concorrência apareceu primeiro como fila/latência, não como queda ou erro.

### Recomendação operacional

Para planejamento conservador no cenário grande, usar **350 pessoas ativas
simultâneas**. Depois da reescrita da busca, 350 VUs sustentaram ~257 req/s,
p95 global de 49,6 ms e p95 da busca de 58,2 ms. Há margem comprovada até
425 VUs (p95 da busca 96,5 ms). 500 já excederam 300 ms.

Sem plano pago em produção, **não usar 425 como capacidade oficial**. Esse
número é de um processo local com cache em memória. No Neon Free + Vercel
Hobby o teto operacional é menor — ver “Limites seguros sem plano pago”
e “Tendência: produção vs. números locais”. A tendência, frente aos
350/425 locais, é o limite de produção ser **menor**.

Na base inicial (12 mil contas, 2 mil bares e 10 mil eventos), 1.600 VUs
passaram com p95 global de 133,6 ms. Esse número não deve ser tratado como
capacidade de produção: o teste usou um processo local e banco local, enquanto
produção distribui funções e depende do compute contratado no Neon.

## O que foi testado

O fluxo de navegação simulou, com pausa humana de 0,5–1,5 s entre ações:

- busca completa de bares e próximos eventos;
- busca puramente geográfica;
- perfil de bar;
- catálogo de esportes;
- eventos Elite em destaque;
- landing page;
- sessão autenticada real do Better Auth.

Também foram executadas cargas exclusivamente de escrita:

- ingestão de evento comercial autenticado;
- cadastro público na waitlist com e-mails únicos;
- tentativas inválidas de login para validar rate limit.

### Datasets

| Dataset | Contas | Torcedores | Bares | Eventos | Favoritos | Eventos comerciais | Tamanho |
|---|---:|---:|---:|---:|---:|---:|---:|
| Inicial | 12.000 | 10.000 | 2.000 | 10.000 | 20.000 | 10.000 | 49 MiB |
| Intermediário | 120.000 | 100.000 | 20.000 | 100.000 | 200.000 | 100.000 | 304 MiB |
| Grande | 1.100.000 | 1.000.000 | 100.000 | 500.000 | 2.000.000 | 1.000.000 | 2,43 GiB |

### Concorrência de navegação

| Dataset | VUs | req/s | Erros | p95 global | p95 busca | Resultado |
|---|---:|---:|---:|---:|---:|---|
| Inicial | 1.000 | 732 | 0% | 34 ms | 38 ms | passou |
| Inicial | 1.400 | 1.018 | 0% | 55 ms | 64 ms | passou |
| Inicial | 1.600 | 1.144 | 0% | 134 ms | 152 ms | passou |
| Inicial | 1.800 | 1.233 | 0% | 330 ms | 368 ms | **reprovou SLO** |
| Inicial | 2.000 | 1.263 | 0% | 678 ms | 825 ms | **reprovou SLO** |
| Intermediário | 100 | 74 | 0% | 30 ms | 35 ms | passou |
| Grande | 100 | 73 | 0% | 59 ms | 66 ms | passou |
| Grande | 250 | 182 | 0% | 77 ms | 87 ms | passou |
| Grande | 350 | 248 | 0% | 113 ms | 138 ms | passou |
| Grande | 425 | 277 | 0% | 339 ms | 373 ms | **reprovou SLO** |
| Grande (reteste busca nova) | 250 | 184 | 0% | 44 ms | 52 ms | passou |
| Grande (reteste busca nova) | 350 | 257 | 0% | 50 ms | 58 ms | passou |
| Grande (reteste busca nova) | 425 | 308 | 0% | 81 ms | 97 ms | passou |
| Grande (reteste busca nova) | 500 | 329 | 0% | 385 ms | 435 ms | **reprovou SLO** |
| Grande (reteste busca nova) | 600 | 362 | 0% | 545 ms | 617 ms | **reprovou SLO** |

### Escritas

| Fluxo | VUs | req/s | Erros | p95 | Evidência de gravação |
|---|---:|---:|---:|---:|---|
| Evento comercial | 100 | 73,6 | 0% | 7,7 ms | 3.732 inserts reais em 3.790 tentativas somadas |
| Waitlist pública | 100 | 74,4 | 0% | 5,3 ms | 3.039 linhas novas |

O pequeno desvio na ingestão comercial é deduplicação intencional por
fã/bar/tipo/dia. O Better Auth respondeu `401` às três primeiras senhas
inválidas e `429` a partir da quarta, confirmando o limite compartilhado.

## Gargalos e riscos

### 1. Busca cresce com a densidade dentro do raio

No dataset grande, o raio de 3 km encontrou 6.100 bares. O plano de execução
usou corretamente o índice GiST, mas depois fez lookups indexados de assinatura
e eventos para cada bar próximo. O `EXPLAIN (ANALYZE, BUFFERS)` mediu 42,752 ms
só no banco; o caminho HTTP completo mediu ~66–138 ms nos patamares verdes.

É o gargalo prioritário. O próximo passo técnico é evitar calcular agenda e
plano para milhares de candidatos antes do `LIMIT 20`: manter uma projeção do
próximo evento/quantidade ativa por bar, ou uma estrutura de busca materializada
que permita reduzir candidatos antes dos `LATERAL`.

### 2. Waitlist aceita automação em massa

A rota pública gravou ~74 entradas/s com 100 VUs e não possui rate limit. Isso
é bom para latência e ruim para abuso, spam e crescimento de custo. Aplicar
limite compartilhado por IP + identidade normalizada e CAPTCHA progressivo.

### 3. Cache de catálogo é por instância

O cache atual reduz consultas dentro de uma instância, mas novas funções
serverless começam frias. Em pico distribuído, cada instância repete a carga.
Um Redis/KV compartilhado continua necessário principalmente para resultados
de busca e catálogos.

### 4. Log por request tem custo real

Uma primeira rodada acumulou mais de 11 MB de stdout num PTY e criou
backpressure suficiente para invalidar medições subsequentes. As rodadas válidas
foram repetidas com stdout drenado. Em produção, usar amostragem para sucessos,
manter 100% de erros/slow requests e controlar volume/custo do provedor de logs.

### 5. Infraestrutura de produção ainda não foi medida

O deploy fixa `iad1`, coerente com o Neon em US East. A Vercel documenta
autoescala de funções até 30 mil de concorrência em planos comuns, mas esse é
um limite da plataforma, não da aplicação. O Neon define conexões e memória por
Compute Unit; por exemplo, 0,25 CU tem 112 conexões (7 reservadas) e 1 CU tem
450. O projeto reduz esse risco com endpoint pooler, consultas normais por HTTP
e pool transacional de 2 conexões por instância.

- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Vercel concurrency scaling](https://vercel.com/docs/functions/concurrency-scaling)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)

Sem conhecer o plano e sem executar em um preview Vercel + branch Neon de
staging, não é tecnicamente correto converter o resultado local em “produção
suporta X”. Nenhuma chamada de carga foi feita ao Neon remoto ou à produção.

### 6. O bundle inicial do navegador ainda é grande

O build passou, mas o Vite avisou que o chunk principal tem 838,7 kB
minificado (259,9 kB gzip), acima do limiar de 500 kB. O k6 mede HTTP/API e
HTML, não executa JavaScript como um navegador; portanto tempo de download,
parse, hidratação, mapa e Web Vitals não estão incluídos nos números de VUs.
Fazer code splitting do shell principal e medir LCP/INP em staging continua
sendo gate de lançamento.

## Limites de produto versus limites técnicos

- **Contas e torcedores:** sem limite de produto no schema/API.
- **Bares:** exatamente um por usuário `pub` por causa de `bar.user_id UNIQUE`.
- **Eventos:** Starter aceita 5 por período de assinatura; Pro e Elite são
  ilimitados no produto. O limite técnico é banco/storage e custo da busca.
- **Favoritos:** um registro único por par torcedor/bar.
- **Eventos comerciais:** deduplicados por fã, bar, tipo, dia e evento-fonte;
  limite de 30 por fã/bar/minuto.
- **Waitlist:** única por e-mail, papel e cidade, mas sem limite de frequência.

## Como repetir com segurança

O harness recusa qualquer banco que não seja loopback +
`findsports_load_test`, e o k6 recusa qualquer URL HTTP que não seja local.

```bash
docker compose --profile load-test up -d db-load-test

NODE_ENV=test \
LOAD_TEST_DATABASE_URL=postgres://findsports_load_test:findsports_load_test_local@localhost:5433/findsports_load_test \
  bun --cwd packages/db run db:migrate

NODE_ENV=test \
LOAD_TEST_DATABASE_URL=postgres://findsports_load_test:findsports_load_test_local@localhost:5433/findsports_load_test \
  bun --cwd packages/db run db:seed:load-test -- \
  --fans 100000 --bars 20000 --eventsPerBar 5 \
  --sessions 20000 --favoritesPerFan 2 --analyticsPerBar 5

bun run dev:load-test

docker run --rm \
  -v "$PWD:/work" -w /work \
  -e BASE_URL=http://host.docker.internal:3101 \
  -e LOAD_EMAIL=load-fan@local.invalid \
  -e LOAD_PASSWORD='<senha da conta local>' \
  -e TARGET_VUS=100 \
  grafana/k6 run apps/web/scripts/load-test.k6.js
```

Resultados normalizados desta execução: [`specs/qa/load-test-results-2026-08-18.json`](specs/qa/load-test-results-2026-08-18.json).

## Próximos gates antes do lançamento

1. Criar um projeto Vercel de staging e uma branch Neon descartável com o mesmo
   compute/pooler planejado para produção.
2. Repetir 100, 250 e 350 VUs nesse ambiente; nunca na URL de produção.
3. Medir CPU/CU, conexões, `pg_stat_statements`, cold starts, custo e logs.
4. Implementar rate limit compartilhado na waitlist.
5. Reduzir os `LATERAL` da busca antes de aumentar aquisição paga.
6. Definir alertas: p95 > 200 ms, erro > 0,5%, conexões > 70% e compute > 70%.

Só depois desses gates deve existir um número oficial de capacidade de
produção. Até lá, o número defensável é o piso local verificado neste relatório.

## Como aumentar o limite de usuários simultâneos

O teto local no dataset grande caiu em **425 VUs** por fila/latência da busca,
não por erro, queda de processo ou esgotamento de conexões. Portanto o ganho
não vem de “mais servidor” isolado: vem de reduzir o trabalho por busca, de
não repetir esse trabalho em cada instância fria e, só então, de dimensionar
o compute do Neon para o que restar.

Três alavancas se somam. A ordem abaixo é a de retorno esperado.

### 1. Cortar o custo da busca — maior ganho por mudança

No dataset grande, um raio de 3 km devolveu 6.100 bares. O índice GiST
encontrou os candidatos rápido; o tempo foi gasto depois, calculando
`COUNT`/`MIN(starts_at)` e o próximo jogo via `LATERAL` para cada
candidato, antes do `LIMIT 20`. O `EXPLAIN` mediu 42,8 ms só no banco; o
caminho HTTP chegou a 138 ms em 350 VUs e 373 ms em 425 VUs.

O que fazer, em ordem:

1. **Projeção do próximo evento por bar.** Guardar em `bar` (ou numa tabela
   de busca) `next_event_at`, `next_event_id`, `active_event_count` e o
   plano vigente. Atualizar no insert/update/delete de evento e na mudança
   de assinatura. A busca espacial passa a filtrar
   `ST_DWithin AND next_event_at IS NOT NULL`, ordenar e limitar, e só
   então hidratar o jogo da página — `LATERAL` em 20 linhas, não em 6.100.
2. **Índice composto alinhado à ordenação.** Depois da projeção, um índice
   em `(plan_rank, next_event_at, geo)` (ou equivalente) deixa o Postgres
   parar cedo no `LIMIT`. Sem isso, a projeção reduz CPU mas ainda pode
   materializar milhares de distâncias.
3. **Pré-filtro espacial mais barato.** Se a densidade urbana continuar
   alta depois da projeção, considerar um grid (`h3` ou geohash de ~110 m)
   para reduzir candidatos antes do GiST. Só vale se o `EXPLAIN` ainda
   mostrar muitos hits dentro do raio.

Critério de pronto: no dataset grande, `EXPLAIN (ANALYZE, BUFFERS)` da
busca com raio 3 km em São Paulo deve cair de ~43 ms para a faixa de
poucos milissegundos, e o p95 HTTP de 350 VUs deve ficar claramente
abaixo de 100 ms no mesmo harness local. Sem esse número antes/depois,
não tratar a mudança como ganho.

### 2. Cache compartilhado — o que a infra serverless ainda não tem

O `TtlCache` atual vive na memória da instância. Em produção, cada função
fria recomeça vazia e a busca **não é cacheada**. Em pico distribuído, o
mesmo ponto geográfico vira N consultas iguais ao Neon.

1. Provisionar Upstash Redis / Vercel KV (`KV_REST_API_URL` +
   `KV_REST_API_TOKEN`).
2. Adaptador com a mesma interface de `TtlCache`, falha do Redis caindo
   para o banco, e trava `SET NX` para não transformar cache frio em
   rajada.
3. Cachear `pubs.search` e `pubs.searchByLocation` com chave
   `[lat.toFixed(3), lng.toFixed(3), radiusKm, sportId, championship, date]`.
   Três casas decimais ≈ 110 m; sem arredondar, cada usuário gera chave
   própria. TTL 60 s — a busca depende de `starts_at >= NOW()`.
4. Migrar também `getSports`, `getTeamsBySport` e `getEliteEvents` para o
   mesmo store, para o catálogo sobreviver a cold start.
5. Mover o rate limit do Better Auth de tabela Postgres para
   `secondary-storage` no Redis: tira uma escrita por tentativa de
   autenticação.

Nunca cachear dado derivado de sessão. A regra já está no topo de
`packages/api/src/lib/ttl-cache.ts`.

Ganho esperado: usuários no mesmo bairro, no mesmo minuto, deixam de
bater no Postgres. Isso aumenta o teto de VUs sem aumentar CU. Não
substitui o item 1 — cache de uma consulta cara continua caro no miss.

### 3. Dimensionar Neon e Vercel para o que sobrar

A Vercel escala funções até 30 mil de concorrência em Hobby/Pro; esse
número não é o teto da aplicação. O teto real é o compute do Neon e o
tempo de cada query.

| Alavanca | Efeito | Quando usar |
|---|---|---|
| Autoscaling Neon (ex.: 1–4 CU, depois 2–8 CU) | Mais CPU e `max_connections` (1 CU ≈ 419; 2 CU ≈ 839; 4 CU ≈ 1.678) | Depois de medir CU > 70% no gêmeo de staging |
| Desligar scale-to-zero no compute de produção | Elimina cold start de ~centenas de ms no primeiro request ocioso | Sempre em produção; manter ligado só em preview |
| Host `-pooler` (PgBouncer, modo transação) | Até 10 mil conexões de cliente; pool interno ≈ 90% de `max_connections` | Já é o desenho atual; confirmar no `DATABASE_URL` de produção |
| Read replica Neon só para busca/catálogo | Offload de leitura; o primary fica para auth, favorito, ingestão | Quando a busca otimizada ainda saturar o primary |
| Fluid Compute na Vercel | Menos cold start, mais concorrência por instância | Depois que o banco aguentar o burst; senão só antecipa o gargalo |
| CDN nas páginas públicas anônimas | Tira invocação de `/`, `/login`, `/signup` | Só com `Cache-Control: public` na ausência de cookie; autenticado fica `private, no-store` |

Aumentar CU **antes** de reescrever a busca compra margem, mas cada VU
continua pagando os 6.100 `LATERAL`. O custo sobe linear com o tráfego.
A projeção + cache muda a curva.

### 4. Proteções que não sobem o teto, mas impedem colapso

- Rate limit compartilhado por IP + e-mail normalizado na waitlist, com
  CAPTCHA progressivo. Hoje a rota pública gravou ~74 inserts/s sem
  freio.
- Amostragem de log de sucesso (1–10%); 100% de erro e de request lento.
  Uma rodada local já invalidou medições com 11 MB de stdout.
- Code splitting do chunk principal (838,7 kB / 259,9 kB gzip). Isso não
  muda o número de VUs do k6, mas muda LCP/INP do usuário real.
- Alertas: p95 > 200 ms, erro > 0,5%, conexões Neon > 70%, compute > 70%,
  `FUNCTION_THROTTLED` / 503 na Vercel.

### Ordem de execução e o que esperar

| Fase | Trabalho | Efeito esperado no teto |
|---|---|---|
| A | Projeção do próximo evento + índice alinhado | Maior salto no dataset grande; candidato a sair de ~350 VUs verdes para a casa dos 700–1.000 no harness local, se o `EXPLAIN` confirmar |
| B | Redis/KV na busca e nos catálogos | Estabiliza pico repetido e cold start; ganho grande em produção, menor no teste local de um processo só |
| C | Gêmeo Vercel + Neon com o mesmo CU de produção | Primeiro número oficial de capacidade remota |
| D | Autoscaling Neon e, se ainda faltar CPU, read replica | Margem residual depois de A+B |
| E | CDN pública, Fluid Compute, code splitting | Experiência e custo; pouco efeito no p95 da API |

Os intervalos da fase A são hipótese de trabalho, não capacidade
prometida. Só viram número depois de repetir 250/350/425/600 VUs no
mesmo harness local e, em seguida, no gêmeo remoto.

## Como medir o limite real sem quebrar produção

**Não apontar o k6 atual para a URL de produção.** O harness recusa de
propósito qualquer `BASE_URL` que não seja loopback. Além disso, a
Vercel só autoriza teste de carga volumétrico em plano **Enterprise**,
com aviso prévio; em Hobby/Pro o tráfego anômalo viola o fair use e o IP
é bloqueado. Mesmo no Enterprise, a orientação oficial é exercitar as
rotas dinâmicas e o banco — não a CDN.

O limite “de produção” que dá para defender é o do **mesmo stack**
(mesmo plano Vercel, mesma região `iad1`, mesmo CU/pooler Neon, mesmo
volume de dados), não o da URL que os usuários já usam.

Há três camadas. Só a terceira toca produção de verdade, e ela não é
carga destrutiva.

### Camada 1 — gêmeo de staging (obrigatória)

Replica produção sem risco para quem já está no ar.

1. Projeto Vercel de staging (ou Preview protegido) na região `iad1`.
2. Branch Neon descartável, **schema-and-data** a partir de produção se
   já houver dados reais; senão, popular com o seed de carga
   (`db:seed:load-test`) no mesmo volume-alvo. Compute e pooler
   idênticos ao de produção. Scale-to-zero desligado durante o teste.
3. Contas sintéticas (`load-fan@…`) que nunca existam em produção.
4. Variáveis: `DATABASE_URL` do pooler da branch; sem webhooks reais de
   pagamento; Posthog/Sentry amostrados ou desligados — o teste gera
   custo de observabilidade.
5. WAF: bypass só dos IPs do runner do k6, e só no hostname de staging.

Adaptar o k6 num script **separado** (`load-test.staging.k6.js`) que
aceita somente o hostname de staging/preview, nunca o de produção. Manter
o script local intacto como rede de segurança.

Rampa sugerida, uma de cada vez, com 2–3 min de aquecimento (cold start
e autoscaling do Neon):

```text
25 → 50 → 100 → 175 → 250 → 350 → 425 → 500
```

Em cada patamar, registrar:

- p95/p99 global e da busca;
- taxa de erro e códigos 429/503;
- CU, conexões e `pg_stat_statements` no Neon;
- duração, cold starts e `FUNCTION_THROTTLED` na Vercel;
- custo estimado do intervalo.

Abortar a rampa se qualquer um ocorrer: erro > 0,5%, p95 > 300 ms por
dois minutos, CU ou conexões > 80%, 503 da Vercel, ou custo acima do
teto combinado. O **primeiro patamar reprovado** é o limite do stack;
o patamar anterior é a capacidade oficial.

Carga de escrita (`waitlist-write`, `commercial-write`) só neste gêmeo,
nunca em produção. A waitlist pública e a ingestão comercial poluem dado
real e disparam custo.

### Camada 2 — canário contínuo em produção (seguro, não acha o teto)

Depois que o gêmeo tiver um número, produção recebe só um **termômetro**,
não uma rampa.

- 1 a 5 VUs, 24/7 ou a cada 5 min, da mesma região `iad1`.
- Somente leitura: `healthCheck`, landing, `pubs.search` e um perfil,
  com conta de canário dedicada.
- Cabeçalho `x-load-canary: 1` para filtrar em log e não misturar com
  usuário real.
- Mesmo SLO: p95 < 300 ms, erro < 1%. Alerta se o canário degradar
  antes do usuário reclamar.

Isso mede regressão e deriva (crescimento da base, cold start, CU). Não
substitui a rampa do gêmeo: 5 VUs não encontram o teto de 350.

### Camada 3 — produção de verdade, só com tráfego real e, se couber, Enterprise

Para saber o limite **com usuários reais**:

1. Lançar com o piso conservador deste relatório (**250 simultâneos** no
   cenário grande) e com os alertas da seção 4 ligados.
2. Observar RUM (LCP/INP) e o p95 do log estruturado
   (`packages/api/src/lib/observability.ts`). O k6 não executa JavaScript
   do cliente; o número de VUs locais não inclui hidratação nem o chunk
   de 259,9 kB gzip.
3. Subir aquisição só enquanto p95 < 200 ms e CU < 70%.
4. Se no futuro existir plano Enterprise e for necessário um teste
   volumétrico na URL pública: abrir ticket com a Vercel (início/fim,
   RPS estimado, hostname, região de origem, lista de IPs < 1.000),
   avisar o Neon se o CU for estourar, usar só o fluxo `browse`, e
   manter o mesmo critério de aborto da camada 1. Sem esse acordo, não
   fazer.

Testar o Neon diretamente (consulta de busca contra a branch, sem passar
pela Vercel) é o atalho que a própria Vercel recomenda para achar o
gargalo de banco. O gêmeo completo continua necessário para cold start,
pooler e custo de função.

### O que não fazer

- Não apontar `apps/web/scripts/load-test.k6.js` para produção: o script
  recusa, e com razão.
- Não rodar `waitlist-write` nem `commercial-write` em produção.
- Não disparar 0 → 400 VUs de uma vez. A Vercel escala em rajadas de
  até 1.000 execuções / 10 s; rampa brusca mede o burst da plataforma,
  não a aplicação.
- Não usar o banco de desenvolvimento (`findsports_dev`) nem o Neon de
  produção como alvo do seed de carga.
- Não declarar “produção aguenta X” com base só neste relatório local.

## Próximos passos concretos

Checklist em sequência. Cada item só avança com número antes e depois.

1. **Reescrever a busca** com projeção de próximo evento / quantidade
   ativa e índice alinhado à ordenação. Repetir o harness local em 250,
   350, 425 e 600 VUs no dataset grande.
2. **Provisionar Redis/KV** e cachear busca + catálogos, com chave
   geográfica arredondada e TTL de 60 s. Medir quantas `ST_DWithin`
   restam numa rajada de 20 buscas iguais (hoje: 20; alvo: 1).
3. **Rate limit + CAPTCHA** na waitlist pública.
4. **Amostragem de log** de sucesso; manter 100% de erro e lento.
5. **Levantar o gêmeo** Vercel staging + branch Neon com o mesmo CU e
   pooler de produção. Popular com o seed grande ou com cópia da branch.
6. **Rodar a rampa** 25 → 500 VUs no gêmeo, só `WORKLOAD=browse`.
   Publicar a tabela equivalente à deste relatório. O último patamar
   verde vira a capacidade oficial de produção.
7. **Ligar canário** de 1–5 VUs em produção (somente leitura) e os
   alertas de p95, erro, CU e conexões.
8. **Ajustar Neon** (autoscaling, scale-to-zero off, replica de leitura
   se ainda faltar CPU) com base no que o gêmeo mostrou — não antes.
9. **Code splitting** do shell e medição de LCP/INP no staging. Gate de
   lançamento separado do k6.
10. **Só então** tratar 250, 350 ou o novo piso medido no gêmeo como
    número de planejamento. Revisitar o teto a cada ordem de grandeza
    da base (10k → 100k → 1M bares no raio urbano) ou depois de mudar
    a query de busca.

Enquanto o passo 6 não existir, o número defensável do harness local
(dataset grande, busca nova) é **350 simultâneos** para planejar,
**425** como teto local verde e **500** como primeiro reprovado. Sem
plano pago em produção, ver a seção seguinte.

## Status da execução (18 de agosto de 2026)

Trabalho feito sob a regra **não sair do free-tier** da Neon e da Vercel.
Nenhuma rampa de k6 foi apontada para hostname remoto. Nenhuma escrita
foi feita na branch `production`. O `DATABASE_URL` de Production no
Vercel **não foi alterado**.

### Limites oficiais para usar agora

O único teto de concorrência **comprovado por rampa** continua sendo o
harness local. A reescrita da busca foi retestada no dataset grande
(2,43 GiB em Postgres local, nunca no Neon). Redis e rate limit da
waitlist entram em Preview/código; não estavam no processo único do k6.

| Superfície | Limite pronto para uso | Como foi medido |
|---|---|---|
| Pessoas simultâneas (planejamento, busca nova) | **350 VUs** | k6 local reteste, dataset grande, p95 busca 58 ms |
| Pessoas simultâneas (teto verde local) | **425 VUs** | k6 local reteste; era o primeiro falho da manhã |
| Primeiro patamar reprovado | **500 VUs** | k6 local reteste, p95 busca 435 ms |
| Base inicial (não usar como produção) | 1.600 VUs verde / 1.800 reprovado | k6 local, 2 mil bares |
| Waitlist pública | **3 / e-mail / 10 min** e **8 / IP / 10 min** | código + testes unitários; tabela `rate_limit` existe no staging |
| Cache de busca | 1 carga / 5 leituras iguais, TTL 60 s, célula ~110 m | Redis real: 1 `load` para 5 `get` |
| Busca no staging (3 bares) | **1,3 ms** de execução; índice `bar_geo_active_idx` | `EXPLAIN ANALYZE` na branch `staging` |
| Neon storage | **17 MB** usados / 512 MB | staging e production; projeto ~77 MB sintéticos |
| Neon compute | **~5,5 CU-h** usados / 100 CU-h (reset 01/09/2026) | `describe_project`; scale-to-zero ligado |
| Neon branches | 3 / 10 | `production`, `staging` (permanente), `development` (TTL 24 h) |
| Vercel Hobby | sem rampa; Preview recebe Redis | `findsports-web`; sem Redeploy de Production |
| Redis Upstash | Preview only; **expira em 21/08/2026** se não for reclamado | PING + cache compartilhado OK |

Enquanto o passo 6 da seção anterior (rampa no gêmeo com volume grande)
não existir, **não tratar a reescrita como um teto novo de VUs**. O
número defensável de planejamento continua **250 simultâneos**.

### O que já está no código

- **Busca:** `pubs.search` materializa o ranking (`MIN(starts_at)` +
  `LIMIT`) e só então calcula `COUNT`, detalhe do jogo e participantes.
  Mesmos filtros, mesma ordem, mesmo cursor. Campeonato continua casando
  pelo nome do bar na qualificação e só pelo campeonato no detalhe.
- **Cache:** `createSharedCache` usa Upstash/Vercel KV quando
  `KV_REST_*` ou `UPSTASH_REDIS_REST_*` existem; sem isso cai na memória
  da instância. Chave geográfica arredondada a 3 casas (~110 m), TTL 60 s.
- **Waitlist:** limite compartilhado no Postgres (`rate_limit`): 3
  tentativas / e-mail / 10 min e 8 / IP / 10 min. Sem CAPTCHA.
- **Log:** sucessos rápidos amostrados a 10%; erro e lento continuam 100%.

Testes unitários desta rodada: **21/21** (`search-cache`,
`shared-cache`, `waitlist-rate-limit`, `client-ip`/`context`,
`observability`).

### Infra que ficou no ar (free-tier)

| Recurso | Estado | Cuidado |
|---|---|---|
| Neon `production` (`br-flat-brook-aqnrh4wa`) | 3 bares, 1 evento, **0** conta `load-fan` | não tocar |
| Neon `staging` (`br-late-salad-aqh5diic`, endpoint `ep-old-dream-aqtj9l26`) | cópia permanente de production + conta sintética; 0,25 CU; scale-to-zero | ambiente de smoke |
| Neon `development` (`br-twilight-dew-aqkxlsm1`) | schema-only, **expira 19/08/2026 17:35 UTC** | não usar como gêmeo |
| Redis Upstash `probable-ghoul-160186` | PING OK; cache compartilhado OK | **reclamação até 21/08/2026**: https://upstash.com/start-redis/console/87a0d981-2b55-43ac-aa7c-02569ebe9186 |
| Vercel `findsports-web` | `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` em **Preview only** | `DATABASE_URL` segue Production+Preview (valor de produção intocado) |

O toast de Redeploy do Vercel **não foi clicado**. Preview só passa a
usar o Redis no próximo deploy de preview (push da branch), não num
redeploy de Production.

### Conta sintética (só na branch `staging`)

- e-mail: `load-fan@local.invalid`
- senha: `LoadFan-2026!`
- papel: `fan`, onboarding completo

Não existe em produção (confirmado por `SELECT` em
`br-flat-brook-aqnrh4wa`). A branch `development` também pode ter uma
cópia, mas some com o TTL de 24 h.

### Smoke executado nesta retomada

1. Redis REST: `PING` → `PONG`; `SET` + 5 `GET` iguais → hit.
2. `createSharedCache` apontado no Redis real: 5 leituras da mesma
   chave dispararam **1** carga.
3. Staging: 10 users / 3 bars / 1 event / 17 MB; tabela `rate_limit`
   presente; fã sintético `fan` presente.
4. Production: 0 fã sintético; 3 bars / 1 event / 17 MB.
5. `EXPLAIN ANALYZE` da busca reescrita no staging (SP, 3 km):
   `Index Scan` em `bar_geo_active_idx`, CTE `ranked` materializada,
   planning 48 ms (compute acordando), execution **1,277 ms**, 0
   linhas no raio — os 3 bares não estão em São Paulo.

Não houve k6 contra Vercel Hobby, nem seed grande no Neon, nem
alteração de `DATABASE_URL` de Production.

### O que ainda falta para um número oficial maior

1. Reclamar o Redis no link acima (senão some em 21/08) **ou**
   provisionar um Upstash permanente no Marketplace e trocar as duas
   env vars de Preview.
2. No próximo **preview deploy** (não Redeploy de Production), o cache
   compartilhado liga sozinho.
3. Se quiser Preview isolado do banco de produção: criar um
   `DATABASE_URL` **só Preview** apontando ao pooler do staging,
   **sem** desmarcar Production no valor atual. Isso não foi feito
   de propósito — um clique errado apontaria o site público para o
   staging.
4. ~~Medir o ganho da busca no harness local.~~ Feito na noite de
   18/08: ver seção “Reteste local da busca nova”.

## Reteste local da busca nova (18/08 à noite)

Mesmo dataset grande, mesmo SLO (p95 < 300 ms, erro < 1%), mesmo
harness isolado. Única mudança relevante: a busca materializa o ranking
e só hidrata 20 linhas. Cache em memória da instância única (sem Redis).

Resultados brutos: [`specs/qa/load-test-results-2026-08-18-rerun.json`](specs/qa/load-test-results-2026-08-18-rerun.json).

| VUs | req/s | Erros | p95 global | p95 busca | Antes (manhã) | Resultado |
|---:|---:|---:|---:|---:|---|---|
| 250 | 184 | 0% | 44 ms | 52 ms | 77 / 87 ms, passou | passou |
| 350 | 257 | 0% | 50 ms | 58 ms | 113 / 138 ms, passou | passou |
| 425 | 308 | 0% | 81 ms | 97 ms | 339 / 373 ms, **reprovou** | **passou** |
| 500 | 329 | 0% | 385 ms | 435 ms | não medido | **reprovou SLO** |
| 600 | 362 | 0% | 545 ms | 617 ms | não medido | **reprovou SLO** |

No banco, o mesmo raio de 3 km em SP ainda encontra **6.100 bares**. O
`EXPLAIN ANALYZE` da busca nova mediu **31,0 ms** (antes 42,8 ms). O
`MIN(starts_at)` continua rodando nos 6.100 candidatos; o ganho veio de
não calcular `COUNT`/detalhe/participantes em cada um. Por isso o salto
de VUs existe, mas não foi para a casa dos 700–1.000.

Todas as rodadas tiveram 0% de erro HTTP. O teto continua sendo fila,
não queda.

## Limites seguros sem plano pago

Estes números valem para **produção no ar** em Neon Free + Vercel Hobby,
com o produto funcionando normalmente. Não são o teto do algoritmo.

| Situação | Limite seguro de operação | Por quê |
|---|---|---|
| Produção hoje (3 bares, 17 MB) | **dezenas contínuas**; pico curto de ~100 | A query é barata. O que acaba primeiro é scale-to-zero, 100 CU-h/mês e ~4 h de CPU Fluid |
| Produção Free quando a base crescer até caber em 0,5 GB (~ordem de 20 mil bares) | **100 simultâneos** para planejar | Dataset intermediário local já era fácil; 0,5 GB impede o cenário de 100 mil bares |
| Harness local, 100 mil bares, busca nova | **350 planejar / 425 teto verde / 500 primeiro falho** | Medido nesta noite. Um processo, cache em memória |
| Preview com Redis (já ligado) | mesmo da linha de produção Free + cache nas células repetidas | Redis não está em Production. Sem ele, cada função fria refaz a busca |
| k6 na URL de produção | **não fazer** | Hobby/Pro: fair use. O script local recusa hostname remoto |

Regras práticas no free-tier, com o site no ar:

1. **Não desligar scale-to-zero** — o plano Free obriga. O primeiro
   visitante depois de idle paga centenas de ms de wake.
2. **Não popular o Neon de produção com seed de carga.** 2,43 GiB
   estoura 0,5 GB e pode encerrar o projeto.
3. **Não apontar k6 para `www.onside.sh`.** Queima as 4 h de Fluid e
   pode bloquear o IP.
4. Subir aquisição só enquanto o canário (1–5 VUs de leitura) e o p95
   do log ficarem abaixo de 200 ms e o Neon abaixo de ~70% de CU-h do
   mês.
5. O Redis permanente, quando reclamado, só aumenta o teto de
   **Preview** até alguém colar as mesmas vars em Production. Isso é
   deploy, não upgrade de plano.

Resumo: a busca nova **subiu o teto local de 350 para 425** e tirou o
antigo 425 da zona vermelha. Em produção sem pagar, o número que dá
para defender no mês ainda é conservador — **cerca de 100 simultâneos**
quando a base crescer no espaço do Free, e bem menos contínuos do que
isso se o compute ficar suspendendo ou as horas Fluid/CU acabarem.

## Tendência: produção vs. números locais

Em relação aos **350 / 425 do k6 local**, a tendência dos limites em
produção é serem **menores**.

O harness local é o caso otimista: um processo quente, Postgres na
mesma máquina, cache em memória visto por todos os VUs. Produção puxa
para baixo em quase tudo que importa para o usuário simultâneo:

| Fator | No k6 local | Em produção (Free / Hobby) | Efeito no teto |
|---|---|---|---|
| Processo | um Node quente o tempo todo | funções Vercel que esfriam | menor |
| Banco | Postgres dedicado no Docker | Neon 0,25–2 CU, 100 CU-h/mês, scale-to-zero obrigatório | menor |
| Cache | `TtlCache` na memória da única instância (hit ~0,5 ms) | Redis **não** está em Production; cada função fria refaz ~31 ms | menor |
| Rede | loopback | função `iad1` → pooler Neon | menor (soma ms em cada request) |
| Cliente | k6 não executa JS, mapa nem o chunk ~260 kB gzip | o usuário real paga LCP/INP | menor na experiência; o VU do k6 não inclui isso |
| Unidade de teto | VUs no intervalo do teste | também horas Fluid (~4 h/mês) e CU-h | um pico “verde” ainda pode estourar o mês |

Há uma exceção só no **dado de hoje**: produção tem 3 bares, não 100 mil.
A query em si é mais barata que no teste grande (~1,3 ms no staging).
Isso **não** sobe o teto operacional — scale-to-zero e as horas do Hobby
cortam antes da busca.

| Comparação | Tendência |
|---|---|
| Produção Free vs 350/425 locais | **Menor** |
| Produção hoje (3 bares) vs o gargalo da busca grande | A query aguenta mais; o **plano** aguenta menos |
| Produção paga (Neon sem suspender + Redis + Vercel Pro) vs local | Pode **ultrapassar** o local, porque escala função em paralelo — só depois de medir no gêmeo |

Para planejar o produto no ar, sem upgrade: tratar **100 simultâneos**
(e dezenas contínuas) como o número seguro. Os 425 são teto de
laboratório, não de `www.onside.sh`.

## Busca em camadas por plano (18/08, madrugada)

Terceira rodada de trabalho sobre a busca. A anterior tinha materializado o
ranking; esta atacou o que sobrou. Regra mantida: **não sair do free-tier, não
tocar em produção**. `DATABASE_URL` de Production intocado, nenhuma escrita na
branch `production`, nenhum k6 apontado para hostname remoto.

### O que o plano de execução mostrava

No dataset grande (2,49 GB, 100k bares, 500k eventos, raio de 3 km em São
Paulo devolvendo 6.100 bares), a busca gastava 24 ms e **44.363 buffers**.
Dois lookups por candidato do raio somavam 96% disso:

| Custo | Repetições | Buffers | Fatia |
|---|---:|---:|---:|
| `LEFT JOIN subscription` (só para ler o plano) | 6.100 | 24.401 | 55% |
| `MIN(starts_at)` do próximo jogo | 6.100 | 18.304 | 41% |

### As duas correções

**1. `bar.plan` como projeção.** Migration `0018_bar_plan_projection.sql`
acrescenta a coluna, faz backfill e instala a trigger
`subscription_bar_plan_sync`, que cobre troca de plano, cancelamento (a linha
some e o bar volta para `starter`) e reaponte de assinatura. `subscription`
continua sendo a fonte da verdade. Custo da trigger em carga em massa: **+2,7 s
em 100 mil inserts** (seed de 68,5 s para 71,2 s).

**2. Avaliação em camadas.** O plano é a primeira chave de ordenação, então
cada plano virou uma subquery com o seu próprio `LIMIT`, unidas por
`UNION ALL`. O `Append` do Postgres é preguiçoso: se a camada `elite` já
encheu a página, `pro` e `starter` aparecem como **`never executed`** no
`EXPLAIN`. Três índices GiST parciais, um por plano, dão a cada camada a sua
fatia — a de `elite` tem 5% das linhas.

Os literais de plano vêm de uma lista fixa no código e entram como fragmento
`sql` estático, nunca por `sql.raw` — a regra ESC-13 de
`packages/api/src/lib/sql-safety.test.ts` proíbe `sql.raw` no pacote, e a
proibição foi respeitada. Constante inline é necessária para o Postgres casar
o predicado do índice parcial; verificado por `pg_stat_user_indexes`: 5 buscas
produziram **5 scans em `bar_geo_elite_idx` e 0 em `pro`/`starter`**.

### Resultado da query

| Ambiente | Antes | Depois | Ganho |
|---|---:|---:|---:|
| Local (Docker, PostGIS 17) | 24 ms / 44.363 buffers | **5,5 ms / 1.355 buffers** | 4,4× tempo, 33× buffers |
| Gêmeo Neon `us-east-1` | 117 ms | **13 ms** | **8,7×** |

Candidatos que entram nas laterais caíram de **6.100 para 300**.

Pior caso testado — filtro que não casa com nada, obrigando as três camadas a
varrer tudo: **23 ms contra 22–25 ms do plano antigo**. Empata, não regride.

Equivalência verificada linha a linha: as 20 linhas da busca antiga e da nova,
com `id`, `plan`, `distance_km`, `event_count` e `next_event_id`, saíram
**byte-idênticas e na mesma ordem**.

### Rampa local, dataset grande, busca em camadas

Mesmo harness, mesmo SLO (p95 < 300 ms, erro < 1%), `WORKLOAD=browse`.

| VUs | it/s | Erros | p95 global | p95 busca | Rerun anterior | Resultado |
|---:|---:|---:|---:|---:|---|---|
| 250 | 185 | 0% | 27,2 ms | 24,7 ms | 44 / 52 ms | passou |
| 350 | 260 | 0% | 26,6 ms | 24,2 ms | 50 / 58 ms | passou |
| 425 | 315 | 0% | 28,0 ms | 26,3 ms | 81 / 97 ms | passou |
| 500 | 364 | 0% | 50,0 ms | 50,7 ms | 385 / 435 ms, **reprovou** | **passou** |
| 600 | 357 | 0% | 1,13 s | 1,15 s | não medido | **reprovou SLO** |

**Teto verde local: 500 VUs. Primeiro reprovado: 600.** O 500 que reprovava
passou a passar com p95 de 50 ms — 17% do orçamento de 300 ms.

### O gargalo mudou de lugar

A vazão parou de crescer entre 500 e 600 VUs (364 → 357 it/s) e a latência
explodiu 23×. Isso não é o banco. Amostragem de CPU durante uma tentativa de
550 VUs:

```
app=283%  pg=119.70%
app=298%  pg=161.70%
app=308%  pg=117.23%
app=0%    pg=1.89%     <- processo morto
```

O processo da aplicação foi **morto por OOM (exit 137)** enquanto o Postgres
estava com CPU de sobra. A rodada de 550 VUs é **inválida** por isso — os
95,88% de falha são servidor morto, não latência.

Conclusão: depois desta mudança, **no harness local o limite é o processo
Node, não o Postgres**. Vale lembrar que o harness roda `vite dev`, bem mais
pesado que build de produção, e um processo só — em produção a Vercel escala
instâncias em paralelo, então este teto específico é artefato do harness.

### Gêmeo Neon: o que ele provou e o que ele não pode provar

Criado o projeto **`winter-breeze-66228309`**, `aws-us-east-1`, pg17 — mesma
região e mesma major de produção, mas **projeto separado**, para que estourar
qualquer quota ali não possa suspender o projeto que serve usuários.

Desenho: **fiel à busca, econômico em storage**. Mesma fórmula geográfica,
mesma distribuição de planos, 100k bares e 500k eventos — reproduz os **6.100
bares no raio de 3 km**. Ficaram de fora torcedores, sessões, favoritos e
eventos comerciais: não entram na busca e eram o que consumia espaço. Seed
por `INSERT ... SELECT generate_series` executado no servidor, sem trafegar
linha pela rede: **22 s** no total.

O guard loopback-only de `db:seed:load-test` **não foi burlado**; o gêmeo
recebeu SQL dedicado.

**Limitação que invalida a rampa de concorrência daqui.** Uma rampa contra o
gêmeo abortou em 25 de concorrência com p50 de 306 ms. A causa não é o Neon:
um `SELECT 1` em conexão quente, deste laptop para `us-east-1`, mede
**136 ms**. É RTT. Em produção a função vive em `iad1`, a ~1 ms do Neon.

Portanto **um gêmeo só-banco dirigido de uma máquina local não produz número
de capacidade de produção** — mede a distância até a Virgínia. O que dele se
aproveita é o que não depende de rede: o `EXPLAIN` server-side, que deu os
117 ms → 13 ms acima.

Para um número remoto defensável, o driver precisa rodar **dentro** de
`us-east-1`. Isso significa função Vercel (e aí volta o fair use de
Hobby/Pro) ou uma VM na região. Nenhum dos dois foi feito.

### Custo desta rodada

| Projeto | CU-h | Storage | Observação |
|---|---:|---:|---|
| `findsports` (produção) | **5,76** | 77,6 MiB | **inalterado**; nada foi consumido |
| `winter-breeze-66228309` (gêmeo, iad) | ~0 | **601,6 MiB** | acima dos 512 MB do Free |
| `weathered-voice-03215387` (us-west-2) | 0 | 28,6 MiB | **órfão e vazio**, criado por engano na região errada |

O gêmeo passou dos 512 MB porque o storage sintético inclui WAL e histórico
(`pg_database_size` marcava 318 MB). Como é projeto isolado, isso não põe
produção em risco, mas ele deve ser apagado quando não for mais útil.

### Redis Upstash: decisão de deixar expirar

O Redis de Preview (`probable-ghoul-160186`) **expira em 21/08/2026** e a
decisão foi não reclamar agora. Consequências, para ficar registrado:

- `createSharedCache` cai sozinho para cache em memória da instância quando
  `KV_REST_*` / `UPSTASH_REDIS_REST_*` não existem. Nada quebra.
- Produção **não perde nada**, porque o Redis nunca esteve em Production.
- O que se perde é o Preview deixar de exercitar o caminho compartilhado.

**Vale pagar depois, e o motivo é específico:** em serverless cada função
fria começa com o cache vazio. Sem store compartilhado, N instâncias no mesmo
minuto refazem a mesma busca. Com a busca a 13 ms isso é bem menos grave que
antes — o Redis deixou de ser urgente e virou otimização de custo. A ordem
recomendada agora é: **primeiro plano pago (que é o que trava o teto hoje),
depois Redis**. Antes desta rodada a ordem era a inversa.

### Números para usar agora

| Superfície | Limite | Como foi medido |
|---|---|---|
| Simultâneos, planejamento (laboratório) | **425 VUs** | rampa local, p95 busca 26 ms, margem grande |
| Simultâneos, teto verde (laboratório) | **500 VUs** | rampa local, p95 busca 51 ms |
| Primeiro patamar reprovado (laboratório) | **600 VUs** | rampa local, p95 busca 1,15 s |
| Custo da busca no Neon real | **13 ms** | `EXPLAIN ANALYZE` no gêmeo, 6.100 bares no raio |
| Produção Free, pico curto | **~100** | inalterado; limite é cota, não latência |
| Produção Free, sustentado | **dezenas** | inalterado |
| Capacidade remota oficial | **ainda não existe** | exige driver dentro de `us-east-1` |

Os números de laboratório subiram porque a busca ficou barata. **O número de
produção não mudou**, porque no free-tier o que acaba primeiro é a cota
mensal — 100 CU-h no Neon e ~4 h de CPU Fluid na Vercel — e não o tempo de
resposta. Cortar a busca não compra plano; o que ele faz é decidir até onde o
plano estica quando ele existir.

### Próximos passos revisados

1. Rodar a rampa a partir de **dentro de `us-east-1`** — é o único jeito de
   ter capacidade remota. Sem isso não existe número oficial de produção.
2. Investigar o **OOM da aplicação** perto de 550 VUs. Pode ser artefato do
   `vite dev`; precisa ser confirmado contra build de produção antes de
   virar limite documentado.
3. Medir a **build de produção** no harness local. Os ~8 ms de CPU por
   request foram medidos em modo dev e devem cair bastante.
4. Apagar o gêmeo e o projeto órfão quando não forem mais úteis.
5. Redis compartilhado **depois** do plano pago, não antes.
