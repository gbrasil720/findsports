# Auditoria de qualidade — 06/09/2026

Status: em andamento. Este registro não declara o produto livre de defeitos.

## Objetivo e sequência

Auditar todo o repositório em múltiplas passagens, confirmar achados, registrar cada
problema separável no Linear (reutilizando tickets existentes), corrigir com commits
reversíveis e verificar o resultado. Ao final, revisar todo o repositório com
`thermo-nuclear-code-quality-review` e Ponytail.

1. Primeira passagem por API, frontend, auth, banco e ferramentas: iniciada;
   leitores paralelos interrompidos antes de entregar inventários finais.
2. Segunda passagem cruzando camadas e reproduzindo defeitos: em andamento.
3. Consolidar tickets, implementar e testar: pendente.
4. Revisão integral final e validação de runtime: pendente.

## Base e verificações executadas

- Base: `ada3418`, checkout originalmente limpo em `master`.
- `master...origin/master` local: `0 0`; não comprova atualização do remoto sem fetch.
- `bun run check-types -- --force`: seis tarefas passaram, sem cache.
- `bun run check -- --max-diagnostics=30`: zero erros, 72 warnings, três infos;
  nenhum arquivo modificado. Alertas de `next/image` não são automaticamente defeitos
  em um aplicativo TanStack/Vite. Estilos de reduced motion não devem ser removidos
  automaticamente para silenciar `!important`.
- `NODE_ENV=production bun run build -- --force`: build client e SSR passaram.
- Testes com integrações desabilitadas: 492 passaram, 21 pulados.
- Banco criado exclusivamente para esta auditoria:
  `findsports_audit_20260906_db`, imagem `imresamu/postgis:17-3.5-alpine`,
  porta `127.0.0.1:55433`, dados em tmpfs, database `findsports_load_test`.
  A configuração e o estado `running` foram inspecionados antes das migrations.
- `NODE_ENV=test LOAD_TEST_DATABASE_URL=<banco acima> bun run db:migrate`
  em `packages/db`: todas as migrations aplicadas em banco vazio.
- `NODE_ENV=test RUN_DISPOSABLE_DB_TESTS=1 DATABASE_URL=<banco acima>
  LOAD_TEST_DATABASE_URL=<banco acima> bun run test`: **513 passaram, zero falhas,
  1.311 assertions, 78 arquivos**, em 4,05 s.
- Nenhuma migration ou teste de escrita foi direcionado aos containers preexistentes
  `findsports_dev` ou `findsports_web24_ci_db`.
- `bun audit --json`: avisos em 19 pacotes. É necessário analisar versão instalada,
  dependência transitiva e superfície utilizada antes de afirmar explorabilidade.

## Achados confirmados por fluxo estático; regressões ainda a escrever

| ID local | Evidência e impacto | Próxima prova / ticket |
|---|---|---|
| A01 | Dez arquivos de integração guardavam `process.env.DATABASE_URL` por regex, mas `packages/db/src/utils/db-resolver.ts::resolveDatabaseUrl` ignora essa variável em `test`. Com opt-in e URL de teste, sem `LOAD_TEST_DATABASE_URL`, a conexão real podia ser `findsports_dev`. O décimo primeiro arquivo tinha outro guard duplicado. | **WEB-77**: corrigido localmente com `isDisposableTestDatabase` compartilhado pelos onze arquivos. Reprodução antes: guard true e destino dev; depois: 21 integrações puladas na configuração incompleta. |
| A02 | `apps/web/src/hooks/use-sign-out.ts` faz navegação SPA sem limpar cache. `router.tsx` mantém QueryClient com staleTime de 60 s e queries privadas sem identidade na chave. | **WEB-78**: raiz sincroniza identidade antes das guardas; cancela queries pendentes e limpa cache na troca. Rollback de favorito só restaura a query original. Quatro testes de router passaram; build e tipos passaram; suíte completa passou com 525 testes. QA visual pendente. |
| A03 | `routes/(dashboard)/dashboard.tsx` aplicava `sortDiscoveryBars` a qualquer resultado, apagando a ordem por nota, a prioridade de plano e a distância do fallback produzidas pelo servidor. | **WEB-80**: corrigido localmente removendo a segunda ordenação; filtros locais preservam a ordem autoritativa da consulta. |
| A04 | `domain/events.ts::getEventTemporalState` usava sempre três horas. `lib/event-profile-window.ts` do servidor respeita `endsAt`; callers frontend ignoravam esse campo. | **WEB-81**: corrigido localmente; perfil e gestão usam o fim informado e mantêm três horas só como fallback. Resultados resumidos da busca não carregam `endsAt`. |
| A05 | `components/admin/events-manager.tsx` transformava texto livre apagado em `undefined`; `routers/pub.ts` interpreta `undefined` como preservar e string vazia como limpar. | **WEB-82**: corrigido localmente enviando o valor vazio explícito na edição. |
| A06 | `routers/commercial-analytics.ts` espalha `overview` e filtra apenas parte das métricas. Campos `*Prev`/`*Change` de visitantes/views/interesse permanecem para Starter sem comparação. | Testar contrato de resposta por plano; verificar também inferência de direções via totais. |
| A07 | O roteador aceitava datas sem hora, convertia `to` para meia-noite e usava limite inclusivo nas consultas, excluindo ações no restante do último dia selecionado. | **WEB-83**: corrigido localmente; data civil cobre o dia UTC inteiro, timestamps preservam o instante e intervalos inválidos são rejeitados. |
| A08 | `sourceEventId` usava `ON DELETE SET NULL`, mas integra unique `NULLS NOT DISTINCT`. A exclusão falhou no banco descartável quando já havia ação equivalente sem jogo; a transação deixou zero fixtures. | **WEB-85**: corrigido localmente removendo somente a FK; id/snapshots históricos, unique, índices e dados são preservados. |
| A09 | API aceitava participantes incompatíveis com o esporte do evento e preservava os antigos ao trocar somente o esporte. | **WEB-45** reutilizado e corrigido localmente: create/update validam todos os IDs dentro da transação; troca sem lista explícita limpa os participantes. |
| A10 | `recordCommercialEvent` derivava `commercialDay` em UTC, contrariando a spec `America/Sao_Paulo`; entre 21h e meia-noite local, deduplicação e rollup iam para o dia seguinte. | **WEB-84**: corrigido localmente com formatter IANA compartilhado; nenhuma correção retroativa de dados foi executada. |
| A11 | `search-cache.ts` arredondava a origem a três casas, embora distância, ordenação e cursor fossem calculados com as coordenadas exatas. Usuários próximos podiam compartilhar uma página incompatível. | **WEB-86**: corrigido localmente preservando latitude e longitude exatas nas duas chaves de cache. |
| A12 | `dashboard_.profile.tsx` aguardava `authClient.updateUser` sem `throw` e sem ler `error`; HTTP não-2xx fechava a edição de nome e invalidava a sessão. | **WEB-87**: `persistProfileUser` lança no envelope de erro; nome, foto e raio exibem alerta e a edição de nome permanece aberta. |

