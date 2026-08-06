# Spec de implementacao — nova landing page Onside

Status: pronta para implementacao

Escopo desta entrega: especificacao somente; nenhuma mudanca funcional da landing faz parte desta tarefa

Rota de destino: `apps/web/src/routes/index.tsx` (`/`)

Stack: TanStack Start/Router, React 19, TypeScript, TanStack Query, tRPC v11, Tailwind v4, CSS local da landing e Bun

## 1. Contexto e fonte de verdade

O pedido menciona `apps/web/src/utils`, mas, neste checkout, esse diretorio contem apenas utilitarios da aplicacao:

- `apps/web/src/utils/auth-guards.ts`
- `apps/web/src/utils/format-phone.ts`
- `apps/web/src/utils/trpc.ts`

Os arquivos que efetivamente descrevem a nova landing estao no diretorio nao rastreado `./utils` na raiz do workspace:

- `utils/index.html`: estrutura, conteudo, ordem das secoes e semantica de referencia;
- `utils/styles.css`: direcao visual, tokens, layouts, breakpoints e motion de referencia;
- `utils/script.js`: comportamento do header, menu mobile, demo lista/mapa e submits demonstrativos.

Esta spec considera esses tres arquivos a fonte visual e editorial da nova versao. O codigo React atual continua sendo a fonte de verdade para integracoes de producao, contratos de API, analytics, assets, SEO e convencoes do repositorio.

### 1.1. Hierarquia das fontes de verdade

Quando houver conflito, a implementacao deve usar esta ordem:

1. contratos reais de backend, seguranca, dados e analytics da aplicacao;
2. esta spec, que resolve as diferencas entre prototipo e producao;
3. estrutura, copy e aparencia de `utils/index.html` e `utils/styles.css`;
4. implementacao atual da landing, somente para comportamentos produtivos que nao podem regredir;
5. `utils/script.js`, apenas como demonstracao de intencao de interacao, nunca como implementacao pronta para producao.

### 1.2. Principio de fidelidade

A nova pagina deve parecer a landing definida em `./utils`, e nao uma reorganizacao visual da landing atual. Isso inclui:

- composicao editorial de alto contraste;
- paleta paper/ink/acid/live;
- tipografia condensada e em caixa alta nos titulos;
- hero com mock de telefone sobre circulo acid;
- faixas, bordas duras, sombras deslocadas e cards sem o acabamento arredondado generico da aplicacao;
- ordem, mensagem e hierarquia das secoes;
- dashboard para bares e bloco de confianca;
- formulario principal orientado por cidade;
- segundo formulario dedicado a bares;
- CTA final acid e footer escuro.

A fidelidade nao autoriza copiar problemas do prototipo: submits falsos, controles sem acao, links inacessiveis, texto com contraste insuficiente, menu fechado ainda focavel, animacao sem pausa ou dependencia de Google Fonts.

## 2. Objetivo do produto

A landing precisa explicar, provar e converter a seguinte proposta:

> O Onside mostra onde uma partida sera transmitida e qual e o ambiente de cada bar antes de a pessoa sair de casa.

Ela atende dois publicos na mesma pagina:

- torcedores, que votam na proxima cidade e entram na lista de espera;
- bares e pubs, que registram interesse no piloto.

O fluxo narrativo deve ser:

1. promessa direta no hero;
2. demonstracao concreta do produto;
3. explicacao do problema atual;
4. definicao do que o Onside e;
5. jornada em tres passos;
6. reforco emocional da experiencia coletiva;
7. proposta de valor para bares;
8. modelo de confianca;
9. conversao de torcedores por cidade;
10. conversao de bares;
11. reducao de objecoes com FAQ;
12. CTA final e footer.

## 3. Resultados esperados

Ao final da futura implementacao:

- `/` renderiza a nova composicao em React e SSR sem depender do HTML estatico;
- a pagina permanece indexavel e conserva metadados, canonical, Open Graph, Twitter e JSON-LD;
- o ticker usa eventos reais quando existirem e fallback editorial quando nao existirem;
- o formulario de torcedor persiste cidade, nome, e-mail e telefone opcional na waitlist real;
- o formulario de bar persiste os campos de contato e da casa na mesma waitlist, com `role: 'pub'`;
- nenhuma submissao exibe sucesso antes da confirmacao do servidor;
- eventos do PostHog continuam funcionando sem incluir PII;
- a pagina funciona por teclado, leitor de tela, toque e com `prefers-reduced-motion`;
- a pagina nao cria overflow horizontal em nenhuma largura suportada;
- a implementacao nao altera o visual das rotas autenticadas nem os tokens globais do pacote de UI.

## 4. Fora de escopo

Nao fazem parte desta implementacao:

- criar o produto de busca, mapa, reserva ou pagamento mostrado nos mocks;
- tornar o dashboard demonstrativo um painel funcional;
- inventar disponibilidade, lotacao ou reservas reais na landing;
- modificar autenticacao, onboarding ou regras de acesso;
- redesenhar as telas internas;
- trocar os favicons ou a OG image sem um novo asset aprovado;
- adicionar bibliotecas de animacao;
- importar ou servir `utils/index.html`, `utils/styles.css` ou `utils/script.js` em producao;
- executar migracoes ou testes contra banco compartilhado, remoto ou nao comprovadamente descartavel.

## 5. Invariantes que devem ser preservadas

### 5.1. Integracoes reais

- Continuar usando `client.waitlist.join.mutate` por meio de `useTRPCClient()` e `useMutation()`.
- Continuar usando `trpc.pubs.getEliteEvents.queryOptions()` para o ticker.
- Continuar emitindo `analytics.landingViewed()` uma vez quando a rota montar no cliente.
- Continuar emitindo `analytics.landingCtaClicked(...)` para CTAs relevantes.
- Continuar emitindo `analytics.waitlistSubmitted(role)` somente depois de sucesso real.
- Nao enviar cidade, e-mail, nome da casa, telefone ou qualquer outra PII ao PostHog.

### 5.2. Infraestrutura existente

- Manter TanStack Router como dono da rota e do `<head>`.
- Manter tRPC/React Query como camada de comunicacao.
- Reutilizar os assets publicos existentes quando forem compativeis.
- Manter o CSS da landing isolado sob `.onside-page`.
- Nao modificar `packages/ui/src/styles/globals.css` para acomodar esta pagina.
- Nao usar comandos de formatacao globais com escrita automatica.

### 5.3. Compatibilidade de dados

- Entradas historicas da waitlist devem continuar legiveis.
- Os campos atuais `name`, `phone`, `role`, `pubName` e `bairro` nao devem ser removidos.
- O e-mail continua unico conforme a restricao atual; uma tentativa duplicada deve resultar em mensagem clara, nunca em sucesso falso.
- O painel interno e o CSV devem continuar funcionando depois da inclusao de cidade.

## 6. Diferencas entre a referencia e a producao atual

