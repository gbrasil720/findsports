# Spec — analytics comerciais do bar e densidade do painel administrativo

## 1. Status e objetivo

**Status:** aprovado em grilling de produto; pronto para planejamento de
implementação, ainda não implementado.

Esta spec define a primeira versão das analytics próprias da Onside para bares,
o conteúdo final das abas de `apps/web/src/routes/admin.tsx`, a atribuição de
interesse por jogo, a apresentação das analytics nos planos e a infraestrutura
local de Postgres necessária para desenvolver e testar a entrega com segurança.

O resultado de produto que orienta toda a entrega é:

> Demonstrar, com dados comerciais confiáveis, que a Onside levou pessoas ao
> perfil do bar e gerou ações com intenção de visita.

O painel não deve ser preenchido com cards decorativos para parecer mais cheio.
Cada bloco precisa responder a uma pergunta do dono do bar ou conduzir uma ação.

## 2. Decisões fechadas no grilling

1. A prioridade desta fase são visitas e ações de alta intenção.
2. Cardápio permanece planejado para o MVP, mas não faz parte desta entrega.
3. Reservas, mesas e lotação ficam fora desta entrega.
4. Não renderizar placeholders ou cards "Em breve" para funcionalidades fora de
   escopo.
5. PostHog continua sendo telemetria interna da equipe Onside. As analytics
   exibidas aos bares devem vir de dados próprios, server-side e auditáveis.
6. A plataforma de produto é restrita a usuários autenticados.
7. Uma pessoa não autenticada que abra `/pub/$pubId` encontra um diálogo de
   autenticação obrigatório e não fechável. Nenhum dado real do bar fica
   disponível antes da sessão.
8. Depois da autenticação, o usuário permanece na mesma URL e recupera o bar e
   o jogo que originaram o acesso.
9. Bares recebem apenas métricas agregadas e anônimas. Nunca recebem nomes,
   telefones, e-mails ou listas individuais de visitantes.
10. O período padrão é de 30 dias, comparado aos 30 dias imediatamente
    anteriores.
11. O gráfico principal usa agregação diária.
12. Os dados podem aparecer poucos minutos depois da ação e são atualizados ao
    abrir ou recarregar o painel. Não há requisito de streaming ou WebSocket.
13. Analytics básicas por jogo estão disponíveis desde o Starter.
14. Profundidade, comparação e tempo de histórico são o eixo de upgrade.
15. Qualquer plano poderá comprar impulsionamento quando essa capacidade for
    implementada. O primeiro formato de impulsionamento será por jogo e janela
    limitada, não promoção permanente do perfil.
16. Impulsionamento não será implementado nesta entrega, mas a taxonomia não
    deve impedir atribuição orgânica versus impulsionada no futuro.
17. O telefone já cadastrado será reutilizado para telefone e WhatsApp.
18. O bar precisa confirmar explicitamente que o número aceita WhatsApp.
19. O preview do card do bar é obrigatório em "Meu espaço".
20. Eventos brutos terão retenção máxima de 13 meses. Agregados diários e
    mensais anônimos podem ser preservados para histórico longo.
21. A exclusão da conta do torcedor remove eventos brutos associados. Agregados
    anônimos já calculados permanecem.
22. Desenvolvimento local usa um único Postgres persistente chamado
    `findsports_dev`, executado por Docker no OrbStack.
23. Testes locais não podem resetar ou truncar globalmente esse banco.
24. `NODE_ENV` deve selecionar o banco de forma estrita e falhar quando ausente
    ou inválido.

## 3. Escopo

### 3.1. Em escopo

- Instrumentação própria de visualizações e ações de alta intenção.
- Deduplicação diária server-side.
- Atribuição opcional a um jogo.
- Consultas agregadas exclusivas do bar autenticado.
- Conteúdo completo das abas "Visão geral", "Minha grade" e "Meu espaço".
- Estados sem dados, carregando, parcial, erro e acesso limitado pelo plano.
- Confirmação de WhatsApp no perfil do bar.
- Diálogo de autenticação obrigatório na rota do bar.
- Preservação do contexto do jogo após autenticação.
- Atualização da oferta em `routes/plan.tsx` e `routes/admin_.billing.tsx`.
- Catálogo único de benefícios visuais dos planos para evitar divergência.
- Migration Drizzle compatível e reversível no nível de aplicação.
- Postgres local via Docker/OrbStack e guardas contra banco remoto acidental.
- Testes de autorização, isolamento entre bares, atribuição, deduplicação,
  retenção e entitlements.

### 3.2. Fora de escopo

- Cardápio e contagem de itens.
- Reservas, mesas, ocupação e lotação.
- Compra ou execução de impulsionamentos.
- Estimativa de receita em reais.
- Check-in ou confirmação de visita presencial.
- Exposição de identidades aos bares.
- Dados de visitantes anônimos.
- Tracking por fingerprint.
- Analytics em tempo real por streaming.
- Alteração de preços dos planos.
- Dados simulados no painel produtivo.

## 4. Vocabulário e fórmulas

### 4.1. Evento comercial próprio

Um evento comercial próprio é um registro autenticado, validado e persistido
pela API da Onside. Ele é independente dos eventos enviados ao PostHog.

Tipos iniciais:

| Tipo | Definição |
| --- | --- |
| `profile_view` | O perfil real do bar foi disponibilizado a um torcedor autenticado. |
| `directions_opened` | O torcedor abriu a rota para o bar. |
| `phone_clicked` | O torcedor iniciou uma ligação pelo telefone exibido. |
| `whatsapp_opened` | O torcedor abriu o WhatsApp para o telefone confirmado pelo bar. |

Favoritar e compartilhar continuam no PostHog e podem aparecer futuramente como
sinais de interesse, mas não compõem a métrica principal desta fase.

### 4.2. Visitante único

Um usuário `fan` distinto que gerou ao menos um `profile_view` para o bar no
período consultado.

Não contar:

- o proprietário do bar;
- outros usuários com role `pub`;
- administradores;
- sessões de impersonation;
- carregamentos bloqueados pelo diálogo de autenticação;
- bots sem sessão válida.

### 4.3. Pessoa interessada

Um usuário `fan` distinto que gerou ao menos uma ação de alta intenção no
período:

- `directions_opened`;
- `phone_clicked`;
- `whatsapp_opened`.

### 4.4. Ações de alta intenção

Soma das ações de alta intenção deduplicadas no período. Esse é o grande número
operacional do painel; não deve ser rotulado como quantidade de clientes.

### 4.5. Taxa de intenção

```text
pessoas interessadas / visitantes únicos * 100
```

Quando não houver visitantes únicos, retornar `null` e renderizar `—`, nunca
`0%`, para não sugerir uma taxa calculada sobre denominador zero.

### 4.6. Ação principal

O tipo de ação de alta intenção com maior quantidade deduplicada no período.
Empates devem seguir ordem estável apenas para renderização:

1. abrir rota;
2. WhatsApp;
3. telefone.

### 4.7. Regra de deduplicação

Contar no máximo uma ocorrência por combinação de:

```text
usuário + bar + jogo atribuído (ou sem atribuição) + tipo de ação +
dia comercial
```

Cinco cliques consecutivos em "Abrir rota" contam como uma ação. Abrir rota,
telefone e WhatsApp no mesmo dia conta como três ações e uma pessoa interessada.

Para a primeira versão, o dia comercial usa `America/Sao_Paulo`. Se a Onside
expandir para fusos diferentes, a timezone deve passar a pertencer ao bar; não
inferir timezone livremente a partir do nome da cidade.

### 4.8. Comparação de período

O padrão é:

- período atual: últimos 30 dias completos, incluindo hoje;
- período anterior: os 30 dias imediatamente anteriores;
- variação: `(atual - anterior) / anterior * 100`;
- se o período anterior for zero, retornar variação `null` e copy contextual,
  nunca infinito.

## 5. Atribuição por jogo

### 5.1. Regra principal

Uma visita ou ação só pode ser atribuída a um jogo quando o torcedor chegou ao
perfil explicitamente pelo contexto daquele jogo.

Não atribuir por proximidade de horário, por jogo ao vivo ou pelo primeiro jogo
da lista. Isso criaria causalidade falsa.

### 5.2. Transporte do contexto

Links originados em card, resultado de busca ou pin relacionado a um jogo devem
abrir:

```text
/pub/$pubId?eventId=$eventId
```

Requisitos:

- validar no servidor que `eventId` pertence a `pubId`;
- ignorar atribuição inválida sem bloquear o acesso ao bar;
- preservar `eventId` durante o diálogo e a autenticação;
- preservar `eventId` em compartilhamentos originados nesse contexto;
- acessos diretos sem `eventId` são classificados como "Sem jogo atribuído";
- ações posteriores na mesma visualização herdam somente o contexto validado;
- não manter silenciosamente o contexto ao navegar para outro bar.

### 5.3. Histórico após remoção de jogo

O tracking precisa preservar um snapshot mínimo do contexto (`championship` e
`startsAt`) para que uma exclusão posterior do cadastro do jogo não corrompa o
histórico agregado. O snapshot serve apenas para analytics e não reativa o jogo.

## 6. Arquitetura de informação do painel

`admin.tsx` permanece dono das queries remotas e dos estados agregados. Os
componentes das abas recebem estados tipados por props; não duplicar as mesmas
queries em `EventsManager`, `BarPreview` ou novos componentes.

### 6.1. Aba "Visão geral"

Perguntas respondidas:

- Quantas pessoas a Onside levou ao perfil?
- Quantas demonstraram intenção real de visitar?
- Qual ação foi mais comum?
- O resultado melhorou em relação ao período anterior?

Ordem do conteúdo:

1. Cabeçalho "Desempenho do bar".
2. Seletor de período permitido pelo plano.
3. Indicador de atualização, por exemplo "Atualizado há 4 min".
4. Cards:
   - visitantes únicos;
   - pessoas interessadas;
   - ações de alta intenção;
   - taxa de intenção.
5. Gráfico diário com duas séries:
   - visitantes únicos;
   - ações de alta intenção.
6. Comparação com o período anterior, visualmente secundária.
7. Distribuição das ações:
   - rota;
   - WhatsApp;
   - telefone;
   - ação principal em destaque.
8. Resumo de desempenho dos jogos, com link/tab action para "Minha grade".
9. Estado da assinatura e limite de jogos atual, sem repetir o catálogo inteiro
   de planos.