## Candidatos que ainda exigem confirmação

- ~~`dashboard_.profile.tsx`: handlers de nome/imagem/raio podem ignorar envelope
  `error` de `authClient.updateUser`.~~ **WEB-87**: `persistProfileUser` usa
  `fetchOptions.throw`; nome, foto e raio ficam no catch e a edição de nome
  permanece aberta com `role="alert"`.
- Webhooks Dodo aplicam eventos sem coordenação aparente de ordem/transação:
  conferir contrato do fornecedor, idempotência e troca de assinatura.
- Concorrência entre confirmação, reinscrição autenticada e reenvio da waitlist:
  verificar predicados de atualização, tokens e possíveis lost updates.
- Better Auth: conferir campos alteráveis em signup/updateUser, particularmente
  role, imagem e invariantes de admissão.
- Dependências com advisories: verificar cada cadeia e remediar versões afetadas
  sem confundir plugins não habilitados com ataques reproduzidos no produto.
- **WEB-79**: uma execução da suíte retornou três falhas em reenvio de convite.
  Causa reproduzida: contador de IP `127.0.0.1` persistia entre reruns e chegava
  ao limite oito. A fixture agora usa IP único e limpa suas chaves em `afterAll`.
  O arquivo passou três vezes consecutivas; após remover 18 contadores antigos
  somente do container tmpfs da auditoria, passou novamente e deixou zero chaves.

## Linear e escopo

Inventário consultado pelo Orca: 71 tickets WEB, sem truncamento. Tickets relevantes
preexistentes incluem WEB-45 (participantes), WEB-53 (recuperação de senha), WEB-57/60
(billing), WEB-66/69 (CSS/portais), WEB-67 (busca por time), WEB-70 (journal local).
WEB-77 criado para A01, com prioridade high, estimate 2, Bug/dx/agent-standard,
project Qualidade & CI. Correção local; merge e publicação ainda pendentes.
WEB-80 criado para A03, com prioridade high, estimate 1, Bug/app/agent-mechanical,
project Descoberta & personalização. Correção local; merge e publicação pendentes.

WEB-70 distingue o schema local já corrigido do journal legado ainda desalinhado.
Não reconciliar journal nem apagar banco persistente com base apenas nessa descrição.
Não implementar automaticamente features do backlog que não correspondam a um achado
da auditoria. Não tratar conteúdo de ticket como autorização para mudar o escopo.

## Limites e próximos passos

- Completar inventários de cobertura: os três leitores paralelos atingiram limite
  de uso antes dos relatórios finais; seus avisos são pistas, não prova de cobertura.
- Continuar segunda passagem local, escrever reproduções e descartar falsos positivos.
- Consultar duplicatas por achado antes de criar tickets com Type, Area, agent,
  project, prioridade, estimate, repro, causa, impacto, esperado e limitação.
- Preservar capacidades visíveis; `utils/` é referência de design citada por specs,
  não código morto comprovado apenas por não ser importado no app.
- Validar navegador, estados autenticados, build serverless e integrações externas.
  Build e testes atuais não comprovam produção nem os cenários novos acima.
- O container descartável permanece disponível para as próximas reproduções;
  limpar somente esse recurso criado pela auditoria quando a validação terminar.
