# Pendências de escalabilidade

O que ficou **aberto** depois da auditoria dos 21 achados (ESC-01 a ESC-21), por
que ficou, como fazer e como conferir que funcionou.

Regra que vale para tudo aqui: **medir antes, medir depois**. Todo achado
fechado nesta série tem número antes e depois. Se você fizer alguma destas
pendências sem medir, não tem como saber se ajudou.

> Estado geral: 17 achados resolvidos, 3 parciais e 1 retirado. Nada foi
> deixado sem tratamento — os parciais estão abertos só na parte que exige
> provisionar serviço, mexer em console de terceiro ou decidir produto.

---

## Índice

| # | Pendência | Achado | Bloqueio |
|---|---|---|---|
| 1 | Cache compartilhado (Redis/KV) | ESC-08 | Provisionar serviço |
| 2 | Cache de CDN nas páginas públicas | ESC-08 | Verificação exige CDN real |
| 3 | Marcadores modernos do mapa | ESC-16 | Map ID no Google Cloud |
| 4 | Agrupamento de pinos | ESC-16 | Depende de rolagem infinita |
| 5 | Rastreamento de erro (Sentry) | ESC-18 | Conta e credencial |
| 6 | Executar o teste de carga | ESC-18 | k6 não instalado |
| 7 | Páginas de bar na busca | ESC-20 | **Retirado** — privadas por desenho |
| 8 | Agendar a retenção de analytics | ESC-10 | Decisão de dono |
| 9 | Remover índices redundantes | ESC-12 | Mudança destrutiva |
| 10 | Particionar `bar_commercial_event` | ESC-10 | Mudança estrutural |

---

## 1. Cache compartilhado entre instâncias (Redis/KV) — ESC-08

### O que existe hoje

Cache em memória por instância (`packages/api/src/lib/ttl-cache.ts`), usado em
`getSports`, `getTeamsBySport` (5 min) e `getEliteEvents` (60 s). Medido: 10
chamadas viram 1 consulta ao banco.

### O que falta e por quê

O cache é **por instância**. Cada função serverless nova começa vazia. E o
resultado da **busca por proximidade** não é cacheado — é a única consulta
pesada que ainda vai ao Postgres em toda requisição.

Não fiz porque exige provisionar um serviço e ter credencial. Não dá para
adicionar às cegas uma dependência que não existe na conta de vocês.

### Como fazer

1. **Provisionar.** No painel da Vercel, aba *Storage*, criar um banco Upstash
   Redis (integração nativa; o plano gratuito serve para começar). A Vercel
   injeta `KV_REST_API_URL` e `KV_REST_API_TOKEN` no projeto automaticamente.
2. **Instalar o cliente:** `bun add @upstash/redis -F @findsports_oficial/api`
3. **Escrever um adaptador com a mesma interface do `TtlCache`.** O tipo já
   está definido; manter a interface deixa a troca local:

   ```ts
   // packages/api/src/lib/redis-cache.ts
   import { Redis } from '@upstash/redis'
   import type { TtlCache } from './ttl-cache'

   export function createRedisCache<T>(prefixo: string, ttlMs: number): TtlCache<T> {
     const redis = Redis.fromEnv()
     return {
       async get(key, load) {
         const chave = `${prefixo}:${key}`
         const emCache = await redis.get<T>(chave)
         if (emCache !== null) return emCache
         const valor = await load()
         await redis.set(chave, valor, { px: ttlMs })
         return valor
       },
       clear() { /* usar SCAN + DEL por prefixo */ },
       size() { return -1 }
     }
   }
   ```

4. **Cachear a busca.** Em `pubs.search`, montar a chave com as coordenadas
   **arredondadas** (3 casas ≈ 110 m) mais raio e filtros. Sem arredondar, cada
   usuário gera chave própria e o cache nunca acerta:

   ```ts
   const chave = [lat.toFixed(3), lng.toFixed(3), radiusKm,
                  sportId ?? '', championship ?? '', date ?? ''].join('|')
   ```

   TTL curto — 60 s. A busca depende de `starts_at >= NOW()`, então cache longo
   mostra jogo já começado.

5. **Migrar o rate limit** do better-auth de `database` para
   `secondary-storage` (`packages/auth/src/index.ts`), o que tira uma escrita
   no Postgres por requisição de autenticação.

### Cuidados

- **Nunca cachear dado derivado de sessão.** O cache é compartilhado por todos.
  A regra está escrita no topo de `ttl-cache.ts` e vale igual no Redis.
