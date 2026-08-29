# Spec — remediação thermo-nuclear da qualidade estrutural

> Revisão original: 12 de agosto de 2026
> Revalidação integral: 13 de agosto de 2026
> Estado: plano de remediação atualizado; nenhuma remediação implementada

## 1. Resumo executivo

Esta especificação registra e transforma em plano executável os achados da
auditoria `thermo-nuclear-code-quality-review` sobre as mudanças locais da branch
`refactor/redesign-other-pages`, comparadas ao `HEAD`/`origin/master` em
`5755d89`.

O redesign compila e melhora várias superfícies, mas ainda não atinge a barra de
aprovação estrutural. Os bloqueios não são cosméticos:

1. o frontend copiou a regra de limite do plano Starter, calculou um período
   diferente do backend e passou a bloquear criação com essa cópia divergente;
2. o enforcement de limite no backend continua sujeito a corrida porque conta e
   insere em etapas não atômicas;
3. o dashboard adicionou uma segunda camada de filtros/sugestões por meio de
   booleans e condicionais espalhadas, embora as specs da entrega proíbam novos
   filtros; alterações posteriores fizeram a rota crescer para 706 linhas e
   criaram props opcionais de query state que o único caller não conecta;
4. queries e decisões do painel do bar têm múltiplos owners na mesma árvore;
5. a rota de perfil continua com 1.200 linhas, dezenas de estados e casts, mesmo
   após uma reescrita extensa de 574 linhas;
6. mapa, shells, ícones esportivos, regras temporais e fundamentos visuais
   ganharam abstrações paralelas ou fronteiras frouxas em vez de uma fonte
   canônica;
7. `bun run check-types` reporta sucesso sem verificar o app web nem quase todos
   os packages.

A correção deve aplicar “code judo”: apagar a camada nova de sugestões, tornar o
backend a única autoridade de criação de eventos, reduzir owners e estados,
extrair fronteiras tipadas e decompor somente os módulos que concentram
complexidade real. Um lock da própria linha do bar substitui a proposta anterior
de advisory lock; um estado derivado e discriminado substitui a árvore de
booleans do dashboard. Não fazer um rewrite do produto e não alterar a direção
visual aprovada.

## 2. Baseline verificado

Na revalidação de 13 de agosto de 2026:

- base da branch: `5755d89` (`origin/master`);
- escopo tracked contra `HEAD`: 55 arquivos, 4.117 inserções e 3.248 remoções;
- novos módulos relevantes: `components/app/internal-shell.tsx`,
  `components/brand/*` e `styles/onside-foundations.css`;
- `routes/(dashboard)/dashboard_.profile.tsx`: 1.306 → 1.200 linhas;
- `routes/(dashboard)/dashboard.tsx`: 706 linhas depois das alterações
  posteriores à primeira auditoria;
- `components/dashboard/search-filter-bar.tsx`: 325 linhas;
- `components/landing/onside-landing.tsx`: 1.105 → 1.064 linhas;
- `styles/onside-foundations.css`: arquivo novo com 842 linhas;
- `bun run build`: passa para client e SSR; o chunk client principal mede
  832,55 kB minificado e mantém o warning acima de 500 kB;
- `bun run check-types`: aparenta passar, mas executa somente
  `packages/ui:check-types`;
- `bunx tsc -p apps/web/tsconfig.json --noEmit`: alcança o grafo real e falha no
  import não usado `subscription` em `packages/api/src/routers/pub.ts`;
- Biome focado nos quatro arquivos de dashboard alterados depois da spec falha
  por formatação em `dashboard.tsx`/`search-filter-bar.tsx` e reporta duas
  non-null assertions em `dashboard.tsx:239-240`;
- `git diff --check`: passa.

Nenhum arquivo cruzou de menos de 1.000 para mais de 1.000 linhas nesta branch.
Ainda assim, a reescrita de metade da rota de perfil sem decompor o arquivo de
1.200 linhas é uma oportunidade estrutural perdida e precisa ser corrigida. A
landing permanece fora da decomposição desta entrega porque seu arquivo já era
maior que 1.000 linhas e recebeu apenas alterações pequenas de integração de
marca.

### 2.1. Delta posterior à primeira versão da spec

Os quatro arquivos de dashboard reabertos após a auditoria foram
`routes/(dashboard)/dashboard.tsx`, `components/dashboard/search-filter-bar.tsx`,
`components/dashboard/dashboard-hero.tsx` e
`components/dashboard/bar-results-header.tsx`. A revalidação encontrou:

- a rota consulta esportes apenas como `data ?? []`, mas não passa loading,
  error nem retry para `SearchFilterBar`;
- `SearchFilterBar` tornou esses estados opcionais com defaults de sucesso, de
  modo que o contrato permite representar erro/loading como lista vazia;
- a rota não modela erro das queries primária nem de fallback e pode renderizar
  empty state em uma falha de rede;
- `onChampionshipCommit` é opcional, não é fornecido pelo único caller e ainda
  intercepta Enter sem executar uma ação produtiva;
- dois empty states praticamente idênticos continuam em branches separados;
- o alinhamento desktop do mapa duplica invisivelmente o markup de
  `BarResultsHeader`, acoplando layout à altura incidental de outro componente;
