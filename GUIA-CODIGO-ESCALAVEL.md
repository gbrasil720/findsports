# Guia: escrever código que aguenta o crescimento

Escrito depois de auditar e corrigir 21 gargalos de escalabilidade neste
repositório. Cada regra aqui saiu de um defeito real que estava no código —
não de teoria. Onde couber, o achado de origem está citado.

Vale para pessoas e para agentes. Se você é um agente trabalhando neste
repositório, leia inteiro antes de escrever a primeira linha.

---

## 0. A regra que vale mais que todas

**Meça antes de afirmar.**

Nove das minhas próprias conclusões iniciais estavam erradas, e só apareceram
como erradas porque fui medir:

- "a página 10 custa dez vezes a página 1" — não custava; o filtro de raio já
  limitava o conjunto
- "os marcadores são recriados a cada render" — não eram; o desperdício era
  outro
- "a connection string não é a do pooler" — era
- "fixar a região em São Paulo" — teria feito toda consulta atravessar o
  continente
- "o painel faz 14 consultas" — eram 16

Ler código gera hipótese. Só medição vira fato. E medir é barato: quase tudo
neste guia é um `EXPLAIN ANALYZE`, um contador de statements ou um `curl`.

**Corolário:** ao consertar algo, deixe o número antes e o número depois. Sem
isso não há como saber se a mudança ajudou — nem para você, nem para quem vier.

---

## 1. Banco de dados

### 1.1 Filtro tem que poder usar índice

Função sobre coluna mata o índice. O caso real (ESC-01) calculava distância com
`acos(cos(radians(latitude::float)) …)` para **toda linha** da tabela e só
depois filtrava por raio.

```sql
-- ✗ nenhum índice serve; calcula para todas as linhas e descarta depois
WHERE (6371 * acos(... radians(latitude::float) ...)) <= 3

-- ✓ operador que o índice entende, filtro antes do cálculo
WHERE ST_DWithin(geo, $origem, $raio_m)
```

Regra prática: se a coluna aparece **dentro** de uma função no `WHERE`, ou o
índice é sobre a expressão, ou não há índice.

### 1.2 Sempre pergunte "isso cresce com o quê?"

O defeito mais caro da auditoria (ESC-03) não era lento — era **quadrático**.
O rollup do dia era recalculado inteiro a cada evento:

| eventos no dia | custo por evento |
|---|---|
| 500 | 163 µs |
| 2000 | 456 µs |
| 5000 | 1237 µs |

O custo por evento crescia junto com o dia. Dez vezes mais volume custou
**76 vezes** mais tempo.

Antes de aprovar uma consulta, responda: *o custo desta operação cresce com o
tamanho da entrada, ou com o tamanho da tabela?* A segunda resposta é dívida.

### 1.3 Chave estrangeira precisa de índice — o Postgres não cria

O Postgres indexa o lado **referenciado**, nunca o que referencia. Sem índice,
apagar o pai varre a tabela filha inteira segurando lock. Havia três assim
(ESC-12), e nenhuma tinha aparecido quando olhei só as consultas.

```sql
-- Auditoria: deve devolver zero
SELECT c.conrelid::regclass, c.confrelid::regclass
FROM pg_constraint c
WHERE c.contype='f' AND c.connamespace='public'::regnamespace
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid
    AND (i.indkey::smallint[])[0:array_length(c.conkey,1)-1] @> c.conkey);
```

Atenção às chaves primárias compostas: `PRIMARY KEY (user_id, sport_id)`
**não** serve para buscar por `sport_id`.

### 1.4 Uma instrução em vez de várias idas

Cada ida ao banco é latência. Medido daqui até o banco: **138 ms** por ida
(ESC-21). Cinco validações sequenciais viram 690 ms só de rede.

O registro de evento comercial fazia 5 consultas antes de gravar. Viraram CTEs
da mesma instrução (ESC-06): **5 idas → 1**. E o painel de analytics saiu de
16 consultas para 1 (ESC-07).

```sql
WITH validacoes AS ( SELECT CASE WHEN … THEN 'motivo' … ELSE 'ok' END AS reason ),
     inserido  AS ( INSERT … SELECT … FROM validacoes WHERE reason = 'ok' RETURNING id )
SELECT (SELECT reason FROM validacoes), (SELECT count(*) FROM inserido)
```

Ganho colateral: **acaba a janela** entre validar e gravar. As duas coisas
passam a ver o mesmo estado.

### 1.5 `FILTER` em vez de várias consultas