Não renderizar receita estimada, "clientes gerados" ou ROI financeiro sem
reserva/check-in ou outra conversão confirmada.

### 6.2. Aba "Minha grade"

Perguntas respondidas:

- Quais jogos estão cadastrados?
- Qual jogo trouxe mais interesse?
- O que devo transmitir novamente?

Preservar todas as funções atuais de criar, editar e excluir eventos.

Para cada jogo, mostrar de forma compacta:

- status temporal: ao vivo, próximo ou encerrado;
- visitantes únicos atribuídos;
- pessoas interessadas;
- ações de alta intenção;
- taxa de intenção;
- ação principal;
- indicação clara quando não houve atribuição suficiente;
- acesso a uma expansão/detalhe clean, sem transformar toda linha em dashboard.

No topo da aba:

- resumo do período;
- jogo com mais pessoas interessadas;
- comparação simples entre jogos com dados;
- controles atuais de criação e limites do plano.

O estado vazio deve conduzir a "Cadastrar primeiro jogo". Não mostrar um gráfico
sem série e não inserir eventos fictícios.

Preparação para impulsionamento futuro:

- a ação de impulsionar pertencerá ao jogo;
- a campanha terá janela limitada;
- analytics orgânicas e impulsionadas serão separadas;
- não renderizar botão desabilitado ou badge "Em breve" nesta entrega;
- não criar tabela de campanha antes da fase de impulsionamento.

### 6.3. Aba "Meu espaço"

Perguntas respondidas:

- Meu perfil está pronto para converter?
- Como apareço para o torcedor?
- O que preciso corrigir?

Conteúdo:

1. Diagnóstico de prontidão:
   - foto;
   - nome;
   - descrição;
   - endereço válido;
   - telefone;
   - confirmação de WhatsApp;
   - ao menos um jogo próximo.
2. Edição atual do perfil.
3. Confirmação "Este número também recebe WhatsApp" associada ao telefone.
4. Preview obrigatório do card real da descoberta.
5. Preview do pin/mapa.
6. Recomendações acionáveis apenas para itens incompletos.

Não repetir o gráfico da visão geral nessa aba.

### 6.4. Navegação e persistência

- Manter as tabs acessíveis existentes.
- Somente o painel ativo fica exposto à árvore de acessibilidade.
- Preservar estado local de formulário/modal ao trocar de aba.
- Preservar deep links `#admin-visao`, `#admin-grade` e `#admin-espaco`.
- Quando fizer sentido, o botão de um insight pode trocar a tab e atualizar o
  hash sem rolagem inesperada.

## 7. Estados sem dados e ativação

Nunca usar números ou séries de demonstração como se fossem dados do bar.

### 7.1. Bar sem nenhuma visita

Renderizar um estado "Coleta iniciada" com:

- explicação de que os dados aparecerão após visitas autenticadas;
- checklist curto de prontidão;
- CTA principal para cadastrar o primeiro jogo, se necessário;
- CTA secundário para completar o perfil;
- preview do card;
- espaço do gráfico identificado como aguardando o primeiro dado, sem eixos ou
  pontos falsos.

### 7.2. Primeira visita e primeira intenção

- A primeira visita real substitui o estado vazio pelos cards e gráfico.
- A primeira ação de alta intenção recebe celebração proporcional e curta.
- Respeitar `prefers-reduced-motion`.
- Não repetir celebração a cada abertura do painel.

### 7.3. Dados parciais

- Visitas sem intenção: explicar que ainda não houve rota, telefone ou WhatsApp.
- Intenção sem atribuição de jogo: mostrar na visão geral e em "Sem jogo
  atribuído", nunca distribuir artificialmente entre jogos.
- Analytics indisponíveis: manter gestão da grade e perfil funcionando; erro de
  analytics não pode bloquear operações do bar.

## 8. Autenticação obrigatória no perfil do bar

### 8.1. Comportamento sem sessão

`/pub/$pubId` continua acessível como rota para permitir o diálogo no mesmo URL,
mas nenhum dado real do bar deve ser buscado ou serializado sem sessão.

Renderizar:

- backdrop visual genérico da Onside, sem nome, endereço, telefone ou eventos;
- diálogo modal obrigatório;
- sem botão fechar;
- Escape e clique fora não fecham;
- conteúdo de fundo `inert` e `aria-hidden`;
- foco preso dentro do diálogo;
- login e cadastro acessíveis;
- mensagens de erro sem perder o `pubId` e o `eventId`.

Uma simples camada CSS sobre dados retornados por `pubs.getById` não atende a
esta spec.

### 8.2. Depois da autenticação

- Revalidar sessão e permissões.
- Permanecer em `/pub/$pubId?eventId=...`.
- Buscar dados reais somente após a sessão.
- Validar o contexto do jogo no servidor.
- Registrar `profile_view` após o perfil real estar disponível.
- Não registrar o carregamento do backdrop como visita.

### 8.3. Alterações necessárias de autorização

- `pubs.getById` não pode continuar como `publicProcedure` se expõe o perfil.
- Busca/descoberta também deve ser revisada para a regra de plataforma
  autenticada; nenhuma procedure deve permanecer pública apenas porque a UI
  está bloqueada.
- O endpoint de tracking aceita somente sessão com role `fan`.
- As queries do painel aceitam somente role `pub` e derivam o `barId` da sessão.
- Nunca aceitar `barId` arbitrário do cliente para consultar analytics do bar.
- Impersonation e roles administrativas não geram métricas comerciais.