- os filtros/sugestões proibidos continuam presentes e a rota chegou a 706
  linhas.

Esse delta não cria uma décima frente. Ele amplia F2: o dashboard deve perder
complexidade e ganhar um modelo honesto de estado remoto durante a mesma
remediação por deleção.

## 3. Resultado obrigatório

Ao final da implementação desta spec:

- toda decisão sobre permissão/limite de criar evento vem de uma policy
  calculada pelo backend e usada também dentro da mutation;
- duas criações concorrentes nunca ultrapassam o limite Starter;
- o dashboard possui somente os filtros produtivos anteriores: esporte,
  campeonato e raio;
- não existem `favoritesOnly`, `gamesTodayOnly`, `applySuggestion` nem a seção
  “Sugestões para você”/“Talvez você queira experimentar”;
- loading, error, retry, empty e ready do dashboard são derivados das queries
  reais; nenhuma prop opcional converte falha em sucesso aparente;
- a rota do dashboard fica abaixo de 400 linhas, sem empty states duplicados nem
  cópia invisível do cabeçalho para obter alinhamento;
- a rota admin é o único owner de bar, eventos, assinatura e policy de criação
  naquela página; descendentes recebem dados tipados;
- a rota de perfil fica abaixo de 400 linhas e atua como composição/orquestração,
  sem concentrar toda a renderização;
- respostas tRPC são inferidas do `AppRouter`, sem modelos manuais paralelos nem
  `any[]` para favoritos/eventos e sem fabricar registros inválidos no cache
  otimista por meio de casts;
- o mapa aceita somente acentos semânticos, não possui `occupancy` fictício nem
  aliases legados, e sua integração imperativa é tipada e isolada;
- fontes e tokens Onside possuem uma única definição; CSS do app é dividido por
  responsabilidade;
- shells compartilham o frame e o fluxo de logout, sem duplicar a estrutura
  inteira nem transformar `AppShell` em um componente genérico mágico;
- `bun run check-types` verifica todos os workspaces TypeScript relevantes e
  falha quando qualquer um deles falha;
- build, testes focados, Biome, diff hygiene e tour visual passam.

## 4. Invariantes e limites

### 4.1. Preservar

- autenticação, guards, ownership e roles atuais;
- nomes, inputs e respostas dos endpoints existentes, exceto pela adição
  explícita de `pub.getMyEventCreationPolicy`;
- mutations de criar, editar e excluir evento e seus payloads públicos;
- cache keys existentes e optimistic updates de favoritos;
- analytics existentes e seus gatilhos válidos;
- rotas, redirects, upload, billing, Google Maps e geolocalização;
- aparência e comportamento aprovados nas specs de redesign, salvo a remoção da
  camada de sugestões não autorizada;
- Reicon como biblioteca de ícones de apresentação;
- compatibilidade SSR e `prefers-reduced-motion`.

### 4.2. Autorizado por esta remediação

- adicionar uma query tRPC read-only para expor a policy canônica de criação de
  eventos;
- mover a checagem da mutation para dentro da mesma transação da inserção;
- adicionar lock transacional por bar para tornar count + insert atômicos;
- adicionar `@types/google.maps` como devDependency, sem novo runtime loader;
- criar módulos de domínio/presentação e testes puros;
- dividir CSS e componentes grandes;
- remover props, branches, styles e abstrações mortos;
- adicionar scripts `check-types` aos workspaces que têm `tsconfig.json`.

### 4.3. Fora de escopo

- migration ou alteração de schema;
- novo plano, preço, permissão ou regra comercial;
- reescrever todos os routers em um endpoint agregado;
- trocar React Query, tRPC, Better Auth, Dodo ou Google Maps;
- criar novos filtros, paginação ou recomendações;
- decompor a landing inteira;
- refatorar arquivos não tocados só para uniformidade;
- executar teste que escreve no banco sem `DATABASE_URL` descartável e isolada.

## 5. Achados priorizados e decisões

### F1 — P0: policy de limite duplicada, divergente e não atômica

#### Evidência

- `routes/admin.tsx:52-59` calcula o início do período subtraindo exatamente 30
  dias;
- `packages/api/src/routers/pub.ts:33-45` subtrai um mês de calendário quando há
  `currentPeriodEnd` e usa 30 dias apenas no fallback;
- `routes/admin.tsx:175-190` deriva `isAtLimit` no cliente;
- `components/admin/events-manager.tsx:43-63` transforma essa derivação em
  `createBlocked` e desabilita a ação;
- `packages/api/src/routers/pub.ts:201-214` valida o limite antes da transação;
  a inserção começa depois, permitindo que duas requests concorrentes leiam a
  mesma contagem e ambas insiram.

#### Decisão

Criar uma única policy server-side, usada tanto pela query de UI quanto pela
mutation. A mutation deve recalcular a policy dentro da transação, depois de
adquirir lock pessimista na linha canônica do bar, e inserir o evento na mesma
transação.

Contrato proposto:

```ts
type EventCreationPolicy =
  | {
      status: 'inactive'
      canCreate: false
      plan: 'starter' | 'pro' | 'elite'
    }
  | {
      status: 'limited'
      canCreate: boolean
      plan: 'starter'
      limit: number
      used: number
      remaining: number
      periodStart: string
      periodEnd: string | null
    }
  | {
      status: 'unlimited'
      canCreate: true
      plan: 'pro' | 'elite'
    }
```