- **Manter a proteção contra rajada.** O `ttl-cache` atual garante que
  requisições simultâneas na mesma chave fria disparem **uma** carga. Sem isso,
  cache vazio vira rajada no banco no pico. No Redis, usar `SET NX` como trava.
- **Falha do Redis não pode derrubar a requisição.** Envolver leitura e escrita
  em `try/catch` e cair para o banco.

### Como testar

```bash
# 1. Antes: contar consultas ao banco numa carga repetida
docker exec -i findsports_dev psql -U findsports_dev -d findsports_dev \
  -c "ALTER SYSTEM SET log_statement='all'" -c "SELECT pg_reload_conf()"
A=$(docker logs findsports_dev 2>&1 | grep -c 'ST_DWithin')
for i in $(seq 20); do curl -s -b jar.txt -o /dev/null \
  "http://localhost:3001/api/trpc/pubs.search?input=%7B%22lat%22%3A-23.55%2C%22lng%22%3A-46.63%2C%22radiusKm%22%3A3%7D"; done
sleep 2
echo "consultas: $(( $(docker logs findsports_dev 2>&1 | grep -c 'ST_DWithin') - A ))"
# Esperado hoje: 20. Com cache: 1.

# 2. Reverter o log
docker exec -i findsports_dev psql -U findsports_dev -d findsports_dev \
  -c "ALTER SYSTEM RESET log_statement" -c "SELECT pg_reload_conf()"
```

Testar também **duas instâncias** (`bun run dev:web` duas vezes, portas
diferentes): a segunda deve aproveitar o cache preenchido pela primeira — é
isso que a memória não consegue fazer.

---

## 2. Cache de CDN nas páginas públicas — ESC-08

### Por que não fiz

Duas razões, e a segunda é a que importa:

1. **O ganho é menor do que eu estimei.** Medido: com o cache de sessão do
   ESC-02, cinco carregamentos da landing custam **zero** consulta ao banco. A
   CDN economizaria tempo de função, não Postgres.
2. **É fácil errar de um jeito perigoso.** Comparei o HTML de SSR anônimo com o
   autenticado: nenhum dado de usuário vaza, mas **as respostas diferem**.
   Marcar `Cache-Control: public` sem condicional faria a CDN servir o shell de
   uma sessão para outra.

### Como fazer com segurança

A regra: emitir `public` **apenas** quando não há cookie de sessão.

```ts
// Dentro de uma rota de página, no servidor
import { getCookie, setResponseHeader } from '@tanstack/react-start/server'

const temSessao = Boolean(getCookie('better-auth.session_token'))
if (temSessao) {
  setResponseHeader('cache-control', 'private, no-store')
} else {
  setResponseHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=3600')
  setResponseHeader('vary', 'Cookie')
}
```

Aplicar só em `/`, `/login`, `/signup` e `/pub/$pubId`. **Nunca** em `/admin`,
`/dashboard` ou `/internal`.

### Como testar

Só vale contra uma CDN real — em `localhost` não há cache compartilhado.
Depois de um deploy de pré-visualização:

```bash
# Anônimo: deve trazer public + Vary, e HIT na segunda visita
curl -sI https://SEU-PREVIEW.vercel.app/ | grep -iE 'cache-control|vary|x-vercel-cache'
curl -sI https://SEU-PREVIEW.vercel.app/ | grep -i x-vercel-cache   # esperado: HIT

# Autenticado: NUNCA pode dar HIT
curl -sI -b jar.txt https://SEU-PREVIEW.vercel.app/ | grep -iE 'cache-control|x-vercel-cache'
# esperado: private, no-store  +  x-vercel-cache: MISS ou BYPASS
```

**Teste de vazamento, obrigatório:** entrar como usuário A, abrir a landing,
sair, abrir em janela anônima e confirmar que o shell logado **não** aparece.

---

## 3. Marcadores modernos do mapa (`AdvancedMarkerElement`) — ESC-16

### Por que não fiz

`google.maps.Marker` está depreciado. A API nova **só renderiza se o mapa tiver
um Map ID**, criado no console do Google Cloud. Procurei no repositório inteiro:
não existe nenhum configurado.

Migrar sem Map ID não daria erro — os pinos simplesmente **parariam de
aparecer**. É o pior tipo de quebra: silenciosa.

### Como fazer