| Area | Referencia em `./utils` | Producao atual | Decisao desta spec |
|---|---|---|---|
| Estrutura | 12 blocos editoriais, incluindo problema, definicao, comunidade, confianca e 2 formularios | 6 blocos principais | Adotar integralmente a nova ordem editorial |
| Hero | Mock de telefone em circulo acid | Foto hero + card ao vivo | Substituir pelo mock de telefone da referencia |
| Demo | Alterna lista/mapa | Demo extensa de busca, bar, mesa e pagamento | Implementar apenas lista/mapa da nova referencia; nao sugerir pagamento funcional |
| Ticker | Exemplos estaticos | Query real com fallback e pausa | Preservar query real, fallback novo e controle de pausa |
| Waitlist fan | Cidade + e-mail | Nome + e-mail + perfil + telefone e campos de bar | Usar fluxo dedicado de fan, preservar nome/telefone e adicionar cidade |
| Interesse de bar | Nome do bar + cidade + e-mail | Mesmo formulario com toggle de perfil | Criar formulario dedicado, expor os campos de contato/bar e enviar `role: 'pub'` |
| Submits | Sucesso local simulado | Mutacao real | Usar somente mutacao real |
| Fontes | Google Fonts: Anton, Archivo e Roboto Mono | Anton, Archivo e Geist Mono self-hosted | Reutilizar fontes self-hosted; Geist Mono e a substituicao deliberada de Roboto Mono |
| Scroll | CSS smooth e header fixo | Hook global que intercepta anchors | Preferir anchors nativos + `scroll-padding`/`scroll-margin`, preservando URL/hash |
| Motion | Pulse, marquee e microinteracoes | Motion mais completo e reduced-motion | Usar motion restrito da nova referencia, com pausa e reduced-motion robustos |
| Cidade | Central para a proposta, mas submit fake | Nao existe no schema da waitlist | Adicionar campo `city` ao contrato, schema e admin |
| SEO | Titulo e description novos | Metadados Onside atuais | Atualizar para a nova mensagem sem perder OG, canonical, JSON-LD e preloads |

## 7. Arquitetura de arquivos alvo

### 7.1. Arquivos a alterar

- `apps/web/src/routes/index.tsx`
  - manter a declaracao da rota, analytics de page view e JSON-LD;
  - atualizar metadados para a nova proposta;
  - remover o uso de `useSmoothScroll()` se a navegacao nativa descrita nesta spec for adotada;
  - continuar importando o componente raiz e o CSS local da landing.

- `apps/web/src/components/landing/onside-landing.tsx`
  - tornar-se o compositor da nova estrutura;
  - concentrar arrays editoriais estaticos tipados;
  - renderizar secoes puras e delegar estado somente aos componentes interativos.

- `apps/web/src/components/landing/onside-app-demo.tsx`
  - substituir a demo atual de seis telas pelo mock lista/mapa da nova referencia;
  - manter somente o estado necessario para `list` versus `map`;
  - nao simular reserva ou pagamento.

- `apps/web/src/components/landing/onside-waitlist.tsx`
  - ser reestruturado para exportar o formulario de torcedor e o formulario de interesse de bar, ou para delegar cada um a um componente pequeno no mesmo dominio;
  - manter a mutacao real, loading, erro, sucesso e analytics.

- `apps/web/src/components/landing/onside.css`
  - substituir a composicao visual atual pela nova;
  - preservar `@font-face` self-hosted;
  - manter todo seletor visual da pagina sob `.onside-page`;
  - nao copiar seletores globais como `details`, `summary`, `body.menu-open` ou `*` sem escopo.

- `apps/web/src/lib/analytics.ts`
  - manter a API existente;
  - opcionalmente tipar os identificadores de CTA da landing como uniao de strings, sem criar eventos que carreguem PII.

- `packages/db/src/schema/waitlist.ts`
  - adicionar `city`;
  - preservar `name` obrigatorio e todos os demais campos.

- `packages/db/src/migrations/<nova-migracao>.sql`
  - adicionar a coluna `city` como nullable para compatibilidade com registros historicos;
  - nao alterar a nulabilidade dos campos existentes;
  - nao preencher cidade historica com valores inventados.

- `packages/api/src/routers/waitlist.ts`
  - atualizar validacao e persistencia;
  - manter o endpoint publico e o tratamento de duplicidade;
  - normalizar strings antes da insercao.

- `packages/api/src/routers/pubs.ts`
  - ampliar `getEliteEvents` com `neighborhood` e `city`, necessarios para o novo ticker;
  - manter o limite e a ordenacao por proximo evento.

- `apps/web/src/routes/internal_.waitlist.tsx`
  - exibir cidade;
  - incluir cidade e nome do estabelecimento na pesquisa;
  - incluir cidade no CSV;
  - continuar representando campos historicos ausentes como `—` ou string vazia no CSV.

### 7.2. Componentes recomendados

Evitar um arquivo por secao puramente estatica. A divisao recomendada e:

- `OnsideLanding`: composicao e secoes editoriais puras;
- `OnsideBrand`: simbolo SVG + wordmark, reutilizado em header, CTA e footer;
- `OnsideHeader`: estado de scroll e menu mobile;
- `OnsideTicker`: query, formatacao, fallback, loop e pausa;
- `OnsideAppDemo`: alternancia lista/mapa;
- `OnsideFanWaitlistForm`: conversao de torcedores;
- `OnsideBarInterestForm`: conversao de bares.

`OnsideBrand` e `OnsideHeader` podem ser funcoes internas de `onside-landing.tsx` se continuarem pequenos. Os tres componentes com estado devem permanecer isolados para reduzir rerenders do restante da pagina.

### 7.3. Arquivos legados

- `onside-app-demo.tsx` deve ser reaproveitado, nao mantido em paralelo com uma segunda demo.
- `onside-waitlist.tsx` deve ser reaproveitado, nao duplicado.
- Componentes antigos como `hero.tsx`, `how-it-works.tsx`, `dual-audience.tsx`, `ticker.tsx`, `waitlist-form.tsx`, `faq.tsx` e `footer.tsx` so podem ser removidos depois de uma busca de consumidores.
- `logo.tsx` nao pode ser removido: ele e usado por auth, onboarding, app shell e rotas internas.
- Os arquivos de `./utils` permanecem referencia de design e nao devem ser importados para `apps/web`.

## 8. Modelo de conteudo estatico

Arrays estaticos devem ficar no escopo de modulo para nao serem recriados a cada render. Usar tipos explicitos e chaves estaveis, nunca indice quando houver um identificador editorial natural.

Constantes recomendadas:

- `NAV_ITEMS`: label e hash;
- `TICKER_FALLBACK`: `id`, label temporal, evento e local;
- `PROBLEM_ITEMS`: numero, titulo, texto e label;
- `DEFINITION_POINTS`: numero e texto;
- `JOURNEY_STEPS`: numero, titulo, texto e variante visual;
- `BAR_BENEFITS`: lista de beneficios;
- `TRUST_ITEMS`: numero, titulo e texto;
- `FAQ_ITEMS`: pergunta e resposta;
- dados demonstrativos do telefone e do dashboard.

Nao guardar JSX nos arrays quando dados simples forem suficientes. Isso facilita testes, internacionalizacao futura e revisao editorial.

## 9. Estrutura completa da pagina

A ordem do DOM deve ser exatamente:

1. skip link;
2. header/nav;
3. `<main id="main">`;
4. hero `#top`;
5. schedule strip;
6. problema `#produto`;
7. definicao do produto;
8. jornada `#como-funciona`;
9. comunidade;
10. bares `#bares`;
11. confianca;
12. waitlist `#lista`;
13. formulario compacto de bar `#bar-form`;
14. FAQ `#duvidas`;
15. CTA final;
16. footer.

Deve existir somente um `<h1>`. Titulos de secao usam `<h2>` e itens internos usam `<h3>` sem pular niveis.

## 10. Especificacao por secao

### 10.1. Skip link