Implementar `pub.getMyEventCreationPolicy` sem remover endpoints existentes.
Extrair `STARTER_EVENT_LIMIT`, cálculo do período, contagem e montagem do modelo
para `packages/api/src/lib/event-creation-policy.ts`.

Na mutation `createEvent`:

1. abrir transação;
2. selecionar a linha do bar do `userId` autenticado com `FOR UPDATE` dentro do
   `tx`; esse row lock serializa creates concorrentes do mesmo bar sem hash,
   namespace ou risco de colisão de advisory lock;
3. carregar/revalidar a assinatura dentro da mesma transação;
4. calcular a policy com o mesmo executor transacional;
5. rejeitar `inactive` ou `limited && !canCreate` com o erro atual;
6. inserir evento e participantes;
7. finalizar tudo atomicamente.

Não confiar na policy previamente lida pelo cliente. Ela é feedback; a mutation
continua sendo a autoridade final.

O helper deve receber explicitamente o executor (`db` ou `tx`) e usar agregação
tipada do Drizzle para a contagem. Não manter `result.rows[0] as any`, e não
chamar um `getBarByUserId` fechado sobre o `db` global a partir da transação.

Não implementar `pg_advisory_xact_lock` nem derivar uma chave numérica do
`userId`: a própria linha do bar já é o recurso que precisa ser serializado. A
query read-only pode usar `db`; a mutation deve provar por teste que bar,
assinatura, contagem e insert usam `tx` após o row lock.

O cálculo do início do período deve preservar a semântica mensal atual sem usar
`Date#setMonth` diretamente, que produz rollover incorreto em fins de mês. Criar
uma função pura de subtração mensal com clamp do dia (`31/03` → `28/02` ou
`29/02`; `31/05` → `30/04`) e fixar UTC/semântica de timestamp nos testes. Não
misturar novamente “mês de cobrança” com rolling window de 30 dias.

Após create/delete, invalidar `getMyEvents` e
`getMyEventCreationPolicy`. Em policy loading/error, não inventar Starter nem
contagem. Mostrar estado verificável e retry; a ação só fica disponível quando a
policy estiver pronta e `canCreate` for verdadeiro.

### F2 — P0: dashboard cresceu uma máquina de filtros e estados remotos falsa

#### Evidência

- `routes/(dashboard)/dashboard.tsx:71-386` concentra geolocalização, quatro
  queries, duas mutations otimistas, fallback, sort, filtros, chips, sugestões,
  analytics e uma árvore de booleans dentro da mesma função;
- `routes/(dashboard)/dashboard.tsx:87-88,245-259,297-308,327-362` mantém
  `favoritesOnly`, `gamesTodayOnly` e `applySuggestion` espalhados por estado,
  seleção, reset e dispatcher;
- `routes/(dashboard)/dashboard.tsx:141-165` descarta estados de erro de esportes
  e das duas buscas; `:396-408` não conecta os estados de sports que o filho
  oferece;
- `components/dashboard/search-filter-bar.tsx:34-47,69-84` declara cinco props
  opcionais para estados/callbacks que são obrigatórios na única composição e
  usa defaults que mascaram ausência de dados;
- `components/dashboard/search-filter-bar.tsx:116-120` mantém
  `onChampionshipCommit` opcional, mas o caller não o fornece;
- `routes/(dashboard)/dashboard.tsx:464-568` duplica quase todo o empty state em
  branches booleanos diferentes;
- `routes/(dashboard)/dashboard.tsx:598-669` mantém a seção de sugestões fora de
  escopo;
- `routes/(dashboard)/dashboard.tsx:673-683` copia invisivelmente título e
  contagem de `BarResultsHeader` apenas para produzir espaçamento;
- `specs/onside-app-ui-consistency-audit.md:161` declara novos filtros fora do
  escopo;
- `specs/onside-app-pages-redesign.md:610-635` exige manter callbacks/values e
  não alterar quando a query roda.

#### Decisão

Aplicar a simplificação por deleção e tornar a rota uma composition root:

- remover `favoritesOnly`, `gamesTodayOnly`, `displayed`, `futebolSport`,
  `basqueteSport`, `applySuggestion` e toda a seção “Sugestões para você”;
- mapear lista e mapa diretamente de `sorted`, como antes da adição;
- manter somente `sportId`, `championship` e `radiusKm`;
- remover imports de ícones que ficarem sem uso;
- manter favoritos como ação do card, não como novo filtro;
- manter o analytics já ligado ao snapshot da busca; remover
  `onChampionshipCommit` se não houver um gatilho produtivo distinto.

Derivar um único `DiscoveryResultState` puro, sem reducer e sem novo estado React:

```ts
type DiscoveryResultState =
  | { status: 'loading' }
  | { status: 'error'; source: 'primary' | 'fallback' }
  | { status: 'location-required' }
  | { status: 'empty'; radiusKm: RadiusKm }
  | { status: 'ready'; bars: SearchBar[]; fallback: boolean }
```

- o selector recebe snapshots das queries primária/fallback e da localização;
- erro da query necessária nunca vira `empty` ou lista vazia;
- fallback só é `ready` depois da query de fallback resolver;
- `SearchFilterBar` recebe `sportsState` discriminado e obrigatório
  (`loading | error | ready`), em vez de `sports=[]` mais três props opcionais;