1. **Criar o Map ID.** Google Cloud Console → *Google Maps Platform* → *Map
   Management* → *Create Map ID*. Tipo: **JavaScript**. Escolher um estilo (ou
   o padrão). Copiar o identificador.
2. **Publicar como variável de ambiente pública:**
   `VITE_GOOGLE_MAPS_MAP_ID=...` no `.env` e no painel da Vercel.
3. **Passar na criação do mapa** (`apps/web/src/components/app/google-map.tsx`):
   `new runtime.Map(el, { mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID, ... })`
4. **Trocar o construtor.** O loader já importa a biblioteca `marker`; expor
   `AdvancedMarkerElement` em `GoogleMapsRuntime` e trocar em
   `google-map.tsx`. Diferenças que quebram:
   - não existe `setIcon`: o conteúdo é um elemento DOM (`content`)
   - não existe `setPosition`: usa a propriedade `position`
   - eventos: `gmp-click` em vez de `click`
5. **`marker-diff.ts` continua valendo.** A decisão de "o que mudou" é
   independente da API; só a aplicação muda.

### Como testar

Não há como testar sem navegador. Roteiro manual:

1. `bun run dev:web`, abrir `/dashboard`, permitir localização.
2. **Os pinos aparecem?** Se não, o Map ID está errado — é exatamente a falha
   silenciosa.
3. Passar o mouse pela lista: o pino correspondente deve crescer.
4. Console do navegador sem avisos de depreciação.
5. Ferramentas de desenvolvedor → *Performance*, gravar 10 s movendo o mouse
   pela lista e comparar o tempo de script com a versão anterior.

---

## 4. Agrupamento de pinos — ESC-16

### Por que não fiz

A busca devolve no máximo 30 resultados. Agrupar abaixo disso não ajuda, e
custaria uma dependência nova.

Faz sentido **junto** com a rolagem infinita que o ESC-05 preparou (o cursor
keyset existe, mas nenhuma tela usa ainda). Antes disso, é dependência para um
problema que ninguém tem.

### Como fazer, quando fizer sentido

```bash
bun add @googlemaps/markerclusterer -F web
```

A biblioteca funciona com marcador legado **e** com o moderno, então não
depende do item 3.

### Como testar

Popular o banco de desenvolvimento com centenas de bares (o script de
`packages/db/src/seed/` serve de base), abrir o mapa afastado e conferir que os
pinos viram grupos numerados, e que aproximar desagrupa.

---

## 5. Rastreamento de erro (Sentry) — ESC-18

### O que existe hoje

Log estruturado em toda chamada tRPC
(`packages/api/src/lib/observability.ts`): procedimento, tipo, duração,
desfecho e código do erro — **sem** entrada do usuário e **sem** identificador
de pessoa, com teste que trava a forma da linha.

### Por que não fiz

Sentry exige conta, projeto e DSN. Não dá para provisionar por você.

### Como fazer

1. Criar projeto em sentry.io (plataforma: *React* + *Node*).
2. `bun add @sentry/node -F @findsports_oficial/api`
3. `SENTRY_DSN` no `.env` e no painel da Vercel.
4. Inicializar uma vez e enviar **só o que já é seguro**: o log estruturado já
   define o que pode sair. Reaproveitar esse contrato em vez de mandar o erro
   cru — erro cru pode carregar entrada do usuário.

   ```ts
   // no middleware de packages/api/src/index.ts, no ramo de erro inesperado
   if (nivel === 'error') {
     Sentry.captureException(resultado.error, { tags: { path, type } })
   }
   ```

5. **Não** capturar recusa de negócio (`UNAUTHORIZED`, `BAD_REQUEST`…). A
   distinção já está em `nivelDoLog`. Sem isso, o volume normal afoga os
   defeitos.

### Como testar

Criar uma rota temporária que lança erro inesperado, chamar, confirmar que
aparece no painel do Sentry, e **remover a rota**. Depois provocar um
`UNAUTHORIZED` e confirmar que **não** aparece.

---

## 6. Executar o teste de carga — ESC-18

### O que existe

`apps/web/scripts/load-test.k6.js`, pronto, com limiar de p95 < 300 ms e
coordenadas variadas de propósito (ponto fixo esconderia o custo do índice
espacial).

### Por que não rodei

k6 não está instalado nesta máquina. Verifiquei.

### Como fazer