- Texto: `Pular para o conteúdo`.
- Destino: `#main`.
- Invisivel fora de foco, visivel em `:focus-visible`.
- Posicao fixa acima do header, `z-index` superior ao header e contraste ink sobre acid.
- Nao usar apenas `:focus`; o indicador nao precisa aparecer no clique do mouse.

### 10.2. Header e navegacao

Conteudo desktop:

- marca Onside com destino `#top` e label `Onside — início`;
- links `O produto`, `Como funciona`, `Para bares`, `Dúvidas`;
- CTA `Quero na minha cidade` com destino `#lista`.

Comportamento:

- fixo no topo;
- altura de 74 px acima de 760 px e 66 px em mobile;
- fundo paper translucido com `backdrop-filter: blur(16px)` quando suportado;
- borda inferior sutil;
- depois de `scrollY > 12`, adicionar sombra leve;
- listener de scroll passivo, instalado uma vez e removido no cleanup;
- o estado inicial deve refletir `window.scrollY`, inclusive ao restaurar uma pagina ja rolada.

Menu mobile:

- breakpoint em ate 1100 px;
- botao real com area minima de 44 x 44 px;
- `aria-label` alterna entre `Abrir menu` e `Fechar menu`;
- `aria-expanded` e `aria-controls` apontam para o painel;
- usar duas barras CSS ou icone vetorial; nao usar caractere de menu como unico affordance;
- painel fechado deve estar `hidden`/`inert` ou desmontado, para impedir tabulacao fora da tela;
- abrir bloqueia apenas o scroll de fundo e deve restaurar o estado anterior ao fechar/desmontar;
- fechar ao clicar em link, pressionar `Escape` ou mudar para viewport desktop;
- ao abrir, focar o primeiro link; ao fechar por Escape, devolver foco ao botao;
- nao e necessario focus trap se o painel nao cobrir a tela inteira, mas a ordem de foco deve permanecer logica.

Navegacao por hash:

- usar anchors nativos para preservar deep link, historico e copiar URL;
- aplicar `scroll-padding-top` no documento e `scroll-margin-top` nos alvos;
- `scroll-behavior: smooth` somente fora de reduced motion;
- nao impedir o evento de clique globalmente.

Analytics:

- CTA do header: `landingCtaClicked('nav_city_waitlist')`;
- links editoriais nao precisam de evento individual nesta fase.

### 10.3. Hero

Copy e ordem devem seguir `utils/index.html`:

- eyebrow com status: `TRANSMISSÕES CONFIRMADAS PERTO DE VOCÊ`;
- titulo: `DESCUBRA ONDE ASSISTIR. ANTES DO APITO.`;
- texto explicativo sobre jogo, lotacao, som, teloes, torcida e mesas;
- CTA primario para `#lista`;
- CTA secundario `Tenho um bar` para `#bares`;
- provas: gratuito para torcedores, cidades escolhidas por demanda e sem spam.

Layout desktop:

- shell maximo de 1260 px;
- grid com coluna de copy e coluna de demo, proporcao aproximada `.92fr / 1.08fr`;
- gap de 60 px;
- hero com padding superior suficiente para o header fixo e altura minima aproximada de 900 px;
- titulo fluido entre 70 e 116 px, com line-height proximo de `.91`;
- trecho `ANTES DO APITO` vazado por stroke, sem perder legibilidade em browsers sem `-webkit-text-stroke`.

Layout intermediario/mobile:

- abaixo de 1100 px, empilhar copy e demo;
- abaixo de 760 px, titulo entre 58 e 82 px, CTA primario em largura total e texto em pelo menos 16 px;
- nao usar `transform: scale(.88)` sobre toda a demo interativa, pois isso reduz alvos de toque; ajustar dimensoes internas com `clamp()`.

Analytics:

- CTA primario: `hero_city_waitlist`;
- CTA secundario: `hero_bar_interest`.

### 10.4. Mock do aplicativo no hero

O mock e demonstrativo, mas deve representar fielmente:

- topbar com horario e `Pinheiros · SP`;
- simbolo Onside;
- busca por `Flamengo x Palmeiras`;
- card de jogo ao vivo, placar 2 x 2 e minuto da partida;
- contador de 3 lugares transmitindo;
- lista com Bar do Ze, Sports Central e The Red Lion;
- informacoes de distancia, lotacao, som, teloes e confirmacao;
- mapa alternativo com 3 pins e sheet do Bar do Ze;
- nav visual inferior `Hoje`, `Mapa`, `Buscar`;
- notas flutuantes `Transmissão confirmada` e `Próxima cidade — Você decide` no desktop.

Interacao permitida:

- somente o controle `Ver mapa`/`Ver lista` troca a visualizacao;
- controle real `<button type="button">`;
- `aria-pressed`, `aria-controls` e nome acessivel coerentes com o estado;
- manter ambas as views com layout reservado para evitar salto de altura;
- anunciar a troca com uma regiao `aria-live="polite"` curta, sem reler todo o mock;
- opcionalmente emitir `demo_view_map` e `demo_view_list` em `landingCtaClicked`.

Controles falsos devem virar decoracao:

- menu do app, limpar busca e nav inferior nao devem ser `<button>` se nao executarem acao;
- marcar glifos decorativos com `aria-hidden="true"`;
- o mock deve ser uma `<figure>` com `aria-label`/`figcaption` explicando que e demonstracao, para nao ser confundido com o produto ativo.

Visual:

- circulo acid de 560 px no desktop, com dois aneis;
- telefone entre 335 e 365 px sem overflow;
- borda ink de 2 px, raio de 34 px e sombra dura deslocada;
- leve rotacao somente no desktop; remover em mobile se causar corte;
- esconder notas flutuantes abaixo de 760 px;
- textos internos menores podem ser tratados como parte da ilustracao, mas qualquer controle real deve manter alvo de 44 px e label legivel.

### 10.5. Schedule strip/ticker

Visual:

- faixa ink com texto paper, bordas ink e destaque acid para data/hora;
- movimento horizontal continuo de 36 s no modo padrao;
- separadores verticais entre itens.

Dados:

- iniciar imediatamente com fallback editorial para evitar layout vazio;
- consultar `pubs.getEliteEvents` em paralelo, sem bloquear hero ou SSR;
- quando houver dados, substituir o fallback pela resposta real;
- incluir `bar_name`, `championship`, `starts_at`, `sport_name`, `neighborhood` e `city` no retorno;
- formatar datas com `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ... })`;
- gerar labels relativas `HOJE`, `AMANHÃ` ou dia abreviado somente com comparacao na mesma timezone;
- tratar data invalida usando fallback textual, sem renderizar `Invalid Date`.

Loop:

- duplicar duas copias identicas da sequencia completa;
- chaves combinam indice da copia com id estavel do evento;
- a animacao percorre exatamente uma copia para produzir loop sem salto;
- nao usar array que repete somente parte da sequencia.

Controle:

- manter botao `Pausar`/`Retomar`, `aria-pressed` e label acessivel;
- pausar tambem em hover e `focus-within` sem perder o estado manual;
- em reduced motion, a faixa fica estatica e o controle de pausa pode ser ocultado;
- o conteudo precisa continuar legivel quando a animacao estiver desligada.

### 10.6. Secao do problema (`#produto`)

