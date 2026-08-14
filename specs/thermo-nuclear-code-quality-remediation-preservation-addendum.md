# Adendo de preservação — remediação thermo-nuclear

> Data: 13 de agosto de 2026
> Status: contrato autoritativo para a execução da remediação
> Documento-base: `specs/thermo-nuclear-code-quality-remediation.md`

## 1. Objetivo

Este adendo registra as decisões tomadas na sessão de grilling que antecede a
implementação. Ele altera somente os pontos em que a spec-base conflita com o
requisito de preservar tudo o que já está implementado no worktree atual.

O objetivo desta entrega é melhorar estrutura, tipagem, ownership, testes e
confiabilidade sem redesenhar o produto nem remover funcionalidades visíveis.

## 2. Fonte de verdade e baseline

A ordem de autoridade desta execução é:

1. este adendo para decisões de preservação;
2. a spec-base para as frentes F1–F9 que não conflitarem com este adendo;
3. as specs aprovadas do redesign para comportamento e aparência;
4. o worktree atual como baseline funcional e visual concreto.

O baseline é o worktree não commitado atual, não `HEAD` nem `origin/master`.
Nenhuma etapa pode restaurar, sobrescrever ou descartar suas mudanças para
aproximar o código da base Git.

## 3. Invariantes de preservação

- manter os mesmos textos, controles, links, rotas, ordem, estados produtivos,
  breakpoints, tokens, layout e interações;
- manter contratos públicos, payloads, cache keys, analytics, guards, roles,
  redirects e integrações;
- manter a resposta otimista de favoritos, incluindo rollback e invalidation,
  sem fabricar objetos inválidos no cache;
- manter sugestões e filtros atualmente visíveis e funcionais;
- não corrigir bugs descobertos fora de F1–F9 nesta entrega; documentá-los com
  reprodução e impacto para correção futura;
- priorizar preservação comprovável sobre metas numéricas de tamanho. Uma meta
  não justifica mover complexidade às cegas ou criar uma abstração artificial.

Para o visual, vale “zero mudança intencional”. Diferenças de layout, cor,
espaçamento, conteúdo ou comportamento são regressões. Apenas variações de
rasterização/antialiasing do navegador são toleráveis.

## 4. Exceções observáveis autorizadas

As seguintes correções da spec-base continuam autorizadas:

- tornar a policy mensal de criação de eventos server-side e canônica;
- serializar criações concorrentes do mesmo bar para impedir que Starter passe
  do limite;
- representar loading, erro e retry reais nas queries, sem transformar falha em
  lista vazia ou sucesso aparente;
- impedir criação enquanto a policy canônica estiver indisponível;
- remover somente código comprovadamente morto.

Essas correções não autorizam alterar preço, limite, plano, permissão ou fluxo
válido. Starter preserva a semântica mensal do backend; Pro e Elite continuam
ilimitados.

## 5. Alteração autoritativa da F2

Ficam substituídas as instruções da spec-base que exigem remover
`favoritesOnly`, `gamesTodayOnly`, `applySuggestion`, “Sugestões para você” ou
“Talvez você queira experimentar”. Os respectivos gates de zero ocorrência não
se aplicam a esta execução.

Essas funcionalidades devem:

- permanecer visíveis e conservar exatamente o comportamento atual;
- receber testes de caracterização suficientes para proteger a refatoração;
- poder ser reorganizadas internamente apenas quando a equivalência for
  demonstrável;
- não ganhar novos modos, regras, filtros, copy ou tratamento visual nesta
  entrega.

A meta de qualidade da F2 permanece válida: eliminar tipos paralelos, casts,
cache otimista inválido, lifecycle remoto falso, empty states duplicados,
spacer invisível e ownership excessivo. A rota deve virar uma composition root
sem apagar capacidades existentes.

## 6. Critério para remoção de código morto

Uma remoção só é permitida com evidência objetiva de:

- zero consumidores estáticos e dinâmicos;
- ausência de contrato público ou compatibilidade;
- ausência de efeito em comportamento, acessibilidade, CSS, analytics, loader
  ou integração;
- prova antes/depois proporcional ao risco.

Na dúvida, o código permanece e a pendência é registrada neste documento ou no
relatório final de QA.