- `locationState` e `onRequestLocation` tornam-se obrigatórios enquanto esse
  controle existir no componente;
- a rota deve mapear `source` para o retry real da query correspondente e
  renderizar um único componente de resultado/empty state;
- montar o layout desktop com grid rows/areas: header na célula esquerda da
  primeira linha e resultados/mapa na segunda. Não duplicar conteúdo invisível
  nem medir altura via markup incidental;
- extrair `dashboard-selectors.ts` para seleção primária/fallback, ordenação e
  adaptação de mapa; extrair `dashboard-results.tsx` apenas para os estados de
  resultado. Queries, mutations e analytics permanecem na rota.

Não substituir os booleans por reducer/state machine: isso apenas reorganizaria
complexidade que não deveria existir. O discriminated union acima é saída
derivada das queries, não mais uma máquina de estado armazenada.

Metas específicas:

- `dashboard.tsx` ≤ 400 linhas;
- `search-filter-bar.tsx` ≤ 300 linhas depois de importar os contratos canônicos
  de discovery/esportes;
- cada estado de resultado possui um único branch de renderização;
- zero props opcionais usadas para esconder lifecycle de query;
- zero non-null assertions nos selectors e na rota.

### F3 — P1: ownership duplicado no painel do bar

#### Evidência

- `routes/admin.tsx:134-154` consulta bar, eventos e assinatura;
- `components/admin/events-manager.tsx:60-63` consulta eventos novamente;
- `components/admin/bar-preview.tsx:24-38` consulta eventos e assinatura
  novamente, mesmo recebendo `plan` do pai;
- o preview usa cast e fallback Starter para reconciliar duas fontes possíveis.

#### Decisão

`routes/admin.tsx` será o owner único do estado remoto da página:

- manter no route as queries `getMe`, `getMyEvents`, `getMySubscription` e a nova
  `getMyEventCreationPolicy`;
- passar para `EventsManager` um estado discriminado de eventos e a policy;
- `EventsManager` continua owner de modal, draft e mutations de evento, mas não
  refaz `getMyEvents`;
- passar eventos e plano resolvido para `BarPreview`; tornar o preview
  apresentacional e remover `useTRPC`/`useQuery` dele;
- nenhuma prop opcional deve significar “se ausente, faça outra query”. Ou o pai
  fornece o dado obrigatório, ou fornece um estado discriminado explícito;
- mutations invalidam as queries mantidas pelo route e seus filhos recebem o
  novo snapshot por props.

Não criar `getAdminDashboard` nesta etapa. Um endpoint agregado adicionaria uma
migração maior sem ser necessário para remover os owners duplicados.

### F4 — P1: rota de perfil continua sendo um componente monolítico e cast-heavy

#### Evidência

- `routes/(dashboard)/dashboard_.profile.tsx` possui 1.200 linhas;
- `:90-196` concentra tabs, edição, geolocalização, queries e mutations;
- `:215-295` achata resultados tipados por meio de `any[]`, callbacks `any` e
  mapas `Map<string, any[]>`;
- `:938-1140` mantém todo o workflow de configurações dentro da mesma função.

#### Decisão

Manter a rota como composition root e extrair blocos coesos para
`components/profile/`:

- `profile-model.ts`: aliases derivados de
  `inferRouterOutputs<AppRouter>` e view models explícitos;
- `profile-selectors.ts`: funções puras para progresso, próximos eventos,
  ordenação/filtro de favoritos, agrupamento por cidade e adaptação para mapa;
- `profile-header.tsx`: avatar, edição de nome e resumo da conta;
- `profile-tabs.tsx`: tablist, teclado e seleção;
- `profile-overview.tsx`: progresso, métricas e próximos jogos;
- `profile-favorites.tsx`: controles, lista/mapa e remoção;
- `profile-settings.tsx`: esportes, raio e logout.

A rota permanece owner de queries, mutations, navegação, analytics e estado de
workflow. Os componentes recebem valores e comandos tipados; não importam tRPC
nem Better Auth. Não criar um único `useProfileController` gigante que apenas
mova as 1.200 linhas para outro arquivo.

Metas de decomposição:

- route ≤ 400 linhas;
- cada componente extraído ≤ 300 linhas;
- selectors puros ≤ 200 linhas;
- zero `any`/`any[]` em route, model e selectors;
- casts permitidos apenas quando estreitam uma fronteira validada e com
  comentário específico.

Adicionar testes puros para ordenação, evento seguinte, filtro com eventos e
agrupamento por cidade. Datas devem usar relógio injetável (`now`) para evitar
testes dependentes do horário real.

### F5 — P1: integrações externas vazam estado e `any` para componentes de rota

#### Evidência

- `components/app/google-map.tsx:4-79` declara `window.google: any`, callback
  global, promise e flag de falha mutáveis no módulo;
- `:132-298` concentra cinco refs imperativos, três effects acoplados e supressão
  global de exhaustive dependencies;
- `MapBar.accent` mantém seis valores para suportar aliases legados;
- `occupancy` é sempre `0` nos quatro call sites, mas mantém branch, SVG e
  semântica de “hot” mortos;