- kicker `O PROBLEMA DE VERDADE`;
- titulo em duas ideias, com `SABER SE O JOGO VAI PASSAR` em live;
- tres linhas numeradas com as copies da referencia;
- labels `INFORMAÇÃO GENÉRICA`, `INFORMAÇÃO DESCARTÁVEL` e `TARDE DEMAIS`;
- desktop: grid `70px / 1.15fr / 1.25fr / 190px`;
- tablet: remover a quarta coluna dedicada e mover label para baixo do texto;
- mobile: numero na primeira coluna e todo conteudo na segunda;
- bordas superior/inferior de 1.5 px;
- o label live nao pode depender apenas de cor: o texto continua obrigatorio.

### 10.7. Definicao do Onside

- fundo ink, texto paper e kicker acid;
- titulo `NÃO É UMA LISTA DE SPORTS BARS.`;
- big copy: programacao esportiva dos bares atualizada para o jogo desejado;
- tres pontos numerados exatamente como na referencia;
- grid de duas colunas no desktop com gap amplo;
- uma coluna abaixo de 1100 px;
- corpo secundario deve usar tom que alcance contraste AA sobre ink.

### 10.8. Jornada (`#como-funciona`)

- kicker `DO JOGO À MESA`;
- titulo `TRÊS DECISÕES. NENHUMA SURPRESA.`;
- intro centralizada e largura de leitura limitada;
- tres etapas com alternancia visual/copy no desktop:
  1. `Diga o jogo`: campo demonstrativo e chips de esporte;
  2. `Compare o clima`: tres linhas de bares;
  3. `Chegue sabendo`: card de reserva confirmada.
- os campos, chips e cards puramente demonstrativos nao devem ser controles focaveis;
- usar elementos semanticos de apresentacao, nao botoes que nao fazem nada;
- mobile sempre mostra visual antes da copy, inclusive na etapa reversa;
- bordas e blocos seguem a estetica reta da referencia;
- nao adicionar scroll reveal generico.

### 10.9. Comunidade

- imagem `apps/web/public/hero-bar.jpg` cobrindo a secao;
- usar `<img>` absoluto com `width={1280}`, `height={1024}`, `loading="lazy"`, `decoding="async"` e `object-fit: cover`, em vez de background CSS inacessivel;
- alt descreve torcedores assistindo a uma partida em bar;
- aplicar overlays equivalentes aos gradientes da referencia;
- copy: `O JOGO É AQUI`, `O GOL É O MESMO. ASSISTIR JUNTO É OUTRA COISA.` e paragrafo explicativo;
- CTA para `#lista`, evento `community_city_waitlist`;
- min-height aproximada de 790 px desktop e 700 px mobile;
- o crop muda para preservar pessoas/conteudo em mobile.

### 10.10. Para bares (`#bares`)

- fundo acid;
- copy e beneficios da referencia;
- CTA para `#bar-form`, evento `bars_register_interest`;
- nota `Cadastro gratuito durante o lançamento.`;
- grid `.76fr / 1.24fr` no desktop e uma coluna abaixo de 1100 px.

Dashboard demonstrativo:

- header `ONSIDE PARA BARES` e `Bar do Zé`;
- sidebar visual com as cinco secoes;
- cabecalho da semana;
- CTA visual `+ Adicionar transmissão` sem semantica de botao se nao houver acao;
- metricas com `—` e `Disponível no piloto`, para nao inventar dados;
- tres itens de grade e estados `PUBLICADO`/`RASCUNHO`;
- borda, sombra dura e rotacao leve apenas no desktop;
- no mobile, ocultar sidebar, remover rotacao e reorganizar status para nova linha;
- nenhum item do dashboard deve entrar na ordem de tabulacao.

### 10.11. Confianca

- kicker `CONFIANÇA ANTES DA ESCALA`;
- titulo e tres itens da referencia;
- preservar as afirmacoes de produto sem sugerir que a confirmacao comunitaria ja esta ativa fora do piloto;
- se a funcionalidade ainda nao existir, a copy deve continuar em linguagem futura ou de proposta, conforme aprovado pelo produto;
- duas colunas no desktop e uma abaixo de 1100 px.

### 10.12. Waitlist de torcedor (`#lista`)

Conteudo:

- fundo ink;
- kicker acid;
- titulo `AJUDE O ONSIDE A CHEGAR AÍ.`;
- explicacao de que o cadastro funciona como voto por cidade;
- fatos: gratis, sem newsletter e sem data falsa.

Campos visiveis, na ordem:

1. cidade, requerida;
2. nome, requerido;
3. e-mail, requerido;
4. telefone, opcional.

Decisao de produto desta spec:

- a referencia visual destaca cidade/e-mail, mas a producao deve continuar espelhando todos os campos do backend ativo;
- nome continua obrigatorio porque o contrato atual exige `min(2)`;
- telefone continua opcional e reutiliza o `PhoneInput` existente com `variant="onside"`;
- `role` e enviado como `fan` e nao aparece como toggle porque esta secao ja define o contexto;
- a cidade passa a ser persistida explicitamente; nao reutilizar `bairro` para esse dado.

Agrupamento visual:

- etapa `01 — SUA CIDADE`: campo cidade;
- etapa `02 — SEU CONTATO`: nome, e-mail e telefone opcional;
- o agrupamento preserva a hierarquia numerada da referencia sem esconder campos exigidos pela integracao real;
- telefone pode ocupar uma linha secundaria, mas nao deve ficar atras de disclosure que prejudique descoberta ou preenchimento automatico.

Detalhes dos campos:

- cidade: `name="city"`, `autoComplete="address-level2"`, `maxLength={100}`;
- nome: `name="name"`, `type="text"`, `autoComplete="name"`, `minLength={2}`, `maxLength={100}`;
- e-mail: `name="email"`, `type="email"`, `autoComplete="email"`, `spellCheck={false}`, `maxLength={255}`;
- telefone: reutilizar `PhoneInput`, `name="phone"`, label `Telefone (opcional)` e valor normalizado com DDI;
- labels visiveis e clicaveis;
- placeholder e exemplo nao substituem label;
- aplicar `data-invalid` no `Field` e `aria-invalid` no controle;
- erros ficam abaixo do campo correspondente;
- foco vai para o primeiro campo invalido depois de submit;
- nao validar agressivamente a cada tecla; validar ao sair do campo ou no submit;
- manter botao habilitado ate a requisicao realmente iniciar.

Payload:

```ts
{
  role: 'fan',
  city: normalizedCity,
  name: normalizedName,
  email: normalizedEmail,
  phone: normalizedPhone || undefined
}
```

Normalizacao:

- `trim()` em cidade, nome e e-mail;
- e-mail em lowercase antes de persistir e comparar duplicidade;
- colapsar espacos internos repetidos da cidade;
- usar a normalizacao internacional do `PhoneInput`; nao concatenar DDI manualmente em um segundo lugar;
- nunca inferir cidade por IP;
- nunca inventar `name` a partir do local-part do e-mail.

Estados:

- idle: formulario completo;
- pending: `aria-busy="true"`, botao disabled e texto `Registrando…`;
- error: mensagem especifica, formulario e valores preservados;
- conflict: `Este e-mail já está na lista. Use outro e-mail ou fale com a gente.`;
- success: painel acid persistente com `role="status"`/`aria-live="polite"`, sem reset automatico;
- sucesso so aparece em `onSuccess` da mutacao.

Analytics:

- antes de chamar mutate: `landingCtaClicked('fan_waitlist_submit')`;
- depois de sucesso: `waitlistSubmitted('fan')`;
- nao emitir `waitlistSubmitted` em conflito ou erro.