Contar coisas diferentes sobre a mesma faixa não precisa de várias passagens:

```sql
COUNT(*) FILTER (WHERE type = 'profile_view'      AND ocorreu_no_periodo)  AS views,
COUNT(*) FILTER (WHERE type = 'directions_opened' AND ocorreu_no_periodo)  AS rotas,
COUNT(DISTINCT actor_user_id) FILTER (WHERE …)                             AS unicos
```

### 1.6 Paginação por cursor, nunca por `OFFSET`

`OFFSET` produz e descarta tudo que vem antes, e **duplica ou pula itens**
quando a lista muda entre requisições. Medido (ESC-05): uma escrita concorrente
entre a página 1 e a 2 fez o `OFFSET` repetir um item; o cursor, zero.

Três detalhes que fazem o cursor funcionar:

1. **Desempate único.** A ordenação precisa ser total — se dois itens empatam
   em todos os critérios, a fronteira fica ambígua. Termine sempre com `id`.
2. **A comparação usa a mesma expressão da ordenação.** Ordenar por
   `geo <-> ponto` e comparar com `ST_Distance` descarta a varredura ordenada.
3. **Cursor opaco.** Base64 de JSON, validado na volta. O cliente não deve
   depender das chaves de ordenação, senão elas nunca mais mudam.

E cursor inválido devolve `BAD_REQUEST` — **não** "volta para a primeira
página". O conserto gentil esconde o bug e faz o consumidor repetir resultados
para sempre.

### 1.7 Fuso horário destrói chave de paginação

`timestamp without time zone` convertido para `Date` e de volta desloca pelo
fuso do processo. Faça o timestamp viajar como texto no formato do Postgres:

```sql
to_char(coluna, 'YYYY-MM-DD HH24:MI:SS.US')   -- na saída
…  > (${valor}::timestamp, …)                 -- na volta
```

### 1.8 Toda mudança de schema é migration

Produção estava atrás do repositório em uma migration inteira (ESC-19), e
ninguém sabia. A migração agora é o **primeiro passo do build de deploy**: se
falhar, o build falha e nada vai ao ar.

- Migrations são **aditivas** por padrão. Remover ou renomear coluna exige duas
  fases: adicionar, migrar o código, só depois remover.
- `IF NOT EXISTS` em tudo. Migration precisa ser idempotente.
- Nunca edite uma migration já aplicada em qualquer ambiente — o hash muda.
- Depois de aplicar, **confira a contagem de linhas antes e depois**. Foi assim
  em todas as migrations desta série.

---

## 2. Serverless

### 2.1 Estado em memória não sobrevive, e não é compartilhado

Cada instância tem a própria memória, que some entre invocações. Isso invalida
duas coisas que pareciam funcionar:

- **Rate limit em memória** (ESC-11): existia no papel e não no comportamento.
  Provado com dois processos — o segundo dava três tentativas novas.
- **Cache em memória**: serve para dado global e barato de recarregar
  (catálogo). Não serve como fonte de verdade.

Se a informação precisa valer entre instâncias, ela vai para o Postgres ou para
um Redis. Não há terceira opção.

### 2.2 Nada de trabalho depois da resposta

```ts
// ✗ a instância pode congelar antes disto terminar, sem aviso
void atualizarRollup(barId, dia)

// ✓ na mesma instrução, ou nada
WITH inserido AS (INSERT …), rollup AS (INSERT … ON CONFLICT DO UPDATE …) SELECT …
```

Se for realmente inevitável executar depois, use `waitUntil()` da plataforma —
nunca `void`.

### 2.3 Conexão é recurso escasso

Pool por instância multiplica conexões pelo número de instâncias. Medido
(ESC-04): 3 instâncias × 10 requisições seguravam **30 conexões**; com as
consultas indo por HTTP, **2**.

Neste projeto: `neonConfig.poolQueryViaFetch = true` faz consulta normal viajar
sem conexão; só transação faz checkout. Se você adicionar um listener de
`connect`/`acquire`/`release`/`remove` no Pool, **desliga** esse comportamento
sem avisar.

### 2.4 Toda chamada externa precisa de prazo

`fetch` sem timeout pendura a requisição pelo tempo que o terceiro quiser
(ESC-14). O mínimo:

```ts
await fetch(url, { signal: AbortSignal.timeout(4000) })
```

E classifique a falha antes de repetir: erro de rede e HTTP 5xx valem nova
tentativa; "não encontrado" não vale — repetir só gasta tempo do usuário e cota
da API.

