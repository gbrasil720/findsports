# Auditoria de qualidade — 06–07/09/2026

Status: **concluída para a base `e1e904e3c66c234105b0b30444c6e7a167ee6974`**.
Isso significa que as passagens planejadas foram executadas e todos os achados
confirmados desta auditoria têm ticket. Não significa que o produto está livre de
defeitos nem substitui observabilidade e validação em produção.

## Escopo percorrido

- API/tRPC, autenticação e autorização, waitlist, analytics comerciais,
  recomendações, billing legado, banco/schema/migrations e limites de concorrência;
- rotas e componentes do app, estados de loading/empty/error, acessibilidade e smoke
  test das rotas principais;
- manifests do monorepo, dependências, imports sem consumidor, configuração de build,
  lint, tipos e testes;
- revisão estrutural final com `thermo-nuclear-code-quality-review`, Ponytail e as
  [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

Foram preservadas capacidades existentes. A auditoria não implementou features do
backlog nem abriu tickets apenas para dividir arquivos grandes sem um defeito ou custo
concreto.

## Base e gates finais

- checkout: `master`, limpo antes da atualização deste relatório;
- `HEAD` e `origin/master`: `e1e904e3c66c234105b0b30444c6e7a167ee6974`;
- `bun run check-types -- --force`: 6 tarefas passaram, sem cache;
- `bun run check -- --max-diagnostics=200`: passou sem erros; permaneceram somente
  warnings/infos já classificados;
- `bun run test`: 512 passaram, 22 pulados, 0 falhas, 1.196 assertions, 81 arquivos;
- `NODE_ENV=production bun run build -- --force`: build client e SSR passaram;
- bundle principal reportado pelo build: 529,76 kB sem compressão / 161,34 kB gzip.
  Não foi aberto ticket sem orçamento ou impacto de runtime mensurado;
- `bun audit --json`: advisories presentes em 19 pacotes; a superfície alcançável foi
  triada antes de virar ticket.

Uma rodada anterior da mesma auditoria também aplicou migrations e executou as
integrações em PostgreSQL/PostGIS descartável, loopback-only, com 513 testes e zero
falhas. Na base final, a suíte comum passou; as 22 integrações opt-in permaneceram
puladas e não foram apontadas para banco remoto.

## Smoke test de runtime

O app da própria base foi iniciado isoladamente em `localhost:3102`; a porta 3001 não
foi reutilizada porque pertencia a outro worktree. Foram exercitados `/`, `/login`,
`/signup`, `/dashboard`, a landing pública pelo link real “Ver a landing” e a rota 404.

- dashboard estabilizou sem erro do app;
- o Google Maps recusou o referer local, comportamento externo já coberto por WEB-34
  e não tratado como regressão nova;
- o link real para a landing serializa corretamente `public="1"`;
- o título acessível concatenado da página 404 foi reproduzido e virou WEB-93.

Não foram testados webhooks reais, entrega de e-mail, cobrança, deploy/Vercel nem dados
de produção.

## Achados finais e tickets

| Ticket | Prioridade | Achado confirmado |
|---|---:|---|
| WEB-88 | high | `updateUser` permite que usuário autenticado altere o próprio papel de `fan` para `pub`, e o onboarding confia nesse papel. |
| WEB-89 | high | Starter anuncia comparação, mas API declara `canViewComparison=false` e devolve somente parte dos campos por espalhamento acidental. |
| WEB-90 | high | resposta tardia de um reenvio da waitlist pode sobrescrever token/estado de convite mais novo. |
| WEB-91 | medium | Better Auth 1.6.9 mantém sessões antigas válidas após `deleteUser`; versão corrigida começa em 1.6.11. |
| WEB-92 | low | `card.tsx`, configuração PostCSS exportada e Testing Library permanecem sem consumidor. |
| WEB-93 | low | heading da rota 404 é anunciado como “Essa páginasaiu de campo”. |
| WEB-94 | low | `/internal/manage-users` contém labels não associadas e botão de ícone sem nome acessível. |
| WEB-95 | low | painel da waitlist busca todo o histórico e mantém cópias mobile/desktop simultâneas no DOM. |
| WEB-96 | medium | rate limit `COUNT` + `INSERT` pode ser ultrapassado por requisições paralelas. |
| WEB-97 | high | primeiras ações paralelas do mesmo fã/bar/dia podem incrementar visitantes únicos e interessados duas vezes. |
| WEB-98 | high | poda remove eventos brutos, mas overview e breakdown ainda leem somente os dados removidos, quebrando retenção Pro/Elite. |
| WEB-99 | high | período comparativo termina um dia cedo; 01/09 compara quase todo 30/08 em vez de 31/08. |
| WEB-100 | high | Starter e Pro anunciam analytics por jogo, mas API e UI bloqueiam qualquer plano abaixo do Elite. |

Todos estão em **Backlog**, atribuídos ao responsável atual, com exatamente um Type,
uma Area, um `agent-*`, project, prioridade, estimate e `ready-for-agent`. WEB-89 foi
corrigido no Linear durante a revisão: a formulação inicial tratava comparação no
Starter como vazamento, mas a spec e o catálogo confirmam que ela é parte da oferta.

## Achados anteriores desta mesma auditoria

As rodadas anteriores registraram WEB-77–WEB-87 para isolamento de banco de teste,
cache privado entre contas, ordenação da descoberta, estado temporal de eventos,
limpeza de participantes, intervalo de analytics, integridade ao excluir evento,
timezone comercial, chave de cache geográfica e tratamento do envelope de erro do
Better Auth. Esses itens foram trabalhados por outros agentes; a base final já contém
as respectivas mudanças, e o status corrente deve ser consultado no Linear/Git antes
de qualquer novo despacho.

## Triagens que não viraram ticket novo

- advisories high/critical de plugins Better Auth não habilitados não foram descritos
  como vulnerabilidades alcançáveis; somente o fluxo usado de exclusão/sessão virou
  WEB-91;
- advisories do Vite afetam dev server em Windows, enquanto esta execução ocorreu em
  macOS; Hono entra pela CLI/MCP do shadcn, não pelo runtime do produto;
- `@upstash/redis` está declarado diretamente em `packages/api` e no lockfile; a
  hipótese de import ausente foi descartada;
- webhooks Dodo não ganharam correção nova: checkout está desativado e WEB-31 já
  substitui o fornecedor; WEB-57/WEB-60 cobrem as inconsistências de assinatura que
  permanecem relevantes;
- arquivos grandes e componentes internos coesos não foram transformados em tickets
  de “quebrar arquivo” sem custo demonstrado;
- `transition-all`, imagens sem dimensões explícitas e o tamanho do chunk foram
  registrados como sinais, não como defeitos, por falta de impacto reproduzido;
- telemetria de recomendações aceita IDs fornecidos pelo cliente, mas o efeito atual
  confirmado fica restrito à telemetria secundária/ao próprio usuário; sem consumidor
  de negócio afetado, abrir uma camada de assinatura agora seria especulativo.

## Limites do fechamento

- análise estática e gates reduzem risco, mas não provam ausência de defeitos;
- fluxos que exigem credenciais/serviços externos reais ficaram explicitamente fora;
- nenhum dado foi apagado, resetado, escondido por stash ou enviado a banco remoto;
- nenhuma branch remota, PR, issue ou item Linear fora dos tickets documentados foi
  fechado ou movido de status por esta auditoria.