- `routes/admin_.billing.tsx:123,136,362` faz cast de todo o client Dodo e de
  cada pagamento para `any`, deixando a route responsável por descobrir o
  formato de uma integração externa.

#### Decisão

- adicionar `@types/google.maps` como devDependency de `apps/web` e incluir o
  tipo no tsconfig;
- extrair loader/retry para `lib/google-maps-loader.ts`, com uma única promise
  explícita e função `resetGoogleMapsLoader()` testável;
- identificar/reusar um único `<script>`, limpar callback global e handlers após
  resolve/reject, e impedir que retries acumulem scripts concorrentes;
- não adicionar loader runtime de terceiro;
- tipar `Map`, `Marker`, `Circle` e listener handles;
- remover o ignore global de exhaustive dependencies; usar callbacks estáveis ou
  refs de callback apenas onde a API imperativa exigir;
- remover listeners e objetos do mapa no cleanup;
- reduzir `MapBar.accent` para `'live' | 'acid' | 'ink'`;
- migrar o último caller `orange` para `live` e apagar aliases;
- remover `occupancy`, argumento `hot` e o indicador SVG morto;
- mover `isValidCoordinate`, fallback geográfico e raio/zoom para o contrato
  canônico de descoberta descrito em F6;
- manter loader status, retry, marker hover/select, user dot e radius circle.

Para Dodo:

- criar `lib/dodo-customer-client.ts` como boundary adapter mínimo para
  `payments.list` e `portal`;
- preferir os tipos inferidos/exportados pelo plugin. Se a versão instalada não
  expuser o contrato adequadamente, conter uma única passagem `unknown` → tipo
  validado no adapter, nunca `any` na route;
- validar/normalizar ali somente `payment_id`, `status`, `total_amount`,
  `created_at` e `portal.url` usados pela UI;
- `admin_.billing.tsx` consome resultados discriminados e não conhece detalhes
  do shape cru do plugin.

### F6 — P1: contratos pequenos e recorrentes não têm fonte canônica

#### Evidência

- a regra de evento “ao vivo por três horas” aparece em route admin, dashboard,
  pub público, event row, event manager, preview e bar card;
- `[1, 3, 5, 10]`, `RadiusKm`, fallback de São Paulo e `LocationState` aparecem
  em módulos diferentes;
- dashboard e onboarding mantêm mapas separados de ícones esportivos;
- `SportSelector` recebe `iconMap`/`textMap` opcionais de seu único caller,
  enquanto outro componente recria a mesma decisão;
- `routes/(dashboard)/dashboard.tsx:45-69` mantém `ApiBar`/`ApiEvent` manuais e
  `:221-225` força os dois outputs de busca para esse formato por casts;
- `routes/(dashboard)/dashboard.tsx:180-187` fabrica um item de favoritos com
  `userId: ''` e cast para caber no cache rico de `getFavorites`, violando o
  formato real da query para obter optimistic UI.

#### Decisão

Criar fontes canônicas pequenas e diretas:

- `domain/events.ts`:
  - `LIVE_WINDOW_MS`;
  - `getEventTemporalState(startsAt, now)` retornando
    `'upcoming' | 'live' | 'past'`;
  - comparadores puros necessários pelos call sites;
- `domain/discovery.ts`:
  - `SEARCH_RADII`, `RadiusKm`, `DEFAULT_RADIUS_KM`;
  - `SAO_PAULO_FALLBACK`;
  - `LocationState`;
  - `isValidCoordinate`;
- `components/sports/sport-icon.tsx`:
  - mapping único slug → Reicon ou fallback textual;
  - API concreta `SportIcon`, sem injeção genérica de registry.

Além disso:

- derivar `SearchBar`, `Favorite` e demais outputs de
  `inferRouterOutputs<AppRouter>`; view models só existem quando realmente
  transformam o modelo e são construídos por selector tipado;
- remover `ApiBar`/`ApiEvent` paralelos e os casts de `barsData`/
  `locationBarsData`;
- não inserir objeto estruturalmente falso no cache de `getFavorites`. Para o
  dashboard, representar o optimistic state como overlay de IDs pendentes sobre
  `favoriteIds` e invalidar a query no settle; o cache rico continua contendo
  somente respostas válidas do endpoint;
- compartilhar a mesma primitive de optimistic favorite IDs entre dashboard e
  perfil se ambos mantiverem o mesmo comportamento, sem criar um hook-controller
  que esconda as mutations inteiras.

Atualizar consumidores para importar os contratos. Não centralizar formatadores
de texto que sejam realmente específicos de uma tela; a meta é unificar
semântica, não criar um `utils.ts` genérico.

### F7 — P1: fundamentos visuais paralelos e monolito CSS novo

#### Evidência

- `components/landing/onside.css:1-199` declara fonts, tokens e base da landing;
- `styles/onside-foundations.css:1-160` repete as mesmas fonts, tokens e parte do
  reset para o app;
- o novo foundations possui 842 linhas e mistura tokens, primitives, shell,
  admin, mapa, eventos, dialogs e motion;
- `index.css` mantém uma terceira primitive de input hard-coded (`admin-input`)
  ao lado de `.onside-input`;
- há helpers novos sem nenhum consumidor: `onside-btn-danger`,
  `onside-btn-icon`, `onside-divider`, `onside-kicker-live` e
  `onside-text-live`.