```bash
brew install k6                        # macOS
# ou: docker run --rm -i grafana/k6 run - < apps/web/scripts/load-test.k6.js

bun run dev:web                        # em outro terminal
BASE_URL=http://localhost:3001 \
LOAD_EMAIL=seu@email LOAD_PASSWORD=suasenha \
  k6 run apps/web/scripts/load-test.k6.js
```

**Antes de dar valor ao número, popule o banco.** Com 3 bares qualquer coisa é
rápida. Um cenário realista tem alguns milhares:

```sql
-- No banco de DESENVOLVIMENTO. Em transação, se quiser descartar depois.
INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role)
SELECT 'carga-u-'||i, 'Carga '||i, 'carga-'||i||'@local.test', false, NOW(), NOW(), 'pub'
FROM generate_series(1,2000) i;

INSERT INTO bar (id, user_id, name, address, neighborhood, city, latitude, longitude, is_active, created_at, updated_at)
SELECT 'carga-b-'||i, 'carga-u-'||i, 'Bar '||i, 'Rua '||i, 'Bairro', 'São Paulo',
       (-23.55 + (random()-0.5)*0.2)::numeric(10,8),
       (-46.63 + (random()-0.5)*0.2)::numeric(11,8),
       true, NOW(), NOW()
FROM generate_series(1,2000) i;

INSERT INTO event (id, bar_id, sport_id, championship, starts_at, created_at)
SELECT 'carga-e-'||i, 'carga-b-'||i, (SELECT id FROM sport LIMIT 1),
       'Camp '||i, NOW() + (i||' minutes')::interval, NOW()
FROM generate_series(1,2000) i;

ANALYZE bar; ANALYZE event;
```

### Como ler o resultado

O k6 falha sozinho se p95 passar de 300 ms. Se falhar, o próximo passo é
`pg_stat_statements` (já instalada em produção) para ver qual consulta domina.

---

## 7. Páginas de bar na busca — ESC-20 (achado **retirado**)

### Por que este item não é uma pendência

Eu havia classificado como defeito o fato de as páginas `/pub/$pubId` estarem
fora do índice de busca. **Estão fora de propósito**, e o motivo é comercial.

Conferindo a codebase:

- a página renderiza `<AuthRequiredDialog open />` e marca o conteúdo como
  `inert` + `aria-hidden` sem sessão, citando a especificação do produto;
- `recordCommercialEvent` exige um fã identificado;
- `actor_user_id` é `notNull`, faz parte da chave de deduplicação diária e é a
  base de `COUNT(DISTINCT actor_user_id)` para visitantes únicos e
  interessados.

Visitante anônimo é **estruturalmente impossível de atribuir**. Abrir a página
para busca traria tráfego que nunca apareceria no painel que o bar paga para
ver. Perder aquisição orgânica é um custo; entregar analytics furado a quem
paga por ele é outra categoria de problema.

Cheguei a implementar o contrário — perfil público, `noindex` removido, bares
no sitemap. **Foi revertido**, e a reversão está verificada: anônimo recebe
`UNAUTHORIZED` em `pubs.getById`, e o sitemap não referencia nenhuma página de
bar.

### O que ficou do trabalho

- Correção de um erro de renderização no servidor (`window is not defined` num
  diálogo que usava `window.location.href` no corpo do componente). Afetava
  toda visita sem sessão e é independente deste achado.
- Montagem do sitemap virou módulo testado, com escape de XML.
- `pubs.getById` deixou de devolver o `user_id` do dono.

### Se um dia quiserem abrir as páginas

O problema a resolver **primeiro** não é SEO, é atribuição: como contar uma
visita anônima sem quebrar a deduplicação diária e as contagens distintas.
Caminhos possíveis, em ordem de esforço:

1. **Identificador anônimo estável** (cookie de primeira parte). Exige tornar
   `actor_user_id` opcional, acrescentar `actor_anon_id`, refazer a chave de
   deduplicação e decidir o que "visitante único" passa a significar quando a
   mesma pessoa aparece antes e depois de criar conta.
2. **Página pública reduzida** — nome, endereço e agenda visíveis para busca,
   com as ações que geram evento comercial (rota, telefone, WhatsApp) atrás do
   login. Preserva a atribuição do que importa comercialmente e recupera parte
   da aquisição. É o meio-termo mais provável.
3. **Manter como está.** Perfeitamente defensável enquanto a aquisição vier de
   outro canal.

Qualquer um dos dois primeiros é decisão de produto **antes** de ser tarefa
técnica. Se escolherem, o sitemap já está pronto para receber uma entrada por
bar ativo — a montagem trata escape e formato.