### 10.13. Interesse de bar (`#bar-form`)

Campos visiveis:

- nome do contato, requerido, minimo 2 e maximo 100;
- nome do bar, requerido na UI da nova landing, maximo 100;
- cidade, requerida, maximo 100;
- bairro/endereco curto, opcional, maximo 100;
- e-mail, requerido, maximo 255;
- telefone, opcional.

Todos os inputs precisam de `<label>` real. Labels podem ser visualmente ocultos para preservar o layout compacto, mas placeholders nao sao suficientes.

Agrupamento visual:

- em desktop, usar duas linhas: dados da casa (`pubName`, `city`, `bairro`) e contato (`name`, `email`, `phone`);
- em mobile, uma coluna na mesma ordem;
- a secao ja representa `role: 'pub'`, portanto nao precisa de toggle;
- `bairro` fica visivel somente no fluxo de bar, preservando a regra de nao pedir endereco ao torcedor;
- reutilizar `PhoneInput` em vez de duplicar seletor de pais e mascara.

Payload:

```ts
{
  role: 'pub',
  name: normalizedContactName,
  pubName: normalizedBarName,
  city: normalizedCity,
  bairro: normalizedBairro || undefined,
  email: normalizedEmail,
  phone: normalizedPhone || undefined
}
```

- `bairro` continua opcional e nao deve receber cidade como valor falso;
- `name` continua obrigatorio conforme o backend;
- `phone`, `pubName` e `bairro` preservam a semantica de opcionalidade do backend, mesmo que `pubName` seja requerido pela UI desta referencia;
- usar a mesma mutacao real e o mesmo tratamento de duplicidade;
- sucesso muda o bloco para `Interesse registrado ✓` e permanece visivel;
- nao restaurar HTML antigo com `innerHTML` nem usar timer de 3.2 s;
- pending usa `Registrando…` e disabled;
- erro fica junto ao formulario com caminho de recuperacao.

Analytics:

- submit: `landingCtaClicked('bar_interest_submit')`;
- sucesso: `waitlistSubmitted('pub')`.

### 10.14. FAQ (`#duvidas`)

- manter as seis perguntas e respostas de `utils/index.html`;
- usar `<details>` e `<summary>` nativos;
- primeiro item aberto por padrao somente no SSR inicial;
- icone `+` decorativo com `aria-hidden="true"`, rotacionado quando aberto;
- summary com alvo minimo de 44 px e focus ring visivel;
- nao controlar em React sem necessidade;
- seletores CSS devem ser `.onside-faq details` e `.onside-faq summary`, nunca globais;
- respostas devem manter linha de leitura limitada.

### 10.15. CTA final

- fundo acid, conteudo centralizado;
- simbolo Onside maior;
- texto `ONSIDE · O JOGO É AQUI.`;
- titulo `ACHE A MESA ANTES DO APITO.`;
- botao ink para `#lista`;
- evento `final_city_waitlist`;
- titulo fluido entre aproximadamente 75 e 124 px no desktop e 67 a 90 px no mobile.

### 10.16. Footer

- fundo ink e texto paper;
- marca com link para `#top` e label acessivel;
- frase `Feito por quem prefere a mesa ao sofá.`;
- links `Para bares`, `Dúvidas` e `Contato`;
- contato: `mailto:contato@onside.sh`, salvo orientacao de produto diferente;
- copyright `© 2026 Onside`;
- desktop em tres colunas com copyright abaixo;
- mobile em uma coluna;
- links nao podem ficar `invisible` como no footer atual.

## 11. Contrato de dados da waitlist

### 11.1. Schema de banco

Modelo alvo:

```ts
export const waitlistEntries = pgTable('waitlist_entries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  role: waitlistRoleEnum('role').notNull(),
  pubName: text('pub_name').notNull().default('N/A'),
  bairro: text('bairro').notNull().default('N/A'),
  city: text('city'),
  createdAt: timestamp('created_at').defaultNow().notNull()
})
```

Justificativas:

- `city` e nullable no banco para que registros historicos continuem validos;
- a API da nova landing exige cidade para novos registros;
- `name` permanece obrigatorio para espelhar o contrato atual e preservar a decisao anterior da waitlist;
- `pubName` e `bairro` permanecem para compatibilidade;
- nao usar default `N/A` para cidade, pois isso contaminaria a metrica de demanda.

### 11.2. Input da API

Usar uniao discriminada por `role`, mantendo extensibilidade e mensagens precisas:

```ts
const common = {
  email: z.string().trim().toLowerCase().email().max(255),
  city: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).optional()
}

z.discriminatedUnion('role', [
  z.object({
    ...common,
    role: z.literal('fan')
  }),
  z.object({
    ...common,
    role: z.literal('pub'),
    pubName: z.string().trim().min(2).max(100).optional(),
    bairro: z.string().trim().max(100).optional()
  })
])
```

Regras:

- para `fan`, persistir `pubName: 'N/A'` e `bairro: 'N/A'`;
- para `pub`, `pubName` e requerido pela nova UI, mas continua opcional no contrato para compatibilidade; `pubName`/`bairro` usam `N/A` quando ausentes;
- converter strings opcionais vazias para `undefined` antes do insert;
- nao confiar apenas na validacao do cliente;
- manter erro `CONFLICT` para e-mail duplicado;
- nao expor erro bruto do banco;
- manter mensagem generica recuperavel para erro interno.

### 11.3. Painel interno e CSV

Atualizacoes obrigatorias:

- busca tambem por e-mail, cidade e nome do estabelecimento;
- coluna visual `Cidade`;
- cidade historica ausente exibida como `—`;
- CSV inclui `Cidade` depois de `Bairro` ou em posicao editorialmente coerente;
- valores CSV devem escapar aspas internas, nao apenas envolver o valor em aspas;
- export continua usando data UTC conforme o comportamento atual, salvo uma mudanca separada aprovada.

## 12. Ticker e contrato de eventos

`getEliteEvents` deve continuar publico e retornar no maximo 10 eventos futuros de bares ativos com plano elite.

Retorno alvo por item:

```ts
{
  bar_name: string
  championship: string
  starts_at: Date | string
  sport_name: string
  neighborhood: string
  city: string
}
```

Nao adicionar uma segunda query para localidade. Os campos pertencem ao mesmo `SELECT`, evitando waterfall.

Fallback editorial, na ordem:

- `HOJE 21:30 · NBA FINALS · VILA MADALENA`;
- `AMANHÃ 16:00 · CHAMPIONS · ITAIM`;
- `SÁB 22:00 · UFC · CONSOLAÇÃO`;
- `DOM 14:00 · GP DE INTERLAGOS · MOEMA`.

Os dados reais substituem todo o conjunto fallback; nao misturar eventos reais e ficticios na mesma faixa.

## 13. Sistema visual

### 13.1. Tokens locais

Definir dentro de `.onside-page`:

```css
--onside-ink: #12120f;
--onside-paper: #f1eee6;
--onside-acid: #c9f135;
--onside-live: #e8320c;
--onside-stone: #e7e3db;
--onside-muted: #55554f;
--onside-line: rgb(18 18 15 / 22%);
--onside-max: 1260px;
--onside-display: "Anton", "Arial Narrow", Impact, sans-serif;
--onside-body: "Archivo", Arial, sans-serif;
--onside-mono: "Geist Mono", "SFMono-Regular", Consolas, monospace;
```

Nao adicionar esses valores como tokens globais do shadcn. Sao uma identidade local da landing.