#### Decisão

Reorganizar sem alterar pixels intencionalmente:

- `styles/onside/tokens.css`: `@font-face` uma única vez e tokens comuns em
  `:where(.onside-page, .onside-app)`;
- cada root mantém apenas overrides próprios, por exemplo altura do header e
  gutter;
- `styles/onside/app-primitives.css`: typography helpers, buttons, panels,
  forms, choices, badges e callouts;
- `styles/onside/app-layouts.css`: shell, admin, mapa, event row, stats, dialog e
  sticky offsets;
- `styles/onside/app-motion.css`: keyframes, hover capability e reduced motion;
- `styles/onside/app.css`: aggregator com imports explícitos;
- `index.css` importa o aggregator e deixa de definir `admin-input`;
- migrar consumidores ativos de `admin-input` para a primitive Onside correta;
- remover helpers sem consumidor em vez de mantê-los “para talvez usar”.

`components/landing/onside.css` continua owner exclusivo do layout da landing,
mas remove fonts/tokens duplicados. Não converter toda a landing para utilities
nem fundir seus 2.900 estilos com o app.

### F8 — P2: shells repetem estrutura e política de conta

#### Evidência

- `components/app/app-shell.tsx:34-275` mistura frame, sessão, logout, três
  booleans de variante e navegação específica;
- o novo `components/app/internal-shell.tsx:17-95` repete root, skip link,
  brand/header, logout e main container.

#### Decisão

- extrair `components/app/product-frame.tsx` somente para a estrutura estável:
  root `.onside-app`, skip link, header container e `<main>`;
- extrair `hooks/use-sign-out.ts` para o fluxo compartilhado analytics → Better
  Auth → navegação;
- `AppShell` continua owner do account menu e resolve sua navegação com `switch`
  ou configuração tipada por variante, em vez de três flags paralelas;
- `InternalShell` continua owner de título/back link, compondo o frame;
- não criar um shell universal com dezenas de props booleanas/slots;
- preservar exatamente os links permitidos para fan, pub, sessão pública e
  visitante.

### F9 — P0: gate de tipos verde não verifica a branch

#### Evidência

- `turbo.json` define `check-types`, mas somente `packages/ui/package.json`
  possui o script;
- web, api, auth, db e env têm `tsconfig.json` e nenhum script;
- o comando root executa uma única task e termina verde;
- TypeScript direto encontra erro em API que o gate esconde.

#### Decisão

- adicionar `"check-types": "tsc --noEmit"` em `apps/web`, `packages/api`,
  `packages/auth`, `packages/db` e `packages/env`;
- manter o script já existente em `packages/ui`;
- não adicionar script a `packages/config` enquanto não houver tsconfig próprio;
- remover o import não usado `subscription` de `packages/api/src/routers/pub.ts`;
- exigir no aceite que Turbo liste e execute seis tasks, sem cache mascarando a
  primeira validação local (`turbo check-types --force` ou equivalente);
- manter `skipLibCheck` como está nesta entrega; o objetivo é verificar código do
  repo, não abrir uma migração de typings externos.

### 5.1. Disposição da revalidação

| Finding | Estado atual | Mudança em relação à spec original |
| --- | --- | --- |
| F1 | Aberto, bloqueador | Trocar advisory lock proposto por row lock canônico; explicitar clamp mensal |
| F2 | Aberto, bloqueador e ampliado | Incorporar o delta posterior do dashboard, estados remotos, duplicação visual e meta ≤ 400 linhas |
| F3 | Aberto | Sem mudança de direção; queries duplicadas permanecem |
| F4 | Aberto | Sem mudança material; profile permanece com 1.200 linhas e casts abundantes |
| F5 | Aberto | Explicitar cleanup/idempotência do Maps loader e adapter tipado de Dodo |
| F6 | Aberto e ampliado | Remover modelos manuais/casts e registro falso no cache otimista do dashboard |
| F7 | Aberto | Foundations permanece monolítico em 842 linhas e fontes/tokens continuam duplicados |
| F8 | Aberto | Shell/logout continuam com owners paralelos |
| F9 | Aberto, bloqueador | Root typecheck segue verde com apenas 1 de 7 packages executado |

Resultado da skill: **o código atual não está aprovado para merge; esta spec está
pronta para implementação**. F1, F2 e F9 são bloqueadores presumptivos; F3–F8
são dívida estrutural de alta convicção que deve ser encerrada na sequência
descrita abaixo, sem transformar a remediação em rewrite horizontal.

## 6. Matriz de arquivos