## 9. Modelo de dados proposto

Os nomes finais podem seguir as convenções do schema, mas a semântica abaixo é
obrigatória.

### 9.1. `bar` — confirmação de WhatsApp

Adicionar:

```text
phone_accepts_whatsapp boolean not null default false
```

Regras:

- se o telefone mudar, a confirmação volta para `false`;
- só renderizar CTA de WhatsApp quando telefone existir e confirmação for
  `true`;
- `pub.updateMe` deve atualizar telefone e confirmação atomicamente;
- não inferir WhatsApp pelo formato do número.

### 9.2. Enum de ação

```text
bar_commercial_event_type:
  profile_view
  directions_opened
  phone_clicked
  whatsapp_opened
```

### 9.3. `bar_commercial_event`

Campos mínimos:

| Campo | Regra |
| --- | --- |
| `id` | UUID/texto, chave primária. |
| `bar_id` | FK obrigatória para `bar`. |
| `actor_user_id` | FK obrigatória para `user`, com exclusão em cascata. |
| `type` | Enum obrigatório. |
| `source_event_id` | Jogo validado, opcional. |
| `source_event_championship` | Snapshot opcional. |
| `source_event_starts_at` | Snapshot opcional. |
| `occurred_at` | Timestamp com timezone, definido no servidor. |
| `commercial_day` | Data derivada em `America/Sao_Paulo`. |
| `created_at` | Timestamp de persistência. |

Não aceitar `actor_user_id`, snapshots, `occurred_at` ou `commercial_day` do
cliente.

Índices mínimos:

- `(bar_id, occurred_at)` para visão geral;
- `(bar_id, source_event_id, occurred_at)` para jogo;
- `(actor_user_id, occurred_at)` para retenção/exclusão;
- índice/constraint único que implemente a chave diária de deduplicação.

O caso sem jogo atribuído precisa participar da unicidade. Não depender da
semântica padrão de `NULL` em unique index, que permite múltiplos nulos; usar
`NULLS NOT DISTINCT`, coluna de chave normalizada ou índice por expressão
compatível com a versão de Postgres adotada.

Inserções duplicadas devem ser idempotentes (`ON CONFLICT DO NOTHING`) e
retornar ao cliente sucesso lógico, não erro.

### 9.4. Agregados

Adicionar rollups diários e mensais anônimos, atualizados por job idempotente.
Eles devem conter somente dimensões e contagens necessárias ao painel, nunca
identidades.

Requisitos:

- raw é fonte de verdade por até 13 meses;
- rollup diário sustenta gráfico e histórico recente;
- rollup mensal sustenta histórico Elite anterior à retenção raw;
- o job pode ser reexecutado para o mesmo período sem somar duas vezes;
- excluir raw antigo somente depois de confirmar o rollup correspondente;
- registrar checkpoint/observabilidade da última consolidação;
- não somar `unique visitors` diários para fingir um único mensal;
- calcular distincts do mês antes de descartar raw daquele mês.

## 10. Contratos de API

### 10.1. Tracking do torcedor

Criar uma superfície própria, preferencialmente router `commercialAnalytics`,
separada de PostHog.

Mutação conceitual:

```ts
recordCommercialEvent({
  pubId: string,
  type: 'profile_view' | 'directions_opened' | 'phone_clicked' |
    'whatsapp_opened',
  sourceEventId?: string
})
```

O servidor deve:

1. exigir sessão `fan`;
2. rejeitar impersonation;
3. confirmar que o bar existe e está acessível;
4. confirmar que `sourceEventId` pertence ao bar;
5. confirmar que telefone/WhatsApp está disponível para a ação correspondente;
6. derivar usuário, timestamps, dia e snapshots;
7. inserir idempotentemente;
8. não retornar dados de outras pessoas.

A navegação externa não pode esperar perceptivelmente pela gravação. Usar
transporte same-origin confiável para unload (`keepalive`/beacon autenticado ou
equivalente aprovado) e garantir que falha de analytics não bloqueie Maps,
telefone ou WhatsApp.

### 10.2. Analytics do bar

Procedures conceituais no domínio `pub`:

```ts
getMyAnalyticsOverview({ from, to })
getMyEventAnalytics({ from, to })
```

Ambas devem:

- exigir role `pub`;
- derivar o bar de `ctx.session.user.id`;
- aplicar entitlement do plano no servidor;
- validar intervalo e timezone;
- retornar estados vazios reais;
- nunca expor `actorUserId` ou linhas raw;
- nunca aceitar um `barId` de consulta.

Resposta de overview deve incluir:

- período efetivo;
- período anterior;
- visitantes únicos;
- pessoas interessadas;
- ações de alta intenção;
- taxa de intenção nullable;
- distribuição por ação;
- ação principal nullable;
- série diária;
- `updatedAt`;
- entitlement e menor data consultável.

Resposta por jogo deve incluir:

- identificador/snapshot do jogo;
- mesmos KPIs, calculados apenas sobre atribuição válida;
- série/detalhe permitido pelo plano;
- bucket "sem atribuição" separado.

### 10.3. Entitlements centralizados

Criar uma política server-side única:

| Plano | Histórico | Analytics por jogo | Comparação |
| --- | --- | --- | --- |
| Starter | 30 dias | básica | período anterior |
| Pro | 12 meses | completa | jogos e períodos |
| Elite | histórico agregado completo | completa | avançada; orgânico/impulsionado somente após campanhas existirem |

O cliente pode esconder controles indisponíveis, mas o servidor é autoritativo.
Não duplicar cálculo de limite de histórico em múltiplas telas.

## 11. Planos, checkout e billing

### 11.1. `routes/plan.tsx`

Analytics precisam aparecer como benefício central antes do checkout.

Como o perfil deixa de ser público para exigir autenticação, substituir
"Perfil público do bar" por "Perfil do bar no Onside" tanto no Starter quanto
em qualquer resumo herdado por Pro/Elite e billing.

Atualizar cards:

- Starter: "Analytics essenciais dos últimos 30 dias" e "Desempenho básico por
  jogo";
- Pro: "12 meses de histórico", "Comparação entre jogos" e "Funil detalhado de
  rota, telefone e WhatsApp";
- Elite: "Histórico completo" e "Inteligência avançada".

Não mencionar "Orgânico versus impulsionado" na oferta até campanhas existirem.
A copy deve descrever entitlement disponível, não funcionalidade futura.

Além dos cards, adicionar comparação legível abaixo deles quando necessário.
O usuário não deve fazer aritmética mental para entender por que Pro oferece
mais profundidade que Starter.

Não alterar checkout, slug, preço, período grátis ou analytics internas de
seleção sem uma decisão separada.

### 11.2. Catálogo único

Hoje `PLANS` em `plan.tsx` e `PLAN_INFO` em `admin_.billing.tsx` duplicam
benefícios. Extrair catálogo tipado de apresentação compartilhado entre as duas
rotas, preservando componentes e ações específicas de cada tela.

### 11.3. `routes/admin_.billing.tsx`

- mostrar claramente o entitlement de analytics do plano atual;
- refletir os mesmos benefícios exibidos no checkout;
- explicar o que muda em upgrade/downgrade;
- não apagar imediatamente histórico coletado em downgrade;
- limitar a consulta conforme o plano, preservando agregados para eventual
  reupgrade e obrigações de retenção.

## 12. Componentes e arquivos previstos

Mapa sugerido, ajustável durante implementação:

```text
apps/web/src/routes/admin.tsx
apps/web/src/routes/(pub)/pub.$pubId.tsx
apps/web/src/routes/plan.tsx
apps/web/src/routes/admin_.billing.tsx
apps/web/src/components/admin/admin-tabs.tsx
apps/web/src/components/admin/analytics-overview.tsx
apps/web/src/components/admin/analytics-empty-state.tsx
apps/web/src/components/admin/event-performance.tsx
apps/web/src/components/admin/conversion-readiness.tsx
apps/web/src/components/admin/bar-preview.tsx
apps/web/src/components/pub/bar-hero-section.tsx
apps/web/src/components/pub/bar-info-sidebar.tsx
apps/web/src/components/auth/auth-required-dialog.tsx
apps/web/src/components/pricing/plan-card.tsx
apps/web/src/lib/plan-catalog.ts
packages/api/src/routers/commercial-analytics.ts
packages/api/src/routers/pub.ts
packages/api/src/lib/analytics-entitlements.ts
packages/api/src/lib/commercial-analytics.ts
packages/db/src/schema/platform.ts
packages/db/src/migrations/<next>_bar_commercial_analytics.sql
```

Não criar um segundo estado remoto dentro de cada componente. A rota coordena
queries, retries e estados; componentes renderizam contratos tipados.

## 13. Postgres local com Docker no OrbStack

### 13.1. Objetivo

Impedir que desenvolvimento, migrations, seeds ou testes locais apontem por
engano para Neon, staging ou produção.

OrbStack expõe runtime compatível com Docker; a configuração deve permanecer
Docker Compose padrão, sem dependência proprietária desnecessária.

### 13.2. Serviço único

Adicionar `compose.yml` ou equivalente com um único serviço Postgres:

- database: `findsports_dev`;
- usuário exclusivo de desenvolvimento;
- senha local não reutilizada remotamente;
- porta publicada somente em loopback;
- volume nomeado persistente;
- healthcheck com `pg_isready`;
- versão de Postgres fixada, compatível com os índices escolhidos;
- sem exposição em `0.0.0.0` quando não necessária.

Adicionar comandos documentados para:

- iniciar;
- verificar saúde;
- aplicar migrations;
- seed idempotente;
- backup;
- restauração;
- parar sem apagar volume.

Não adicionar comando de reset amplo como caminho padrão.

### 13.3. Seleção fail-closed no Drizzle

`packages/db/drizzle.config.ts` deve mapear explicitamente:

| `NODE_ENV` | Origem da URL |
| --- | --- |
| `development` | configuração exclusiva do Docker `findsports_dev` |
| `test` | o mesmo `findsports_dev`, com testes não destrutivos |
| `production` | `DATABASE_URL` injetado pelo ambiente de deploy/`.env` previsto |
| ausente/outro | abortar antes de conectar |

Requisitos:

- não usar `process.env.DATABASE_URL || ''`;
- não carregar `apps/web/.env` antes de decidir o ambiente;
- não fazer fallback de `test` para URL remota;
- validar URL resolvida antes de entregar ao Drizzle;
- em development/test, exigir hostname `localhost`, `127.0.0.1` ou `::1`, porta
  esperada e database exatamente `findsports_dev`;
- em development/test, rejeitar hosts Neon e qualquer database com nome
  diferente;
- valor ausente gera erro legível com instrução de subir o Compose;
- imprimir de forma segura host/porta/database antes de migrations, nunca senha.

A mesma resolução deve ser usada por app, seeds, Drizzle Studio, migrations e
testes. Não deixar cada script interpretar `.env` de modo diferente.

### 13.4. Guardas para testes

Como o banco de desenvolvimento é persistente:

- proibir `TRUNCATE`, `DROP DATABASE`, reset global e limpeza de tabelas;
- cada teste cria IDs e e-mails com namespace aleatório da execução;
- cleanup usa apenas esses IDs explícitos;
- cleanup fica em `finally`;
- quando possível, usar transação com rollback;
- nenhum helper pode assumir que "localhost" significa "descartável";
- `RUN_DISPOSABLE_DB_TESTS` não deve autorizar truncamento deste banco;
- testes que exigiam reset global devem ser reescritos;
- um teste que não consegue provar escopo deve ser pulado/falhar antes de mutar.

### 13.5. Backup antes de migration destrutiva

Embora a migration desta entrega deva ser aditiva, documentar e fornecer um
fluxo de backup/restore do volume. Qualquer migration futura que remova ou
reescreva dados exige backup confirmado e inspeção do alvo resolvido.

## 14. Migration e rollout de dados

### 14.1. Estratégia

1. Subir Postgres local e validar o alvo.
2. Gerar migration aditiva.
3. Comparar schema Drizzle, SQL, journal e snapshot.
4. Aplicar em `findsports_dev` com dados locais preservados.
5. Validar constraints e índices.
6. Publicar migration antes ou junto de código que tolera ausência de dados.
7. Habilitar tracking.
8. Habilitar consultas do painel.
9. Habilitar rollup/retenção somente depois de validar raw.

### 14.2. Compatibilidade

- `phone_accepts_whatsapp` começa `false`; nenhum número legado é presumido.
- Tabelas de analytics começam vazias; não fabricar backfill a partir do
  PostHog.
- Painel deve exibir "Coleta iniciada" para ausência legítima.
- Código antigo deve continuar funcionando após a migration aditiva.
- Rollback de aplicação pode parar novas gravações sem apagar dados coletados.
- Não usar rollback destrutivo de tabela como primeira resposta a incidente.

## 15. Segurança e isolamento

### 15.1. Regras de acesso

- `fan`: pode registrar eventos próprios para bares acessíveis.
- `pub`: pode ler somente agregados do bar ligado à própria conta.
- `admin`: não recebe acesso implícito às analytics comerciais nesta entrega;
  qualquer ferramenta interna futura precisa de autorização explícita.
- cliente nunca escolhe o bar cujas analytics quer consultar.
- nenhuma procedure de painel pode retornar linha raw.

### 15.2. Testes obrigatórios de tenant isolation

Criar bar A, bar B, pub A, pub B e fan:

- fan registra ação válida no bar A;
- pub A vê o agregado;
- pub B não vê o evento nem alteração em seus agregados;
- enviar `barId` de B por payload manipulado não muda a consulta de pub A;
- evento pertencente a B não pode ser atribuído a A;
- update/delete usa `barId` derivado e ID esperado;
- exclusão do fan remove raw associado sem apagar dados de outros usuários;
- cleanup do teste remove apenas fixtures daquela execução.

### 15.3. Abuso e integridade

- constraint única é a última linha de deduplicação;
- mutation deve ser idempotente sob concorrência;
- aplicar rate limit razoável por sessão/usuário;
- não confiar no relógio do cliente;
- validar tipos por allowlist;
- não bloquear ação externa do torcedor se tracking falhar;
- registrar falha interna sem expor infraestrutura ao usuário.

## 16. Retenção e anonimização

- Raw: máximo de 13 meses.
- Rollup diário/mensal: retenção conforme política comercial e legal, sem IDs.
- Exclusão de conta: apagar raw por `actor_user_id` via fluxo testado.
- Agregados já anônimos permanecem.
- Nenhum export do bar contém identificador pessoal.
- Logs de aplicação não devem registrar payload com IDs de usuário além do
  necessário à observabilidade interna protegida.
- Documentar job de retenção, última execução e comportamento de retry.

## 17. Performance e atualização

- Gráfico padrão tem no máximo 30 pontos diários.
- Consultas devem usar índices por bar, data e jogo.
- Não consultar raw sem limite para histórico Elite antigo; usar rollups.
- `updatedAt` vem da consolidação/consulta server-side.
- React Query pode usar stale time curto e refetch ao focar/reabrir.
- Não usar polling em segundos.
- Carregar overview primeiro; analytics detalhadas por jogo podem ser
  prefetchadas ao focar/hover da tab ou carregadas ao ativá-la.
- `admin.tsx` continua responsável pelo estado remoto e entrega props aos
  componentes.

## 18. Analytics internas da Onside

PostHog pode continuar registrando eventos de uso do produto, separados dos
dados comerciais, por exemplo:

- aba de analytics visualizada;
- período alterado;
- detalhe de jogo aberto;
- checklist de prontidão acionado;
- upgrade clicado a partir de limite de histórico.

Esses eventos não são fonte para números mostrados ao bar e não substituem
testes de backend.

## 19. Testes e validação

### 19.1. Unitários

- cálculo de períodos atual/anterior;
- taxa nullable;
- ação principal e empate;
- deduplicação por dia/ação/jogo;
- contexto sem jogo;
- entitlement Starter/Pro/Elite;
- prontidão do perfil;
- telefone alterado revoga confirmação de WhatsApp;
- formatação de séries vazias e parciais.

### 19.2. Integração de banco/API

- insert concorrente resulta em um evento deduplicado;
- atribuição só aceita jogo do bar;
- cross-tenant isolation completo;
- raw removido na exclusão do usuário;
- rollup idempotente;
- retenção não remove raw antes do rollup;
- queries respeitam histórico do plano no servidor;
- migrations aplicam sobre banco com dados existentes;
- testes usam fixtures por ID, sem truncate.

### 19.3. Frontend

- tabs continuam acessíveis por clique, setas, Home e End;
- overview alterna loading, empty, ready, partial e error;
- gráfico não inventa pontos;
- evento sem atribuição não aparece em outro jogo;
- CTA externo continua funcionando se tracking falhar;
- diálogo sem sessão não fecha por Escape/outside;
- foco fica preso no diálogo;
- fundo não é interativo nem acessível;
- autenticação retorna ao mesmo bar/jogo;
- preview do card permanece em "Meu espaço";
- controles de plano exibem somente períodos permitidos.

### 19.4. Planos e billing

- catálogo exibido em `/plan` e `/admin/billing` é consistente;
- checkout continua usando slugs `starter`, `pro`, `elite`;
- plano atual e upgrade/downgrade continuam corretos;
- copy não promete impulsionamento já disponível;
- backend impede acesso fora do entitlement mesmo com cliente manipulado.

### 19.5. Gates

- testes focados Bun;
- `bunx tsc -p apps/web/tsconfig.json --noEmit`;
- typecheck dos packages API/DB alterados;
- Biome somente em arquivos alterados;
- build client e SSR;
- `git diff --check`;
- comparação schema/SQL/journal/snapshot;
- QA visual autenticado real em mobile e desktop;
- QA de teclado, zoom, reduced motion e ausência de overflow;
- gate thermo-nuclear da seção 20 aprovado sem bloqueadores.

## 20. Gate obrigatório de qualidade thermo-nuclear

Depois de implementar todas as fases e antes de declarar a entrega concluída,
invocar explicitamente o skill `$thermo-nuclear-code-quality-review` sobre o
diff completo desta feature.

O build, os testes e o funcionamento visual não substituem esse review. O
objetivo é provar que a implementação preservou ou melhorou a arquitetura, em
vez de apenas acrescentar comportamento correto.

### 20.1. Escopo do review

Antes de iniciar a implementação, registrar o commit-base e a lista de arquivos
já modificados por trabalhos não relacionados. O review final deve cobrir todas
as alterações desta spec em:

- `apps/web`;
- `packages/api`;
- `packages/db`;
- configuração de ambiente/Docker;
- migration, journal e snapshot;
- testes e jobs de rollup/retenção.

Não atribuir dívida preexistente à feature, mas bloquear regressões ou expansão
da dívida nos arquivos tocados.

### 20.2. Prompt e postura obrigatórios

Executar o review a partir do prompt-base do skill:

> Perform a deep code quality audit of the current branch's changes. Rethink how
> to structure / implement the changes to meaningfully improve code quality
> without impacting behavior. Work to improve abstractions, modularity, reduce
> Spaghetti code, improve succinctness and legibility. Be ambitious, if there is
> a clear path to improving the implementation that involves restructuring some
> of the codebase, go for it. Be extremely thorough and rigorous. Measure twice,
> cut once.

O reviewer deve procurar ativamente movimentos de "code judo": mudanças de
ownership ou modelo que eliminem branches, helpers, estados ou camadas inteiras,
em vez de apenas renomear ou deslocar complexidade.

### 20.3. Bloqueadores presumidos

Tratar como bloqueador até justificativa e evidência em contrário:

- qualquer arquivo que passe de menos de 1.000 para mais de 1.000 linhas;
- crescimento expressivo de `admin.tsx`, `pub.ts`, `pubs.ts` ou `platform.ts`
  quando a responsabilidade pode ser extraída;
- regras de entitlement, período, deduplicação ou atribuição copiadas entre UI,
  router, serviço e job;
- condicionais específicas de analytics espalhadas por fluxos compartilhados;
- novo `any`, `unknown`, casts ou campos opcionais usados para esconder um
  contrato mal definido;
- wrappers finos ou abstrações genéricas que apenas adicionam indireção;
- lógica comercial no componente React ou detalhes de UI dentro do domínio/API;
- consultas de tenant aceitando `barId` quando ele deveria vir da sessão;
- inserts relacionados não atômicos ou deduplicação dependente somente do
  cliente;
- atualização de telefone e confirmação de WhatsApp sujeita a estado parcial;
- rollup e exclusão de raw sem transação/checkpoint que preserve consistência;
- orchestration sequencial de operações independentes quando a paralelização
  também simplifica o fluxo;