**Nunca culpe o usuário por falha sua.** O geocoding devolvia "endereço não
encontrado" quando o Google estava fora do ar, mandando corrigir um endereço
que estava certo.

---

## 3. Segurança

### 3.1 Autorização é degrau do procedimento, não lembrete no handler

`waitlist.getAll` devolvia a base inteira de e-mails para **qualquer conta com
sessão** (ESC-09). A tela era protegida; o endpoint não. Guard de rota protege
**navegação**, não **dados**.

```ts
// ✗ funciona enquanto alguém lembrar de escrever
if (ctx.session.user.role !== 'admin') throw …

// ✓ quem usa não tem como esquecer
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' })
  return next({ ctx })
})
```

Ao criar um procedimento novo, pergunte: *o que acontece se um fã chamar isto
direto com `curl`?* Se a resposta depender da tela, está errado.

### 3.2 Não devolva o que a tela não usa

- `geo` é coluna derivada do índice → fora da resposta
- `user_id` do dono → fora da página pública
- entrada do usuário → fora do log
- mensagem de erro → fora do log (só o código; mensagem ecoa entrada)

### 3.3 Quando o cliente informa, o servidor valida

Com upload direto para o armazenamento (ESC-15), quem propõe o destino do
arquivo e a URL final é o navegador. O servidor **não consegue reescrever** o
caminho — só recusar. Então recusar é a defesa:

- comparação **exata**, não prefixo (`bar-1234` não pode passar por `bar-123`)
- host validado por **sufixo**, não substring
  (`…vercel-storage.com.exemplo.com` precisa cair)
- só `https`

### 3.4 Dado que entra em HTML precisa de escape do HTML

JSON-LD é JSON dentro de `<script>`. Um nome de bar com `</script>` encerra a
tag e o resto vira marcação — de dado do usuário para execução. Escape `<`,
`>` e `&` como `\u00xx`; continua JSON válido.

Mesma ideia no XML do sitemap: um `&` não escapado invalida o documento
**inteiro**, e sitemap malformado é descartado por completo.

### 3.5 Cache compartilhado nunca guarda dado de sessão

O cache é visto por todas as requisições que aquela instância atender. Guardar
dado de usuário ali significa entregá-lo a outro. Só entra dado **global**.

O mesmo vale para `Cache-Control: public`: se a resposta varia com a sessão,
marcar como pública faz a CDN servir a página de um para outro.

---

## 4. Frontend

### 4.1 Estado no lugar mais alto re-renderiza tudo abaixo

Um contador de minuto no componente da página re-renderizava herói, filtros,
mapa e lista a cada 60 s (ESC-17). O que dependia do tempo era o selo de cada
cartão.

Padrão: provedor que devolve `children` sem tocá-los. Trocar o valor do
contexto re-renderiza **só quem consome**.

### 4.2 Aplique só o que mudou

O mapa reaplicava posição, título, ícone e ordem em **todos** os pinos a cada
movimento do mouse (ESC-16), quando no máximo dois mudavam. Guarde o último
estado aplicado e compare.

Corolário: se existe um conjunto pequeno e fixo de objetos possíveis — seis
ícones, três cores × dois tamanhos — construa uma vez e reaproveite.

### 4.3 Alinhe timers ao evento, não ao momento da montagem

`setInterval(60_000)` a partir da montagem faz o disparo cair em qualquer ponto
do minuto: um jogo às 20:00 aparecia como "por vir" até 20:00:47. Agende para a
virada. E pare o timer com a aba oculta — ao voltar, atualize **antes** de
reagendar, porque o tempo andou.

### 4.4 Política de cache por natureza do dado

Um `staleTime` global para tudo é refetch demais no dado estável e de menos no
dado vivo. Catálogo: 30 minutos. Destaques que dependem de `NOW()`: 60 segundos,
casados com o TTL do servidor para as camadas expirarem juntas.

---

## 5. Como testar neste repositório

### 5.1 Extraia a decisão, teste a decisão

SQL não dá para testar em unidade — mas a **decisão** dá:

- `diffMarkerState` — o que atualizar no pino
- `msUntilNextMinute` — quando disparar o relógio
- `assertRecordable` — que erro cada recusa vira
- `montarLinhaDeLog` — o que sai no log
- `isOwnPhotoUrl` — que URL é aceita
- `buildSitemap` / `escapeXml` — o que vai para o XML

Todas puras, todas testadas, nenhuma precisa de banco.