| Área | Arquivos principais | Ação |
| --- | --- | --- |
| Policy de eventos | `packages/api/src/routers/pub.ts` | Consumir policy canônica dentro de query e mutation atômica com row lock do bar |
| Policy de eventos | `packages/api/src/lib/event-creation-policy.ts` | Novo módulo de regra, período, contagem e modelo |
| Admin | `apps/web/src/routes/admin.tsx` | Owner único das queries e composição |
| Admin | `components/admin/events-manager.tsx` | Remover query duplicada; consumir policy/event state |
| Admin | `components/admin/bar-preview.tsx` | Tornar apresentacional e remover fallbacks/query/casts |
| Dashboard | `routes/(dashboard)/dashboard.tsx` | Composition root ≤ 400 linhas; apagar sugestões e conectar query states reais |
| Dashboard | `components/dashboard/search-filter-bar.tsx` | Remover optionality/dead callback e consumir `sportsState` discriminado |
| Dashboard | `components/dashboard/dashboard-results.tsx` | Um renderer para loading/error/location/empty/ready e grid sem spacer invisível |
| Dashboard | `domain/dashboard-selectors.ts` | Derivar fallback, ordenação, result state e mapa sem casts |
| Perfil | `routes/(dashboard)/dashboard_.profile.tsx` | Reduzir para composition root |
| Perfil | `components/profile/*` | Novos componentes/model/selectors focados |
| Domínio web | `domain/events.ts`, `domain/discovery.ts` | Fontes canônicas pequenas |
| Esportes | `components/sports/sport-icon.tsx` | Registry visual único e concreto |
| Mapa | `components/app/google-map.tsx` | React/lifecycle tipado e menor |
| Mapa | `lib/google-maps-loader.ts` | Loader/retry isolado, idempotente e com cleanup global |
| Billing | `routes/admin_.billing.tsx`, `lib/dodo-customer-client.ts` | Tirar `any` da route e conter fronteira do plugin |
| Shell | `components/app/product-frame.tsx`, shells atuais | Compartilhar frame sem universalizar UI |
| Logout | `hooks/use-sign-out.ts` | Fluxo único de signout |
| CSS | `styles/onside/*`, landing CSS, `index.css` | Unificar tokens/fonts e decompor app CSS |
| Gates | package manifests com tsconfig | Adicionar scripts check-types |

## 7. Sequência de implementação

### Fase 1 — tornar os gates honestos

1. adicionar scripts `check-types`;
2. remover o import API não usado;
3. executar todos os typechecks e registrar baseline;
4. não avançar deixando novos erros escondidos.

### Fase 2 — corrigir atomicidade e fonte de verdade

1. extrair e testar `event-creation-policy`;
2. adicionar query read-only;
3. tornar create count + insert atômico com `FOR UPDATE` na linha do bar;
4. adicionar teste concorrente em banco descartável;
5. conectar admin e invalidations à nova policy;
6. remover cálculo de 30 dias e constants duplicadas do cliente.

### Fase 3 — simplificar dashboard por deleção

1. remover sugestões e estados relacionados;
2. remover tipos paralelos e o registro falso do cache de favoritos;
3. criar/importar contratos de discovery e sport icon;
4. derivar `DiscoveryResultState` das queries primária/fallback;
5. substituir props opcionais do filtro por `sportsState` discriminado;
6. conectar loading/error/retry de sports, busca, fallback e favoritos;
7. colapsar empty states duplicados e remover o spacer invisível via CSS Grid;
8. extrair selectors/result renderer até a rota ficar ≤ 400 linhas;
9. manter lista/mapa derivados da mesma coleção.

### Fase 4 — corrigir ownership do admin e tipos de fronteira

1. passar eventos/plano/policy pelo route;
2. tornar BarPreview puro;
3. inferir outputs tRPC para eventos/bar/favoritos;
4. criar adapter tipado de Dodo e retirar `any` da billing route;
5. centralizar temporal state sem alterar a janela atual.

### Fase 5 — decompor perfil

1. extrair model/selectors com testes;
2. extrair header, tabs, overview, favorites e settings;
3. manter queries/mutations/analytics na composition root;
4. confirmar targets de tamanho e ausência de casts frouxos.

### Fase 6 — limpar fronteira do mapa

1. adicionar types;
2. extrair loader;
3. remover aliases/occupancy;
4. tipar refs e listeners;
5. garantir cleanup e retry;
6. repetir cenários de mapa em dashboard, favoritos, pub e preview.

### Fase 7 — consolidar shell e CSS

1. extrair ProductFrame e useSignOut;
2. simplificar variant navigation;
3. centralizar fonts/tokens;
4. dividir primitives/layouts/motion;
5. remover `admin-input` e helpers mortos;
6. comparar visualmente antes/depois em todas as rotas afetadas.

## 8. Testes obrigatórios

### 8.1. Unitários puros

- policy Starter com 0, 4 e 5 eventos;
- policy Pro/Elite ilimitada;
- início de período com clamp para 31 de março, 31 de maio, fevereiro bissexto e
  virada de ano, em UTC;
- `DiscoveryResultState`: loading primário, erro primário, loading de fallback,
  erro de fallback, location-required, empty e ready nos modos normal/fallback;
- ordenação e adaptação de mapa sem non-null assertion;
- overlay otimista de favorite IDs em add/remove concorrentes, sem escrever
  registro falso no cache rico;
- temporal state antes, durante e depois da janela de três horas;
- sort/filtro/group selectors do perfil;
- coordinate validation e radius mapping;
- loader Maps: primeira carga, concorrência de callers, erro, reset e retry;
- adapter Dodo: payload válido, payload ausente/malformado e portal sem URL.

### 8.2. Integração de API

Executar somente com banco descartável comprovado:

- bar inativo recebe `FORBIDDEN` sem inserir;
- Starter com quatro eventos dispara duas creates concorrentes: exatamente uma
  passa, uma falha e o total final é cinco;