## 7. Funcionalidades preservadas ainda não prontas para decisão de produto

As sugestões do dashboard e os filtros `favoritesOnly`/`gamesTodayOnly` estão
implementados e serão preservados, mas ainda não possuem validação de produto
suficiente para serem considerados uma direção definitiva. Uma entrega futura
deve decidir explicitamente entre promover, redesenhar ou retirar essas
capacidades, com critérios de uso, analytics, conteúdo, acessibilidade e estados
de erro definidos antes de qualquer mudança.

Até essa decisão, esta remediação não deve ampliar nem remover essas
funcionalidades.

## 8. Verificação e pendências

- caracterizar comportamento antes das extrações de maior risco;
- repetir as mesmas provas depois de cada fronteira estrutural;
- executar testes que escrevem no banco somente com `DATABASE_URL`
  comprovadamente descartável e isolada;
- se o banco seguro não estiver disponível, implementar o teste concorrente e
  registrá-lo como não executado, sem alegar aprovação;
- executar o tour visual conectado quando houver browser disponível;
- registrar bugs fora do escopo com reprodução e impacto, sem corrigi-los nesta
  entrega.

## 9. Condição de aceite ajustada

A remediação é aceita quando F1–F9 forem concluídas ou justificadamente
limitadas, todas as capacidades atuais forem preservadas, as exceções da seção
4 estiverem verificadas e os gates aplicáveis passarem. Metas de linhas são
instrumentos de diagnóstico; não superam a obrigação de equivalência
comportamental.

## 10. Achados durante a execução

- Ao tornar o typecheck root honesto, o web revelou que a inicialização do
  PostHog aceitava uma project key possivelmente ausente. O fluxo agora não
  inicializa o SDK sem key; com configuração válida, o comportamento permanece
  idêntico. Esse estreitamento foi necessário para que o gate obrigatório
  verificasse o grafo real sem uma asserção insegura.
- O `DATABASE_URL` disponível em `apps/web/.env` aponta para um host Neon remoto
  e para o banco genérico `neondb`, sem marcador ou prova de isolamento. O teste
  concorrente de limite Starter foi implementado com dupla trava explícita
  (`RUN_DISPOSABLE_DB_TESTS=1` e host local + nome descartável), mas não foi
  executado nesta entrega. A suíte de integração completa da seção 8.2 da
  spec-base continua pendente até existir banco descartável isolado; não usar o
  banco atualmente configurado para essa validação.

## 11. Pendências futuras preservadas

As pendências abaixo não autorizam remoção de funcionalidade nem mudança visual
oportunista. Devem ser tratadas em entregas próprias, com baseline e prova
compatíveis com o risco:

- executar a suíte de integração da seção 8.2 em um Postgres local/efêmero cujo
  isolamento seja comprovado; o teste concorrente implementado permanece
  bloqueado até lá;
- repetir a matriz de `specs/qa/viewport-matrix.json` em 320, 390 e 1440 px,
  incluindo zoom de 200%, teclado, reduced motion, banner de impersonação,
  textos longos e rotas autenticadas. A conexão de browser desta sessão não
  expôs nenhum navegador, portanto build/SSR não foi apresentado como prova
  visual;
- sanear o gate Biome global em uma entrega separada. A execução atual ainda
  encontra configuração de parser incompatível com diretivas Tailwind, formato
  legado de snapshots/journal Drizzle e erros preexistentes nos componentes
  compartilhados de UI; aplicar auto-fix global nesta branch arriscaria alterar
  arquivos fora da remediação;
- avaliar substituição segura dos `<img>` ativos somente quando houver primitive
  de imagem compatível com Vite/TanStack e comparação visual. A troca não foi
  inferida a partir do aviso `noImgElement`, pois poderia alterar carregamento,
  crop e rasterização;
- revisar as declarações CSS `!important` que protegem integração com primitives
  externas e reduced motion. Elas foram mantidas durante a divisão mecânica
  porque removê-las sem QA visual poderia mudar a cascata;
- decidir o destino de sugestões, `favoritesOnly` e `gamesTodayOnly` conforme a
  seção 7 deste adendo, usando evidência de produto antes de promover,
  redesenhar ou retirar qualquer capacidade.