### 5.2 Contra o banco, use transação revertida

Exercite o ciclo inteiro — inclusive o `DELETE` — e termine em `ROLLBACK`. Foi
assim que a retenção foi validada (511 eventos → 13) sem apagar nada.

```sql
BEGIN;
  -- popular, executar, comparar
ROLLBACK;
```

Confira as contagens depois, fora da transação, para provar que nada ficou.

### 5.3 Contra produção, use branch temporária do Neon

Cópia copy-on-write, com expiração automática. Foi assim que a migration do
PostGIS foi ensaiada antes de ir para produção.

### 5.4 Sempre tenha um controle na mesma rodada

Medição sem controle não distingue "melhorou" de "o ambiente estava mais
rápido". Exemplos usados aqui:

- cache: 10 chamadas de `getSports` (1 consulta) **e** 10 de `getFavorites`
  (10 consultas) na mesma rodada
- autorização: mesmo cookie num endpoint que funciona **e** no que deve recusar

### 5.5 Guarda que nunca falha não vale nada

Ao escrever um teste que impede regressão, **plante a regressão** e confirme
que ele quebra. Foi assim com a varredura de `sql.raw`.

### 5.6 Conte statements para provar redução de idas ao banco

```bash
docker exec -i findsports_dev psql -U findsports_dev -d findsports_dev \
  -c "ALTER SYSTEM SET log_statement='all'" -c "SELECT pg_reload_conf()"
A=$(docker logs findsports_dev 2>&1 | grep -c 'execute <unnamed>')
# … exercite o caminho …
echo $(( $(docker logs findsports_dev 2>&1 | grep -c 'execute <unnamed>') - A ))
docker exec -i findsports_dev psql -U findsports_dev -d findsports_dev \
  -c "ALTER SYSTEM RESET log_statement" -c "SELECT pg_reload_conf()"
```

**Sempre reverta o log.** Deixar ligado é I/O em toda consulta.

---

## 6. Antes de dar uma tarefa por concluída

- [ ] `bun run check-types` limpo
- [ ] `bun test` sem falha
- [ ] `bunx biome check` sem aviso **novo** nos arquivos tocados
- [ ] número **antes** e **depois**, com controle na mesma rodada
- [ ] nenhum arquivo temporário deixado no repositório
- [ ] `log_statement` revertido; servidores de teste encerrados
- [ ] contagem de linhas conferida, se tocou no banco
- [ ] o que **não** foi verificado dito explicitamente

Este último importa mais do que parece. Nesta série, várias correções não
puderam ser medidas localmente — upload real, renderização do mapa, contagem de
re-renders, efeito da região em produção. Todas estão registradas como não
verificadas. **Dizer "não medi isso" preserva a confiança no resto.**

---

## 7. Armadilhas específicas deste repositório

| Armadilha | Consequência |
|---|---|
| Crase dentro de comentário SQL em template literal | fecha o template; erro de sintaxe confuso |
| `db:push` no banco de desenvolvimento, migrations em produção | os dois divergem; `migrate` local falha |
| `drizzle-kit push` recria índice removido só no SQL | mexa no schema **e** na migration |
| Coluna gerada precisa estar no schema Drizzle | senão `push` a apaga silenciosamente |
| `window` no corpo de componente | quebra a renderização no servidor |
| `t.procedure` sem o middleware base | procedimento sem log |
| Novo `WHEN` no `CASE` de recusa sem mapear em `RECORD_FAILURES` | vira `INTERNAL_SERVER_ERROR` |
| Listener no Pool do Neon | desliga o caminho HTTP e as conexões voltam |
| Cache de catálogo de 5 min | esporte novo demora até 5 min para aparecer |
| Cache de sessão de 60 s | banir ou trocar papel demora até 60 s |

---

## 8. Onde olhar quando algo estiver lento

1. **`pg_stat_statements`** (já instalada em produção) — qual consulta domina.
   Pelo MCP do Neon: listar queries lentas.
2. **Log estruturado** — procure `"slow":true` para achar o procedimento.
3. **`EXPLAIN (ANALYZE, BUFFERS)`** — `Seq Scan` com muitas linhas em
   `Rows Removed by Filter` é índice faltando.
4. **Contagem de statements por requisição** — se cresce com o tamanho da
   lista, tem consulta dentro de laço.
5. **`apps/web/scripts/load-test.k6.js`** — para saber se o p95 aguenta.

Nesta ordem. A primeira responde "onde" em segundos; as outras respondem
"por quê".