- policy lida depois de create/delete reflete a mesma contagem da mutation;
- Pro/Elite não adquire comportamento limitado;
- falha na inserção de participantes faz rollback do evento.

### 8.3. Componentes e interação

- botão “Novo evento” cobre loading, erro, limited disponível, limite atingido,
  unlimited e mutation error;
- dashboard não renderiza sugestões nem filtros novos;
- sports loading/error/retry/empty vêm da query real e não podem ser omitidos
  pelo caller;
- falha da busca primária ou fallback renderiza erro/retry, nunca empty state;
- dashboard tem um único renderer de empty state e não possui cópia invisível
  do cabeçalho;
- profile tabs mantêm teclado, analytics e painéis;
- mapa mantém retry, marker selection, hover, user location e radius;
- shells preservam links por role e logout.

### 8.4. Tour visual

Repetir a matriz existente em `specs/qa/viewport-matrix.json` para:

- `/dashboard`;
- `/dashboard/profile` em todas as tabs;
- `/admin` com Starter normal, próximo do limite, limite e erro;
- `/admin/billing`;
- `/pub/$pubId` autenticado e visitante;
- `/internal`, waitlist e manage-users.

Cobrir 320, 390 e 1440 px, zoom 200%, teclado, reduced motion, banner de
impersonação e textos longos. Build/SSR não substitui essa validação visual.

## 9. Gates de aceite

Todos são obrigatórios:

```bash
bun run check-types
bun run build
bun test apps/web/src/domain apps/web/src/lib \
  apps/web/src/components/dashboard apps/web/src/components/profile \
  packages/api/src/lib
bunx biome check apps/web/src packages/api/src \
  apps/web/package.json packages/api/package.json packages/auth/package.json \
  packages/db/package.json packages/env/package.json
git diff --check
```

Aceite estático adicional:

```bash
rg -n "favoritesOnly|gamesTodayOnly|applySuggestion|Sugestões para você|Talvez você queira experimentar" apps/web/src
rg -n "onChampionshipCommit|sportsLoading\?|sportsError\?|onside-display invisible" \
  apps/web/src/routes/\(dashboard\)/dashboard.tsx \
  apps/web/src/components/dashboard
rg -n "accent: '(orange|blue|black)'|occupancy" apps/web/src
rg -n "function isLive|LIVE_WINDOW_MS|RADIUS_OPTIONS|type LocationState" apps/web/src
rg -n "getMyEvents.queryOptions|getMySubscription.queryOptions" apps/web/src/components/admin
rg -n "\bany\b|as any|any\[\]" \
  apps/web/src/routes/\(dashboard\)/dashboard_.profile.tsx \
  apps/web/src/routes/\(dashboard\)/dashboard.tsx \
  apps/web/src/domain/dashboard-selectors.ts \
  apps/web/src/components/profile \
  apps/web/src/components/app/google-map.tsx \
  apps/web/src/routes/admin_.billing.tsx
```

Resultados esperados:

- primeira busca: zero ocorrências;
- segunda busca: zero ocorrências;
- terceira busca: zero ocorrências, salvo texto de documentação;
- quarta busca: definições somente nos módulos canônicos;
- quinta busca: zero queries nos componentes admin; queries ficam no route;
- sexta busca: zero `any` nas superfícies listadas. Se a tipagem do Better Auth
  exigir contenção, ela pode existir apenas no adapter Dodo, documentada e
  validada na saída.

Metas de tamanho:

- profile route ≤ 400 linhas;
- dashboard route ≤ 400 linhas;
- `SearchFilterBar` ≤ 300 linhas;
- `GoogleMap` ≤ 220 linhas após extrair loader/helpers;
- nenhum arquivo novo > 500 linhas;
- nenhum arquivo existente cruza 1.000 linhas;
- nenhum “refactor” conta como concluído se apenas mover a mesma função gigante
  para outro arquivo.

## 10. Critérios de não regressão

- criar/editar/excluir evento mantém payload e analytics;
- backend continua recusando ações não autorizadas independentemente do UI;
- dashboard mantém query args, fallback regional e limite 30;
- dashboard preserva a ordem de busca primária → fallback, mas nunca converte
  erro de qualquer etapa em resultado vazio;
- favorito mantém optimistic update, rollback e invalidation;
- perfil mantém upload, update de nome, raio, esportes e logout;
- mapa mantém URL, channel, providers e quatro contextos de uso;
- billing mantém portal, payment history e links de upgrade;
- landing e app mantêm os mesmos valores visuais dos tokens;
- nenhuma falha é convertida em fallback silencioso de plano, dados ou status.

## 11. Definição de pronto

Esta remediação só pode ser marcada como concluída quando:

1. F1–F9 estiverem implementados ou explicitamente rejeitados com justificativa
   arquitetural registrada;
2. a policy de eventos for única, server-side e atômica;
3. a complexidade de sugestões tiver sido deletada, não reorganizada, e o
   dashboard representar lifecycle remoto sem defaults opcionais mentirosos;
4. dashboard, perfil, mapa, shells e CSS estiverem abaixo dos limites e com
   owners claros;
5. o typecheck root provar que verificou seis workspaces;
6. todos os testes e gates passarem;
7. o tour visual for executado em browser conectado e documentado;
8. o diff final não incluir alterações funcionais fora desta spec.