### 13.2. Fontes

- Reutilizar `anton-latin-400.woff2`, `archivo-latin-wght.woff2` e `geist-mono-latin-wght.woff2` ja publicados.
- Manter `font-display: swap`.
- Preload apenas Anton, Archivo e Geist Mono usados acima da dobra.
- Nao adicionar chamadas a Google Fonts na landing.
- Manter os arquivos OFL existentes.
- `font-synthesis: none` na landing para evitar falso bold/italic.

### 13.3. Tipografia

- h1/h2: Anton, peso 400, uppercase, line-height `.91`, tracking `-.025em`;
- body: Archivo, base 16 px, line-height 1.5 a 1.55;
- kicker/metadata: Geist Mono, uppercase, 10–11 px apenas quando nao for informacao essencial de leitura longa;
- headings devem usar `text-wrap: balance`;
- paragrafos de destaque podem usar `text-wrap: pretty`;
- corpo nunca abaixo de 16 px em formularios mobile;
- medidas de texto: aproximadamente 35–60 caracteres no mobile e 60–75 no desktop.

### 13.4. Contraste

Os valores do prototipo tem combinacoes que nao passam AA para texto pequeno:

- `#74736e` sobre paper fica abaixo de 4.5:1;
- live sobre paper deve ser reservado a texto grande, bordas ou decoracao;
- branco pequeno sobre live tambem exige ajuste.

Regras:

- usar `--onside-muted: #55554f` para corpo secundario sobre paper;
- usar paper/ink para texto pequeno em superficies live, ou uma variante live mais escura aprovada;
- manter live original para grandes titulos, status grandes e decoracao;
- testar todos os pares reais com ferramenta de contraste, nao apenas por inspecao visual.

### 13.5. Shell e espacamento

- desktop: `width: min(calc(100% - 48px), 1260px)`;
- mobile: `width: min(calc(100% - 30px), 1260px)`;
- padding vertical padrao de secao: 132 px desktop e 88 px mobile;
- usar escala coerente de 4/8 px para gaps internos;
- todos os filhos de grid recebem `min-width: 0` onde houver risco de overflow;
- `overflow-x: clip` pode ser aplicado no wrapper da landing, nunca como mascara para conteudo quebrado.

### 13.6. Bordas, raios e sombras

- bordas estruturais: 1 a 2 px em ink;
- sombras de CTA/mock: offsets duros, sem blur generico;
- raio grande somente no telefone e em elementos circulares;
- campos, cards editoriais e botoes principais permanecem retos;
- evitar misturar os cards arredondados da aplicacao autenticada nesta pagina.

## 14. Responsividade

Breakpoints de referencia:

- ate 380 px: ajuste de marca e telefone;
- ate 760 px: mobile;
- 761–1100 px: tablet/desktop compacto;
- acima de 1100 px: layout desktop completo.

### 14.1. Regras universais

- abordagem mobile-first na implementacao final, mesmo que o CSS de referencia seja desktop-first;
- sem scrollbar horizontal em 320 px;
- sem texto cortado em zoom de 200%;
- sem usar medidas JS para layout;
- `min-height: 100dvh` quando uma altura de viewport for realmente necessaria;
- respeitar safe areas em header/full bleed com `env(safe-area-inset-*)`;
- alvos de toque com minimo 44 x 44 px e espaco suficiente entre eles;
- testar portrait e landscape.

### 14.2. Matriz minima de viewports

- 320 x 568;
- 375 x 667;
- 390 x 844;
- 760 x 900;
- 768 x 1024;
- 1024 x 768;
- 1100 x 800;
- 1280 x 800;
- 1440 x 900.

### 14.3. Pontos criticos

- mock do telefone e aneis nao podem extrapolar 320 px;
- dashboard deve reorganizar status e esconder sidebar no mobile;
- formularios devem passar de grid horizontal para uma coluna;
- CTA e labels nao podem colidir com notch ou borda da tela;
- compare rows nao devem usar translate horizontal em mobile;
- overlays da comunidade precisam manter contraste em crops verticais;
- footer passa para uma coluna sem perder links.

## 15. Acessibilidade

### 15.1. Semantica

- skip link funcional;
- um `<main>` e um `<h1>`;
- hierarquia de headings sequencial;
- `<nav aria-label="Navegação principal">`;
- `<button>` para acao e `<a>` para navegacao;
- nenhum `div`/`span` clicavel;
- imagens significativas com alt; decorativas com `alt=""` ou `aria-hidden`;
- SVG da marca decorativo quando o link ja possui nome acessivel;
- campos com labels e names;
- mensagens assincronas em `aria-live="polite"`;
- `aria-busy` durante submit;
- FAQ nativo com details/summary.

### 15.2. Foco e teclado

- todo elemento interativo com `:focus-visible` de 3 px live/ink e offset adequado;
- nunca remover outline sem substituicao;
- tab order segue a ordem visual;
- menu mobile usa Escape e restaura foco;
- ticker pode ser pausado por teclado;
- demo lista/mapa funciona com Enter e Space;
- nenhum controle demonstrativo falso entra no tab order.

### 15.3. Motion e preferencias

- respeitar `prefers-reduced-motion: reduce`;
- reduced motion desliga marquee, pulse, rotacoes/translates animados e smooth scroll;
- mudancas de estado continuam perceptiveis sem depender da animacao;
- nao aplicar regra universal `* { transition-duration: .001ms }`, pois isso pode afetar componentes externos e comportamento do browser.

### 15.4. Conteudo

- nao comunicar estado apenas por acid/live;
- status sempre tem texto;
- errors explicam o problema e a proxima acao;
- copy nao deve prometer produto ja disponivel quando ainda esta em piloto;
- marca `Onside` pode usar `translate="no"` nos locais apropriados.

## 16. Motion

Motion deve ser funcional e restrito aos momentos definidos pela referencia:

- live dot: pulse de 1.8 s;
- ticker: marquee de 36 s, pausavel;
- header: background/sombra em 250 ms;
- nav underline: transform em 200 ms;
- botoes: translate de ate 3 px + sombra em 200 ms somente em hover de ponteiro fino;
- press/tap: feedback imediato sem deslocar layout;
- menu mobile: transform/opacity em 250 ms;
- FAQ: rotacao do plus em 200 ms;
- troca lista/mapa: crossfade de 180–220 ms, mantendo a mesma area.

Nao implementar:

- reveals em todas as secoes ao rolar;
- parallax;
- animacao de width/height/top/left;
- `transition: all`;
- motion que bloqueia interacao;
- animacoes maiores que 500 ms, exceto o marquee continuo.

Preferir `transform` e `opacity`. Transicoes devem ser interrompiveis quando o usuario muda o estado novamente.

## 17. Componentes shadcn e formularios

O projeto usa `components.json` com `base-lyra`, Tailwind v4 e alias de UI `@findsports_oficial/ui/components`.

Regras:

- reutilizar `FieldGroup`, `Field`, `FieldLabel`, `FieldError`, `Input` e `Button` onde a composicao nao impedir a fidelidade;
- manter `data-invalid`/`aria-invalid` e `data-disabled`/`disabled` coerentes;
- nao instalar componentes novos sem necessidade;
- nao usar `ToggleGroup`, pois os dois publicos agora possuem formularios separados;
- customizacao de marca fica no CSS local e nao altera implementacao upstream dos componentes;
- spinner, se usado, deve ser composto dentro de `Button` e o botao fica disabled;
- imports devem usar os aliases atuais, sem acessar internals de `packages/ui` por caminho relativo.