## 8. Agendar a retenção de analytics — ESC-10

### O que existe

`runAnalyticsRetention` (`packages/api/src/lib/commercial-analytics/recorder.ts`)
consolida os dias fechados e poda os eventos brutos já consolidados. Exercitada
de ponta a ponta em transação revertida: 511 eventos → 13, com o agregado
inteiro preservado.

Exposta em `commercialAnalytics.cleanupRetention`, **só para admin**, e com
`apagarEventosBrutos: false` por padrão.

### Por que não agendei

Ligar tarefa automática que **apaga dado** em produção é decisão de dono do
produto. Ainda mais numa base cujo volume de eventos em produção é zero.

### Como fazer

1. **Rodar em modo informativo primeiro**, algumas semanas, e olhar
   `eventosPodaveis` crescer.
2. Criar a rota de cron:
   ```ts
   // apps/web/src/routes/api/cron/retention.ts
   // Proteger com CRON_SECRET: a rota fica pública na internet.
   const auth = request.headers.get('authorization')
   if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
     return new Response('não autorizado', { status: 401 })
   }
   const r = await runAnalyticsRetention({ retentionDays: 90, apagarEventosBrutos: true })
   return Response.json(r)
   ```
3. Agendar no `vercel.json`:
   ```json
   "crons": [{ "path": "/api/cron/retention", "schedule": "0 4 * * *" }]
   ```
4. Definir `CRON_SECRET` no painel da Vercel.

### Cuidados

- **Nunca** ligar `apagarEventosBrutos: true` sem antes ver o número em modo
  informativo.
- A janela de retenção (90 dias) precisa ser **maior** que o maior período que
  o painel consegue consultar. Hoje o plano *elite* não tem limite de dias —
  ou seja, podar 90 dias hoje deixaria o painel dele sem dado bruto. Ou limita
  o plano, ou o painel passa a ler dos rollups nesse intervalo.

### Como testar

```sql
BEGIN;
-- chamar a rotina aqui (ou o SQL equivalente)
SELECT count(*) FROM bar_commercial_event;
SELECT sum(profile_views) FROM bar_commercial_daily_rollup;  -- precisa se manter
ROLLBACK;
```

---

## 9. Remover índices redundantes — ESC-12

Encontrados, **não removidos** (a orientação da série foi não apagar nada):

| Índice | Redundante porque |
|---|---|
| `event_barId_idx` | é prefixo exato de `event_barId_startsAt_idx` |
| `bar_userId_idx` | duplica o índice único `bar_user_id_unique` |

Custam escrita e espaço sem servir consulta que o outro não sirva.

```sql
-- Migration nova. Confira o uso antes:
SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
WHERE indexrelname IN ('event_barId_idx','bar_userId_idx');
-- Se idx_scan for ~0 depois de dias de tráfego, pode remover:
DROP INDEX IF EXISTS "event_barId_idx";
DROP INDEX IF EXISTS "bar_userId_idx";
```

Lembre de remover também do schema Drizzle, senão o próximo `db:push` recria.

---

## 10. Particionar `bar_commercial_event` por mês — ESC-10

Com a poda funcionando, isto virou otimização de manutenção, não correção.
Particionar transforma a poda num `DROP PARTITION` instantâneo em vez de um
`DELETE` em massa que segura lock.

Vale quando a tabela passar de alguns milhões de linhas. Exige recriar a tabela
como particionada e migrar os dados — mudança estrutural, com janela.

---

## Verificação rápida do estado atual

```bash
bun run check-types     # deve passar limpo
bun test                # 231 passando, 0 falhas
bunx biome check .      # avisos pré-existentes em arquivos não tocados

# Migrations pendentes (deve dizer que aplicou / nada a fazer)
NODE_ENV=production bun run db:migrate:deploy

# Chaves estrangeiras sem índice (deve ser 0)
SELECT count(*) FROM pg_constraint c
WHERE c.contype='f' AND c.connamespace='public'::regnamespace
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid
    AND (i.indkey::smallint[])[0:array_length(c.conkey,1)-1] @> c.conkey);
```

---

## Resíduos de teste que deixei

No banco de **desenvolvimento** (nada em produção):

- usuário `esc02-check@local.test`, criado para medir o cache de sessão
- 2 eventos comerciais gerados pelo teste de integração do ESC-06

Podem ser removidos à vontade — são meus, não seus.