- nova implementação bespoke de helper que já tenha dono canônico;
- testes que passam, mas dependem de limpeza global, ordem de execução ou dados
  residuais do banco de desenvolvimento.

### 20.4. Ownership esperado para reduzir spaghetti

O review deve pressionar pela estrutura mais simples que preserve estes limites:

- React renderiza contratos tipados e mantém apenas estado de apresentação;
- `admin.tsx` coordena estado remoto sem se tornar um novo arquivo gigante;
- router autentica, valida input e delega; não concentra cálculo e SQL extenso;
- serviço de analytics possui fórmulas, atribuição, deduplicação e agregação;
- política server-side única possui entitlements;
- schema/constraints garantem invariantes que não podem depender de React;
- job de rollup/retenção reutiliza o mesmo domínio, sem recodificar fórmulas;
- catálogo visual de planos não se torna fonte de autorização;
- contratos de resposta são explícitos, discriminados e sem optionalidade
  acidental.

O review não deve exigir abstração por abstração. Código direto e boring é
preferível a factories, registries ou wrappers mágicos quando existem poucos
casos fixos.

### 20.5. Evidência e ciclo de fechamento

Produzir `specs/qa/bar-commercial-analytics-thermo-review.md` com:

1. base e escopo revisados;
2. tamanho antes/depois dos principais arquivos;
3. achados priorizados por impacto estrutural;
4. oportunidades de code-judo;
5. localização `arquivo:linha` e remédio acionável;
6. decisões justificadas quando um alerta for aceito;
7. mudanças aplicadas para resolver cada bloqueador;
8. gates executados depois das correções;
9. resultado final: aprovado ou bloqueado.

O primeiro review não encerra o gate. O executor deve:

1. rodar o skill;
2. corrigir todos os bloqueadores dentro do escopo;
3. repetir testes e gates relevantes;
4. rodar `$thermo-nuclear-code-quality-review` novamente sobre o diff resultante;
5. repetir até não restar regressão estrutural ou oportunidade óbvia de
   simplificação dramática.

Não considerar a feature pronta com finding estrutural aberto apenas porque os
testes passam. Findings cosméticos podem ser registrados sem bloquear quando
não escondem problema maior.

## 21. Sequência recomendada de implementação

### Fase 0 — segurança local

1. Compose Postgres para OrbStack.
2. Resolução de ambiente fail-closed.
3. Guardas e documentação de backup.
4. Reescrita de qualquer teste destrutivo relevante.

### Fase 1 — fundação de dados

1. Schema/migration.
2. Confirmação de WhatsApp.
3. Entitlements server-side.
4. Tracking idempotente.
5. Testes de segurança e deduplicação.

### Fase 2 — autenticação e atribuição

1. Bloqueio real de procedures públicas.
2. Diálogo obrigatório.
3. Preservação de URL/contexto.
4. Propagação e validação de `eventId`.
5. Instrumentação das ações externas.

### Fase 3 — painel

1. Overview e empty state.
2. Gráfico e distribuição de ações.
3. Analytics por jogo na grade.
4. Prontidão e preview em "Meu espaço".
5. Estados de erro e acesso por plano.

### Fase 4 — planos e retenção

1. Catálogo visual compartilhado.
2. Atualização de `/plan` e billing.
3. Rollups diário/mensal.
4. Retenção de raw e observabilidade do job.

Cada fase deve ser validada antes da próxima. Não combinar migration, auth gate,
tracking, dashboard completo e pricing em um único commit indivisível.

## 22. Critérios de aceite

A entrega está concluída quando:

- um fan autenticado abre um bar e gera `profile_view` próprio;
- rota, telefone e WhatsApp produzem eventos server-side idempotentes;
- repetição do mesmo tipo/usuário/bar/jogo/dia não infla a contagem;
- ação sem contexto não é atribuída a jogo;
- pub vê somente dados agregados do próprio bar;
- Starter vê 30 dias e analytics básicas por jogo;
- Pro vê 12 meses e comparação detalhada;
- Elite vê histórico agregado completo permitido;
- overview mostra gráfico real, comparação e distribuição clean;
- grade mostra analytics verdadeiras por jogo sem prejudicar CRUD;
- "Meu espaço" mantém preview do card e mostra prontidão;
- bar novo recebe uma jornada de ativação, não dashboard vazio ou dados falsos;
- usuário sem sessão recebe diálogo obrigatório e nenhum dado real;
- autenticação preserva bar e jogo;
- `/plan` e billing comunicam os entitlements corretamente;
- PostHog não é consultado para compor analytics do bar;
- Postgres local roda no OrbStack/Docker como `findsports_dev`;
- ambiente inválido aborta antes de conectar;
- nenhum teste local usa truncate/reset global;
- migrations e testes preservam usuários fora das fixtures;
- todos os gates da seção 19 passam;
- o relatório thermo-nuclear final está aprovado sem bloqueadores.

## 23. Itens deliberadamente adiados

- cadastro e analytics de cardápio;
- reservas e inventário de mesas;
- lotação em tempo real;
- campanhas de impulsionamento;
- custo por pessoa interessada;
- receita atribuída;
- check-in/conversão presencial;
- benchmarks entre bares antes de existir amostra suficiente.

Esses itens exigem specs próprias. Não devem ser usados para preencher espaço no
painel atual.