## 18. SEO e metadados

### 18.1. Meta basica da rota

Valores alvo:

- title: `Onside — Descubra onde assistir`;
- description: `Descubra quais bares vão transmitir o seu jogo, com lotação, som, telões e torcida antes de sair de casa.`;
- theme-color: `#C9F135`;
- robots: `index, follow`;
- canonical: `https://findsports.com.br/`;
- idioma: `pt-BR` no documento.

### 18.2. Open Graph/Twitter

- manter URL canonica e `og:type=website`;
- manter dimensoes 1200 x 630;
- continuar usando `/og-image.png?v=2` enquanto nenhum novo asset for aprovado;
- atualizar title/description para a nova mensagem;
- manter `og:site_name=Onside` e `og:locale=pt_BR`;
- manter `twitter:card=summary_large_image`.

### 18.3. JSON-LD

Manter `SoftwareApplication` com:

- `name: Onside`;
- `applicationCategory: LifestyleApplication`;
- `operatingSystem: Web`;
- URL canonica;
- `inLanguage: pt-BR`;
- oferta gratuita;
- audiencia de torcedores e bares esportivos no Brasil;
- description atualizada para a nova proposta.

O objeto e estatico e serializado com `JSON.stringify`. Nao interpolar entrada de usuario.

### 18.4. Assets e fonts

- preloads de fontes continuam na rota;
- hero below-fold usa lazy loading;
- mock do hero e CSS/HTML, portanto nao exige imagem critica adicional;
- manter width/height explicitos em imagens;
- nao publicar assets presentes em referencias se nao forem consumidos.

## 19. Analytics

Eventos obrigatorios:

| Momento | Evento | Propriedades |
|---|---|---|
| montagem da rota | `landing_viewed` | nenhuma adicional |
| CTA header | `landing_cta_clicked` | `{ cta: 'nav_city_waitlist' }` |
| CTA hero fan | `landing_cta_clicked` | `{ cta: 'hero_city_waitlist' }` |
| CTA hero bar | `landing_cta_clicked` | `{ cta: 'hero_bar_interest' }` |
| CTA comunidade | `landing_cta_clicked` | `{ cta: 'community_city_waitlist' }` |
| CTA secao bares | `landing_cta_clicked` | `{ cta: 'bars_register_interest' }` |
| submit fan iniciado | `landing_cta_clicked` | `{ cta: 'fan_waitlist_submit' }` |
| fan persistido | `waitlist_submitted` | `{ role: 'fan' }` |
| submit bar iniciado | `landing_cta_clicked` | `{ cta: 'bar_interest_submit' }` |
| bar persistido | `waitlist_submitted` | `{ role: 'pub' }` |
| CTA final | `landing_cta_clicked` | `{ cta: 'final_city_waitlist' }` |

Eventos opcionais:

- `demo_view_map` e `demo_view_list` por meio do evento generico de CTA;
- pausa/retomada do ticker somente se houver pergunta analitica real.

Regras:

- page view uma vez por montagem da rota;
- cliques podem ocorrer mais de uma vez;
- sucesso somente no `onSuccess`;
- nunca incluir cidade, e-mail ou nome do bar nas propriedades.

## 20. Performance, SSR e hidratacao

- renderizar toda a copy estaticamente no SSR;
- nao condicionar o markup inicial a `window`;
- estado inicial do menu e fechado;
- estado inicial da demo e lista;
- ticker renderiza fallback igual no servidor e no primeiro render do cliente;
- formatacao de data real usa timezone explicita para evitar diferenca servidor/cliente;
- nao ler `getBoundingClientRect`, largura ou scroll durante render;
- listeners globais devem ser passivos quando aplicavel e sempre ter cleanup;
- manter arrays e SVG estaticos fora dos componentes;
- nao usar `useMemo` para expressoes triviais;
- isolar estado em header, demo, ticker e formularios;
- abaixo da dobra, imagem usa lazy loading;
- reservar dimensoes de imagem e mocks para CLS proximo de zero;
- nao adicionar dependencia de motion ou carousel;
- evitar barrel imports que ampliem bundle; importar componentes diretamente dos exports publicos usados pelo projeto.

## 21. Estados de erro e edge cases

### 21.1. Rede/API

- timeout/erro generico: `Não foi possível registrar agora. Verifique sua conexão e tente novamente.`;
- conflito: mensagem especifica de e-mail ja cadastrado;
- valores do formulario permanecem depois do erro;
- submit pode ser tentado novamente;
- duplo clique nao cria duas mutacoes enquanto pending;
- desmontagem durante request nao deve gerar atualizacao insegura.

### 21.2. Dados do ticker

- array vazio: fallback;
- erro da query: fallback silencioso, sem quebrar a pagina;
- texto longo: truncar apenas dentro da faixa visual, mantendo nome completo acessivel se necessario;
- data invalida: label temporal generico;
- menos de dois itens: ainda duplicar a sequencia, mas considerar deixar ticker estatico para evitar repeticao excessiva.

### 21.3. Conteudo e layout

- nomes de cidade longos devem quebrar sem expandir o viewport;
- zoom de texto nao pode esconder submit ou menu;
- JavaScript desabilitado: copy, anchors, FAQ nativo e formularios visuais aparecem; submits React nao funcionarao, mas nao deve haver sucesso falso;
- backdrop-filter sem suporte: header usa paper opaco como fallback;
- `color-mix()` sem suporte: declarar background fallback antes;
- `-webkit-text-stroke` sem suporte: manter texto preenchido legivel.

## 22. Testes automatizados esperados

O repositorio ainda nao possui uma suite de frontend consolidada. A implementacao deve adicionar testes somente onde o custo e justificado e sem criar infraestrutura excessiva.

### 22.1. Componentes

Cobertura minima recomendada com Testing Library:

- menu mobile abre, atualiza ARIA, fecha por link e Escape e devolve foco;
- demo alterna lista/mapa e atualiza nome/estado acessivel;
- ticker usa fallback com query vazia;
- ticker usa eventos reais e pode pausar/retomar;
- fan form monta payload normalizado com cidade, nome, e-mail e telefone opcional;
- pub form monta payload normalizado com dados de contato e da casa;
- pending desabilita submit e mostra label;
- erro preserva valores e aparece inline;
- sucesso so aparece depois da resolucao da mutacao;
- analytics de sucesso nao e emitido em erro;
- FAQ continua acessivel com semantica nativa.

### 22.2. API

- aceita fan com cidade/nome/e-mail e telefone opcional;
- aceita pub com cidade/nome/e-mail e campos opcionais de bar;
- rejeita fan ou pub sem nome;
- rejeita cidade curta/vazia;
- rejeita e-mail invalido;
- normaliza e-mail e strings;
- preserva suporte a `phone`, `pubName` e `bairro` opcionais;
- retorna conflict para duplicidade;
- preenche `N/A` somente nos campos legados previstos;
- nao vaza mensagem bruta do banco.

Testes que inserem dados so podem rodar com `DATABASE_URL` resolvida e comprovadamente descartavel/isolada. Caso isso nao possa ser demonstrado, usar mocks/unit tests e registrar a validacao de banco como pendente; nunca rodar contra banco compartilhado.

## 23. QA visual e de interacao

Checklist manual obrigatorio:

- comparar desktop e mobile com a referencia em `./utils`;
- verificar todas as viewports da matriz;
- navegar toda a pagina somente com teclado;
- abrir/fechar menu com mouse, toque, Enter, Space e Escape;
- alternar demo lista/mapa repetidamente;
- pausar/retomar ticker;
- testar reduced motion no sistema/browser;
- testar zoom em 200%;
- testar contrastes reais;
- testar fan submit: sucesso, duplicado, erro e retry;
- testar bar submit: sucesso, duplicado, erro e retry;
- testar anchors com URL/hash e botao Voltar;
- confirmar que header nao cobre titulos ancorados;
- confirmar que nao existe overflow horizontal;
- confirmar que dashboard e mock nao oferecem controles mortos;
- confirmar que imagem da comunidade carrega sem layout shift;
- confirmar que links do footer estao visiveis;
- confirmar responsividade em landscape;
- inspecionar visual renderizado, nao concluir fidelidade apenas por build/lint.

## 24. Validacao tecnica

Executar de forma localizada:

```bash
# Formato/lint somente nos arquivos alterados
bunx biome check \
  apps/web/src/routes/index.tsx \
  apps/web/src/components/landing/onside-landing.tsx \
  apps/web/src/components/landing/onside-app-demo.tsx \
  apps/web/src/components/landing/onside-waitlist.tsx \
  apps/web/src/components/landing/onside.css \
  apps/web/src/lib/analytics.ts \
  apps/web/src/routes/internal_.waitlist.tsx \
  packages/api/src/routers/waitlist.ts \
  packages/api/src/routers/pubs.ts \
  packages/db/src/schema/waitlist.ts

# TypeScript por pacote relevante
bunx tsc --noEmit -p apps/web/tsconfig.json
bunx tsc --noEmit -p packages/api/tsconfig.json
bunx tsc --noEmit -p packages/db/tsconfig.json

# Build real client + SSR
cd apps/web
bun run build

# De volta a raiz
git diff --check
```

Observacoes:

- nao usar `bun run check`, pois o script raiz executa Biome com `--write` no repositorio inteiro;
- o build deve ser executado de dentro de `apps/web`;
- erros baseline alheios devem ser registrados separadamente, nao corrigidos por arrasto;
- migracoes nao devem ser aplicadas automaticamente durante QA desta feature.

## 25. Sequencia de implementacao recomendada

### Fase 1 — contratos e compatibilidade

1. adicionar `city` ao schema sem alterar a nulabilidade dos campos existentes;
2. gerar/revisar migracao;
3. atualizar input/persistencia da waitlist;
4. atualizar painel interno e CSV;
5. ampliar dados do ticker;
6. validar tipos de API/DB.

### Fase 2 — estrutura React

1. substituir composicao de `OnsideLanding`;
2. implementar marca/header/menu;
3. implementar hero e demo lista/mapa;
4. implementar ticker real;
5. portar secoes editoriais na ordem especificada;
6. implementar formularios reais;
7. atualizar footer.

### Fase 3 — CSS e responsividade

1. manter font-face e substituir tokens/layout;
2. portar desktop com escopo local;
3. implementar tablet e mobile sem scale de controles;
4. corrigir contraste/foco/touch targets;
5. adicionar motion restrito e reduced motion;
6. verificar overflow e safe areas.

### Fase 4 — rota, SEO e analytics

1. atualizar head e JSON-LD;
2. remover interceptacao desnecessaria de hash;
3. instrumentar CTAs/submits;
4. confirmar que nao ha PII em eventos.

### Fase 5 — verificacao

1. testes de componente/API;
2. Biome localizado;
3. typecheck localizado;
4. build de `apps/web`;
5. `git diff --check`;
6. QA visual, teclado, mobile e reduced motion;
7. revisar diff para garantir que os arquivos de referencia nao entraram no bundle/commit por engano.

## 26. Criterios de aceite

### Estrutura e fidelidade

- [ ] Todas as secoes da referencia aparecem na ordem especificada.
- [ ] A direcao paper/ink/acid/live, tipografia e sombras duras foi preservada.
- [ ] Hero usa o mock de telefone, nao a foto/card da versao anterior.
- [ ] Dashboard de bares e secao de confianca estao presentes.
- [ ] Copy da referencia foi preservada, salvo ajustes explicitamente necessarios por veracidade/acessibilidade.

### Funcionalidade

- [ ] Ticker usa query real e fallback correto.
- [ ] Ticker pode ser pausado.
- [ ] Demo alterna lista/mapa.
- [ ] Fan form salva cidade/nome/e-mail/telefone opcional com role fan.
- [ ] Bar form salva contato, cidade e campos da casa com role pub.
- [ ] Loading, erro, conflito e sucesso sao reais.
- [ ] Admin e CSV suportam cidade, incluindo registros historicos sem esse campo.
- [ ] Nenhum controle visual sem acao e focavel.

### Acessibilidade

- [ ] Skip link funciona.
- [ ] Headings sao hierarquicos.
- [ ] Menu mobile tem ARIA, Escape e foco correto.
- [ ] Campos possuem labels, erro inline e foco de erro.
- [ ] Focus rings sao visiveis.
- [ ] Alvos de toque tem ao menos 44 x 44 px.
- [ ] Contraste AA foi medido.
- [ ] Reduced motion desliga movimento continuo e smooth scroll.
- [ ] A pagina funciona em teclado e zoom 200%.

### Responsividade e performance

- [ ] Sem overflow horizontal a partir de 320 px.
- [ ] Mock e dashboard reorganizam sem transform scale sobre controles.
- [ ] Imagens reservam espaco e abaixo da dobra usam lazy loading.
- [ ] SSR e hidratacao nao divergem por data/timezone ou browser state.
- [ ] Nenhuma dependencia de frontend nova foi adicionada sem necessidade.

### SEO, analytics e qualidade

- [ ] Title, description, theme color, canonical, OG, Twitter e JSON-LD estao atualizados.
- [ ] `landing_viewed` ocorre uma vez.
- [ ] CTAs e sucessos usam os identificadores desta spec.
- [ ] Analytics nao contem PII.
- [ ] Biome localizado, typechecks relevantes, build e diff-check passam ou tem bloqueios baseline documentados.
- [ ] A pagina foi inspecionada renderizada em desktop e mobile.

## 27. Decisoes finais e itens que nao devem ser reabertos durante a implementacao

- A fonte da nova UI e `./utils`, apesar do caminho citado inicialmente.
- A nova landing substitui visualmente a atual; nao e uma secao adicional.
- O ticker real e preservado.
- Os submits demonstrativos sao descartados e ambos os formularios usam backend real.
- Cidade ganha campo proprio; nao e armazenada como bairro.
- O fluxo fan preserva nome e telefone opcional, alem de adicionar cidade/e-mail conforme a nova referencia.
- O fluxo de bar expoe nome do contato, telefone opcional, nome da casa, cidade e bairro opcional.
- O perfil nao usa toggle nesta composicao: o contexto de cada formulario define fan/pub, e campos de bar nunca aparecem para torcedores.
- Geist Mono self-hosted substitui Roboto Mono da referencia.
- A demo mostra lista/mapa; reserva e pagamento nao sao simulados.
- Navegacao por anchor e nativa e preserva hash.
- Motion e restrito aos elementos descritos e sempre respeita reduced motion.
- Nenhuma mudanca global de tema ou componente shadcn e necessaria.
- Fidelidade visual so pode ser considerada concluida depois de inspecao renderizada.
