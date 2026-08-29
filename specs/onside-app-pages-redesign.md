# Spec — redesign das superficies de produto na linguagem visual Onside

## 1. Resumo executivo

Esta especificacao define o redesign visual das superficies de autenticacao,
onboarding, descoberta de bares, perfil do torcedor, detalhe publico de um bar e
painel administrativo do bar. O objetivo e fazer essas telas parecerem partes do
mesmo produto apresentado pela landing em `apps/web/src/routes/index.tsx`, sem
alterar como qualquer dado e consultado, enviado, invalidado, autenticado ou
medido.

A implementacao deve substituir a estetica interna atual — branco/zinc, gradientes
azul/laranja, muitos cantos arredondados, pills e tipografia Inter/Space Grotesk —
pela linguagem editorial e esportiva da landing Onside:

- paper `#F1EEE6` como superficie principal;
- ink `#12120F` como texto, borda e superficie escura;
- acid `#C9F135` como acento primario e confirmacao;
- live `#E8320C` como estado ao vivo, alerta de atencao e foco;
- stone `#E7E3DB` e muted `#55554F` para hierarquia secundaria;
- Anton em titulos de impacto, Archivo no corpo e Geist Mono em metadados;
- bordas duras, cantos retos ou discretos, sombras deslocadas e composicao em
  grade;
- movimento curto, funcional e sempre compativel com
  `prefers-reduced-motion`.

O redesign e estritamente de apresentacao. Ele pode reorganizar JSX, extrair
componentes visuais, introduzir estado local de apresentacao e ajustar classes,
CSS, semantica e acessibilidade. Ele nao pode criar, remover ou trocar queries,
mutations, payloads, cache keys, analytics, redirects, guards, rotas, uploads,
formatacao de dados, regras de plano ou contratos de backend.

## 2. Fonte de verdade e ordem de precedencia

Quando houver conflito, usar esta ordem:

1. contratos e comportamentos produtivos atuais do codigo;
2. esta spec, que resolve o mapeamento da landing para as superficies reais;
3. `apps/web/src/routes/index.tsx` e os componentes ativos da landing;
4. `apps/web/src/components/landing/onside.css` para tokens e detalhes visuais;
5. componentes shadcn ja instalados em `packages/ui`;
6. a UI interna atual somente como referencia de funcionalidade e estados.

### 2.1. Referencia visual ativa

A landing ativa e composta por:

- `apps/web/src/routes/index.tsx`;
- `apps/web/src/components/landing/onside-landing.tsx`;
- `apps/web/src/components/landing/onside-app-demo.tsx`;
- `apps/web/src/components/landing/onside-waitlist.tsx`;
- `apps/web/src/components/landing/onside.css`.

Os assets de marca que devem ser reutilizados sao:

- `apps/web/public/onside-wordmark-paper.png`;
- `apps/web/public/onside-icone-preto.png`;
- as fontes em `apps/web/public/fonts/onside/`.

Nao recriar wordmark em texto, nao redesenhar o simbolo e nao reutilizar o antigo
lockup “FindSports” nas superficies redesenhadas. Metadados, nomes de eventos e
contratos podem continuar com os valores atuais; esta decisao e sobre a marca
visual renderizada.

### 2.2. Correcao do escopo informado

O pedido cita os diretorios `(auth)`, `(dashboard)`, `(onboarding)` e `(pub)`, mas
o painel funcional do bar nao esta em `(dashboard)`. A rota ativa do painel do bar
e `apps/web/src/routes/admin.tsx`, composta por
`apps/web/src/components/admin/*`.

Portanto, o escopo efetivo e:

| Jornada | Rota ativa | Componentes principais |
| --- | --- | --- |
| Login | `routes/(auth)/login.tsx` | `auth-brand-panel`, `auth-input-field`, `auth-password-field` |
| Cadastro | `routes/(auth)/signup.tsx` | mesmos componentes + `auth-brand-copy` |
| Onboarding torcedor | `routes/(onboarding)/onboarding.fan.tsx` | `components/onboarding/*` |
| Onboarding bar | `routes/(onboarding)/onboarding.pub.tsx` | `components/onboarding/*` |
| Descoberta do torcedor | `routes/(dashboard)/dashboard.tsx` | `components/dashboard/*`, `app-shell`, `google-map` |
| Perfil do torcedor | `routes/(dashboard)/dashboard_.profile.tsx` | `app-shell`, `google-map` e componentes locais |
| Detalhe do bar | `routes/(pub)/pub.$pubId.tsx` | `components/pub/*`, `app-shell` |
| Painel do bar | `routes/admin.tsx` | `components/admin/*`, `app-shell` |

`routes/admin_.billing.tsx` e `routes/plan.tsx` nao fazem parte do redesign desta
entrega. Como `AppShell` e compartilhado, essas rotas devem receber apenas a
compatibilidade minima necessaria para nao quebrar; nao devem ser redesenhadas
por arrasto.

## 3. Objetivos de produto e experiencia

Ao final da implementacao:

- deve ser evidente que landing, autenticacao e produto pertencem a Onside;
- o usuario deve reconhecer no dashboard real os mesmos padroes mostrados na
  previa do telefone da landing;
- o bar deve reconhecer no painel real a proposta “Onside para bares” exibida na
  landing;
- estados reais devem continuar legiveis: carregando, vazio, ao vivo, proximo,
  passado, favorito, erro, sucesso, bloqueio, limite e plano;
- a densidade pode aumentar em desktop, mas a hierarquia deve permanecer clara
  em mobile e com zoom de texto;
- nenhuma fidelidade visual pode depender de dados inventados ou controles sem
  acao.

## 4. Fora de escopo

Nao implementar nesta entrega:

- mudancas em `packages/api`, `packages/auth`, `packages/db` ou migrations;
- novas queries, mutations, endpoints, campos, filtros ou parametros;
- alteracao de payload, normalizacao ou validacao;
- troca de TanStack Query, TanStack Router, Better Auth ou tRPC;
- alteracao de guards ou destinos de redirect;
- novas metricas ou alteracao de payload de analytics;
- novos planos, contadores, calculos de cobertura ou suporte multi-bar;
- novo provedor de mapas ou alteracao do carregamento do Google Maps;
- mudanca na logica de favorito, geolocalizacao, upload ou compartilhamento;
- redesign completo de `/plan`, `/admin/billing`, `/internal*` ou da landing;
- alteracao de copy de produto alem de pequenos labels visuais necessarios para
  hierarquia ou acessibilidade;
- dependencias de frontend novas;
- formatacao automatica do repositorio inteiro;
- qualquer operacao em banco de dados.

## 5. Invariantes funcionais

### 5.1. Regra principal

Um diff aceitavel pode alterar markup, ordem visual, componentes de apresentacao,
classes, CSS, ARIA e estado local puramente visual. Um diff nao aceitavel altera
qualquer expressao que determine de onde os dados vem, o que e enviado, quando e
invalidado, como uma sessao e validada ou para onde o usuario e redirecionado.

### 5.2. Contratos que devem permanecer textualmente equivalentes

#### Login e cadastro

- manter `authClient.signIn.email({ email, password })`;
- manter `authClient.signUp.email({ name, email, password, role })`;
- manter verificacao local de confirmacao e minimo de 8 caracteres;
- manter `analytics.signinCompleted()`, `analytics.signupStarted()` e
  `analytics.signupCompleted(role)` nos mesmos momentos;
- manter os toasts atuais e `navigate({ to: '/dashboard' })`;
- manter os mesmos `name`, `id`, `type`, `autocomplete`, `required` e limites.

#### Onboarding do torcedor

- manter `trpc.pubs.getSports.queryOptions()`;
- manter `trpc.onboarding.completeFan.mutationOptions(...)`;
- manter o payload `{ sportIds, searchRadiusKm }`;
- manter os quatro passos, validacao de ao menos um esporte e opcoes
  `1 | 3 | 5 | 10` km;
- manter analytics de inicio, passo, esportes, raio e conclusao;
- manter o redirect final para `/dashboard`.

#### Onboarding do bar

- manter `trpc.onboarding.completePub.mutationOptions(...)`;
- manter `name`, `address`, `neighborhood`, `city`, `phone` e `description`;
- manter campos opcionais como opcionais no payload;
- manter validacoes atuais de avanco e os tres passos;
- manter analytics e redirect final para `/plan`.

#### Dashboard do torcedor

- manter queries `pubs.getSports`, `pubs.search`, `pubs.searchByLocation` e
  `pubs.getFavorites` com os mesmos argumentos e condicoes;
- manter mutations `pubs.favorite` e `pubs.unfavorite`, incluindo update
  otimista, rollback e invalidacao;
- manter fallback de coordenadas de Sao Paulo e fluxo de permissao de
  geolocalizacao;
- manter raio, esporte, campeonato, ordenacao atual, fallback de bares sem
  eventos e limite 30;
- manter sincronizacao hover card/mapa, selecao do pin e navegacao para
  `/pub/$pubId`;
- manter todos os eventos de analytics nos mesmos gatilhos.

#### Perfil do torcedor

- manter sessao, preferencias, favoritos, busca de proximidade e os cache keys;
- manter `pubs.updateMyPreferences`, `pubs.unfavorite` e
  `authClient.updateUser` com os mesmos payloads;
- manter compressao e upload local da imagem, edicao de nome, raio e esportes;
- manter geolocalizacao, lista/mapa, ordenacao e filtro “com jogos”;
- manter logout, analytics e destinos de navegacao.

#### Detalhe publico do bar

- manter `pubs.getById`, `pubs.isFavorited`, `pubs.favorite` e
  `pubs.unfavorite`;
- manter update otimista, rollback e invalidacao de favoritos;
- manter a verificacao de role antes de favoritar;
- manter rotas de login/dashboard, links de mapa, deteccao de iOS,
  compartilhamento nativo e copia do URL;
- manter calculo de evento ao vivo e separacao de proximos eventos.

#### Painel do bar

- manter `pub.getMe`, `pub.getMyEvents`, `pub.getMySubscription` e
  `pub.updateMe`;
- manter calculo do limite Starter, periodo, eventos restantes e avisos;
- manter `pub.createEvent`, `pub.updateEvent`, `pub.deleteEvent`,
  `pubs.getSports` e `pubs.getTeamsBySport`;
- manter os payloads de evento, conversao de timezone e invalidacoes;
- manter upload para `/api/bar/photo` com `FormData` e credentials;
- manter `BarPreview`, mapa, dados de plano e analytics atuais.

#### Shell e autorizacao

- nao alterar `apps/web/src/utils/auth-guards.ts`;
- nao alterar `beforeLoad` ou sessao em `routes/__root.tsx`;
- manter `authClient.useSession()` e logout do `AppShell`;
- manter os links de perfil, painel, billing e saida;
- garantir que fan nunca veja navegacao de bar e pub nunca veja navegacao de
  fan.

## 6. Design system Onside para superficies internas

### 6.1. Tokens de cor

Usar os valores da landing, preferencialmente como custom properties
compartilhadas em uma classe raiz `.onside-app`:

```css
--onside-ink: #12120f;
--onside-paper: #f1eee6;
--onside-acid: #c9f135;
--onside-live: #e8320c;
--onside-stone: #e7e3db;
--onside-muted: #55554f;
--onside-line: rgb(18 18 15 / 22%);
```

Regras semanticas:

- `paper`: fundo de pagina, inputs claros e paineis primarios;
- `ink`: texto primario, bordas, headers, sidebar e botoes escuros;
- `acid`: CTA primario, selecionado, confirmado e progresso;
- `live`: ao vivo, erro/atencao, marcador de foco e acento editorial;
- `stone`: fundos secundarios, skeletons e estados neutros;
- `muted`: texto secundario, nunca texto pequeno sobre ink;
- `white` pode aparecer apenas quando necessario para contraste em `live`;
- cores de plano existentes podem sobreviver somente quando carregam significado
  de negocio; nao usar azul como acento estrutural do layout.

Nao mapear `live` automaticamente para todo erro. Erro destrutivo continua usando
semantica danger; `live` e o vermelho visual da marca e pode servir de acento de
atencao quando o significado nao for ambiguo.

### 6.2. Tipografia

- display: `Anton`, peso 400, uppercase, line-height entre `0.91` e `0.98`;
- body: `Archivo`, pesos 400–700, line-height entre `1.45` e `1.65`;
- metadata: `Geist Mono`, uppercase opcional, tracking `0.08em–0.16em`;
- numeros de horario, distancia, contagem e limite usam `tabular-nums`;
- headings usam `text-wrap: balance`; corpo longo usa `text-wrap: pretty`;
- Anton nao deve ser usada em labels, paragrafos, inputs ou tabelas;
- tamanho minimo de body/input em mobile: 16 px;
- texto auxiliar pode usar 12–14 px; 10–11 px apenas para metadado uppercase com
  contraste medido.

As fontes ja estao self-hosted. Extrair os `@font-face` da landing para uma base
compartilhada ou declarar uma unica base global importada por landing e app. Nao
voltar a buscar Inter/Space Grotesk do Google para as rotas redesenhadas. A
landing nao pode sofrer regressao de carregamento ou CLS durante a extracao.

### 6.3. Geometria e elevacao

- borda padrao: `1px` ou `1.5px solid var(--onside-ink)`;
- divisores: `1px solid var(--onside-line)`;
- raio padrao de paineis: `0`; raio maximo tolerado em popover/modal: `4px`;
- avatar e marker podem permanecer circulares por significado;
- badges de status podem usar pill apenas quando forem badges, nao como container
  generico;
- CTA primario: retangular, altura minima 48 px, acid + ink;
- CTA secundario: paper/transparent + ink border;
- hover desktop de CTA: translate `-2px, -2px` e sombra deslocada `4px 4px 0`;
- active: retorna a origem e remove/reduz a sombra;
- paineis de destaque podem usar sombra `6–10px 6–10px 0`;
- evitar blur decorativo, glow generico e sombras difusas da UI atual.

### 6.4. Espacamento e containers

- escala base: 4, 8, 12, 16, 24, 32, 48, 64;
- shell desktop: maximo `1260px`, alinhado a landing;
- gutter: 24 px desktop/tablet, 15–16 px mobile;
- largura de conteudo nunca deve depender de `transform: scale()`;
- secoes internas: 48–64 px vertical em desktop, 32–48 px em mobile;
- grupos densos: 12–16 px; paineis: 20–32 px;
- toda grid/flex com texto dinamico precisa de `min-width: 0`.

### 6.5. Iconografia e imagens

- manter uma unica familia de icones por superficie; Hugeicons existente e
  aceitavel, com stroke 1.5 e tamanhos consistentes;
- remover emojis estruturais do filtro de esportes;
- botoes somente com icone precisam de `aria-label` e area minima 44 x 44 px;
- icones decorativos usam `aria-hidden="true"`;
- imagens de bar mantem `alt` com o nome e devem reservar dimensoes/aspect ratio;
- wordmark usa o asset oficial e `translate="no"` no container;
- no fundo ink, aplicar a variante visual de alto contraste sem deformar o asset.

### 6.6. Motion

- transicoes de hover/focus: 150–200 ms;
- entrada de modal/sheet: no maximo 250 ms;
- animar apenas `transform` e `opacity` quando possivel;
- nao usar `transition-all`;
- o pulso de “ao vivo” pode permanecer, mas deve parar em reduced motion;
- nao adicionar animacao de entrada a cada card/list row;
- nenhum efeito pode atrasar clique, teclado ou leitura do conteudo;
- em `prefers-reduced-motion: reduce`, remover translate de hover, pulse, smooth
  scroll e transicoes nao essenciais.

## 7. Arquitetura visual recomendada

### 7.1. Fundacao compartilhada

Criar uma fundacao unica para evitar copiar dezenas de classes da landing em cada
rota. Estrutura recomendada:

- `apps/web/src/styles/onside-foundations.css`
  - `@font-face`;
  - tokens compartilhados;
  - classe raiz `.onside-app`;
  - focus ring, tipografia base, button/panel/input helpers estritamente
    escopados;
  - reduced motion;
- importar a fundacao uma vez por `apps/web/src/index.css`;
- manter `onside.css` responsavel apenas pela composicao da landing;
- remover duplicacao de `@font-face` da landing somente se a ordem de import e a
  renderizacao forem verificadas.

Nao transformar `packages/ui/src/styles/globals.css` inteiro no tema Onside. Esse
arquivo pertence ao pacote compartilhado e uma alteracao global ampliaria o
escopo. Tokens ou classes especificos do app ficam em `apps/web`.

### 7.2. Marca reutilizavel

Extrair `OnsideMark` e `OnsideBrand`, hoje privados em
`onside-landing.tsx`, para um componente compartilhado, por exemplo:

- `apps/web/src/components/brand/onside-brand.tsx`.

Requisitos:

- suportar wordmark e mark;
- tamanhos explicitos e sem CLS;
- `alt`/`aria-hidden` corretos conforme o link pai;
- variante para fundo paper e fundo ink;
- landing deve consumir o mesmo componente sem regressao visual.

### 7.3. Primitives e shadcn

Reutilizar os componentes instalados quando eles carregam comportamento:

- `Button`, `Badge`, `Card`, `Dialog`, `DropdownMenu`, `Field`, `InputGroup`,
  `Select`, `Separator`, `Skeleton`, `Spinner`, `ToggleGroup` e `Textarea`;
- estilizar por variantes ou wrappers escopados em vez de recriar interacao;
- `Dialog` continua com `DialogTitle` e fechamento acessivel;
- option sets de 2–7 itens usam `ToggleGroup` quando compativel;
- forms usam `Field`/`FieldLabel`/`FieldError` e `aria-invalid`;
- loading usa `Spinner`/`Skeleton`, nao divs de shimmer novos;
- alertas de plano/inatividade podem usar o primitive `Alert` somente se ele for
  adicionado deliberadamente; nao adicionar dependencias/registry blocks por
  conveniencia.

Nao reescrever todos os componentes shadcn nem aplicar preset novo. O redesign e
uma camada visual do produto, nao uma migracao do pacote UI.

### 7.4. AppShell

`AppShell` deve virar a moldura compartilhada Onside para fan, pub e detalhe do
bar:

- raiz `.onside-app`, background paper, texto ink e fonte Archivo;
- header sticky com paper opaco ou blur com fallback;
- wordmark Onside a esquerda;
- navegacao contextual curta no centro apenas quando fizer sentido;
- menu da sessao a direita, mantendo dados, links e logout atuais;
- altura aproximada 66 px mobile / 74 px desktop;
- borda inferior ink translúcida, sem capsule branca flutuante;
- main com shell max 1260 px e gutter responsivo;
- skip link para `#main-content`;
- foco visivel live de 3 px e offset 3 px;
- respeitar `--banner-h` da impersonacao tanto no header quanto em elementos
  sticky;
- nao esconder o nome/role em zoom ou viewport estreita: pode recolher para
  avatar, mas o menu continua rotulado.

O menu deve manter todos os destinos atuais. Mudanca de layout nao autoriza
trocar `Link`, handlers ou o fluxo de logout.

## 8. Login

Arquivo principal: `apps/web/src/routes/(auth)/login.tsx`.

### 8.1. Desktop

Usar composicao split 44/56 ou 42/58:

- painel de marca ink a esquerda;
- formulario paper a direita;
- wordmark Onside no topo do painel de marca;
- label mono “AREA EXCLUSIVA” com ponto live;
- headline Anton uppercase, paper com palavra/frase de destaque acid ou live;
- corpo Archivo com largura maxima de 36–42 caracteres;
- detalhe grafico simples derivado do circulo Onside, sem gradiente/blur;
- copyright discreto no rodape.

No formulario:

- kicker mono “ENTRAR”;
- H1 Anton, 48–64 px desktop;
- link de cadastro sublinhado com estado de foco claro;
- labels mono/Archivo uppercase;
- inputs paper/stone, borda ink, cantos retos, 48–52 px;
- icones em ink/muted e focus-within live;
- botao acid com borda e sombra ink;
- pending preserva largura, mostra spinner/label atual e desabilita clique;
- termos permanecem no mesmo lugar e com o mesmo href atual.

### 8.2. Mobile

- uma coluna, min-height `100dvh`;
- wordmark visivel no topo;
- painel de marca reduzido a uma faixa editorial, nao removido por completo;
- formulario vem antes de copy secundaria;
- nenhum input menor que 16 px;
- CTA ocupa a largura;
- sem overflow a partir de 320 px.

### 8.3. Estados

- credenciais invalidas continuam no toast atual;
- campos nao devem ser limpos em erro;
- focus ring nunca pode depender apenas de cor da borda;
- toggle de senha continua button, com label dinamico e alvo 44 x 44 px;
- “Esqueceu a senha?” continua visualmente secundario e nao ganha comportamento
  novo.

## 9. Cadastro

Arquivo principal: `apps/web/src/routes/(auth)/signup.tsx`.

Aplicar o mesmo shell do login, espelhando o painel de marca apenas se isso
melhorar o equilibrio da dupla de paginas. Preservar a ordem dos campos.

### 9.1. Seletor de role

- apresentar “Torcedor” e “Dono de bar” como duas placas de escolha, nao pills;
- usar `ToggleGroup` existente e manter exatamente `fan | pub`;
- selecionado usa acid + ink para ambos; diferenciar a copy, nao inventar paleta
  azul para pub;
- cada opcao tem icone, label e estado `aria-pressed`;
- area minima de 48 px;
- mudanca de role atualiza apenas a copy visual ja existente.

### 9.2. Painel de marca dinamico

- `AuthBrandCopy` continua recebendo `role`;
- preservar os arrays de beneficios e a semantica atual;
- substituir checks circulares genericos por marcas acid/ink alinhadas em grade;
- transicao entre copies deve ser instantanea ou crossfade curta, sem deslocar o
  layout;
- reduced motion remove crossfade.

### 9.3. Formulario

- manter nome, email, senha e confirmacao;
- mostrar erro de confirmacao/forca pelo canal atual;
- nao adicionar validacao remota ou requisito novo;
- pending “Entrando no time...” deve usar ellipsis tipografico visual se a copy
  for tocada, mas sem mudar a logica;
- em mobile, evitar que quatro campos + CTA fiquem escondidos por altura fixa.

## 10. Onboarding compartilhado

Arquivos: rotas `(onboarding)` e `components/onboarding/*`.

### 10.1. Shell

Substituir o fundo zinc/gradientes por uma composicao paper/ink:

- pagina paper;
- header com wordmark, label de conta e divisor;
- area central com largura maxima 860 px;
- painel principal ink, borda ink e sombra acid deslocada;
- progresso acima do painel, com segmentos retos;
- etapa concluida/atual acid, futura stone;
- labels de passo em Geist Mono;
- navegacao fora ou no rodape do painel, sempre previsivel.

`OnboardingLayout` continua aceitando `fan | pub | plan`; a variante `plan` deve
continuar funcional, mas nao receber redesign completo. Classes novas precisam
ter fallback para ela.

### 10.2. Progressao

- manter o numero total e nomes de passos;
- progresso deve expor `aria-current="step"` no passo atual;
- segmentos visuais decorativos usam lista/semantica ou texto acessivel;
- botoes Voltar/Continuar ficam no mesmo local entre etapas;
- Voltar e secundario outline; Continuar e acid;
- estado disabled tem contraste suficiente e atributo real `disabled`;
- pending mostra spinner e nao muda dimensoes.

### 10.3. WelcomeStep

- kicker mono acid;
- H1 Anton paper, sem usar azul/laranja por role;
- features em tres colunas no desktop com divisores, uma coluna no mobile;
- icones acid; texto paper;
- nao usar tres mini-cards arredondados.

## 11. Onboarding do torcedor

### 11.1. Passo “Boas-vindas”

- enfatizar “melhores bares” em acid;
- preservar subtitle e tres beneficios;
- composicao editorial assimetrica em desktop, linear em mobile.

### 11.2. Passo “Seus esportes”

- grid 2 colunas mobile, 3 desktop;
- cada esporte e uma placa de borda visivel;
- estado neutro: ink levemente elevado sobre ink/stone ou paper dentro do painel;
- selecionado: acid + ink, check visivel alem da cor;
- remover scale como unica indicacao;
- preservar icon map, ids, toggle e contagem;
- loading usa skeletons com dimensao reservada.

### 11.3. Passo “Onde voce assiste”

- opcoes 1, 3, 5 e 10 km como marcador numerico grande em Anton;
- label menor em Archivo/Mono;
- selecionado acid + check/indicador;
- grid 2 x 2 mobile e 4 colunas quando houver espaco;
- nenhuma mudanca em `radius` ou labels.

### 11.4. Passo “Pronto”

- evitar circulo generico gigante;
- usar um bloco acid com simbolo/check e headline Anton;
- resumo de esportes e raio vira lista compacta de tags sem arredondamento
  excessivo;
- CTA final continua submetendo a mutation; nao navegar antes do sucesso.

## 12. Onboarding do bar

### 12.1. Boas-vindas

- mesma fundacao do fan, com copy especifica;
- “proximos classicos” em acid ou live;
- nao criar uma cor de role azul.

### 12.2. Formulario do estabelecimento

- manter todos os seis campos e `PhoneInput`;
- layout desktop: nome/endereco em largura total, bairro/cidade em duas colunas,
  telefone e descricao abaixo;
- mobile: uma coluna;
- labels sempre visiveis;
- inputs ink ou paper conforme o painel, com borda forte e focus live;
- textarea redimensionavel verticalmente se isso nao quebrar o painel;
- autoComplete/type atuais devem ser preservados ou melhorados sem mudar valor;
- labels obrigatorios continuam com `*` e erro precisa aparecer junto ao campo ou
  na regiao atual.

### 12.3. Conclusao

- bloco “BAR CADASTRADO” acid/ink;
- nome e bairro renderizam valores reais ja em state;
- CTA “Ir pro meu painel” mantem a mutation e redirect atual para `/plan`.

## 13. Dashboard do torcedor

Arquivos: `routes/(dashboard)/dashboard.tsx`, `components/dashboard/*`,
`components/app/google-map.tsx` e `AppShell`.

### 13.1. Hierarquia desktop

Ordem:

1. kicker de disponibilidade/localizacao;
2. H1 editorial “Onde voce assiste hoje?”;
3. filtro de busca;
4. avisos de localizacao;
5. grid mapa + resultados;
6. paginacao existente.

O layout desktop pode manter mapa e lista simultaneos, porque isso usa melhor o
espaco e nao contradiz a previa mobile da landing:

- mapa: 48–52% da largura, sticky;
- resultados: restante;
- gap 24 px;
- borda ink e sem raio de 24–32 px;
- altura do mapa existente preservada, ajustando apenas apresentacao.

### 13.2. Hero

- kicker em Geist Mono com ponto live;
- contagem usa dados atuais e tabular nums;
- H1 Anton 52–76 px desktop, 42–56 px mobile;
- fallback de localizacao aparece como nota de origem, nao alert pill.

### 13.3. SearchFilterBar

Transformar o container arredondado em um painel de busca editorial:

- campo de campeonato na primeira linha, com icone e limpar;
- esportes como ToggleGroup/placas compactas;
- substituir `SPORT_EMOJI` por icones vetoriais ou iniciais consistentes;
- raio em controle segmentado reto;
- “Limpar filtros” continua button e so aparece quando necessario;
- manter todos os callbacks e values;
- input recebe label acessivel, `name`, focus-visible e tamanho 16 px mobile;
- sticky offset considera AppShell e impersonation banner;
- background paper opaco para evitar contraste imprevisivel sobre conteudo.

Nao adicionar submit ou debounce que altere quando a query roda.

### 13.4. Avisos de localizacao

- `idle`: callout acid/ink com CTA claro;
- `denied`: callout stone/live com titulo e instrucoes atuais;
- preservar handlers e copy;
- sem radius de 16–24 px;
- garantir quebra das instrucoes em 320 px.

### 13.5. BarCard

O card real deve se aproximar dos venue cards da demo da landing:

- border 1.5 px ink, fundo paper ou paper claro;
- foto/monograma quadrado, raio 0–2 px;
- primeira linha: status/horario mono + distancia;
- nome em Archivo bold, nao Anton;
- bairro, campeonato, confronto e quantidade extra em linhas legiveis;
- status ao vivo: dot live + texto; pulse desativado em reduced motion;
- plano Pro/Elite permanece visivel, mas como badge sem dominar o card;
- favorito e button de 44 x 44 px com `aria-label` dinamico;
- hover desktop usa translate/sombra curta; `isHovered` deve continuar vindo do
  mapa;
- nao esconder informacao essencial so no hover;
- truncamento oferece estrategia para nomes/confrontos longos.

### 13.6. Mapa

- manter toda a logica de carregamento, pins, center e listeners;
- alterar apenas cores/contorno dos SVGs para a paleta Onside;
- pin live usa live, pin premium pode usar acid/ink sem apagar diferenca de plano;
- user dot precisa permanecer distinto e acessivel visualmente;
- label “Perto de voce” vira placa mono de borda ink;
- erro “Mapa indisponivel” usa painel stone e acao/explicacao atual;
- nao trocar `gestureHandling`, script URL, key ou callbacks.

### 13.7. Mobile

- H1 e filtros primeiro;
- oferecer controle visual Lista/Mapa somente se implementado como estado local
  de apresentacao; nao duplicar queries nem desmontar estado necessario;
- se nao houver toggle, mapa vem antes da lista com altura 280–320 px;
- cards uma coluna;
- sticky filter nao pode ocupar mais de cerca de 45% da viewport;
- nenhum chip causa scroll horizontal involuntario; scroll horizontal deliberado
  deve ser rotulado e ter alternativa visivel.

## 14. Perfil do torcedor

Arquivo: `routes/(dashboard)/dashboard_.profile.tsx`.

Este arquivo concentra muita UI e logica. O redesign deve preferir extrair blocos
de apresentacao sem mover queries/mutations para novos owners.

### 14.1. Cabecalho do perfil

- substituir gradiente laranja por painel ink com sombra acid;
- avatar quadrado com borda paper; botao de camera 44 x 44 px;
- label “CONTA DE TORCEDOR” mono;
- nome em Anton/Archivo conforme modo de edicao;
- email e localizacao em muted de alto contraste;
- edicao inline mantem os mesmos handlers;
- botao editar outline paper; salvar acid; cancelar secundario;
- loading do upload nao muda layout.

### 14.2. Navegacao de abas

- manter os tres valores exatos: Visao geral, Favoritos, Configuracoes;
- apresentar como `Tabs` real se a migracao puder preservar o state e analytics,
  ou manter buttons com `role=tablist`, `role=tab`, `aria-selected` e painels;
- abas retangulares com divisor, selecionada ink/acid;
- mobile permite wrap ou scroll intencional sem cortar label;
- mudanca de aba continua chamando `handleTabChange`.

### 14.3. Visao geral

- progresso do perfil: painel com barra acid reta e checklist;
- metricas: grid de placas com borda ink; numero Anton/tabular; label mono;
- proximos jogos: lista com data/hora em coluna fixa e conteudo flexivel;
- estados vazios usam linguagem visual stone/ink e CTA existente;
- “bares perto de voce” segue a mesma gramatica do BarCard sem duplicar seu
  contrato.

### 14.4. Favoritos

- controles de sort/filtro/view usam ToggleGroup ou buttons semanticamente
  agrupados;
- selecionado acid/ink, neutro paper/ink;
- lista de favoritos usa cards retos e os mesmos estados de evento do dashboard;
- unfavorite continua separado do Link e com aria-label;
- mapa usa o mesmo tratamento do dashboard;
- agrupamento por cidade preserva calculo atual;
- estados loading, vazio e filtro vazio ocupam espaco reservado.

### 14.5. Configuracoes

- cada grupo vira secao com kicker mono, heading e divisor;
- selecao de esportes compartilha visual com onboarding;
- raio compartilha visual com RadiusSelector, sem mover a chamada
  `authClient.updateUser`;
- area de logout permanece espacialmente separada e usa danger, nunca acid;
- salvar/cancelar mantem os mesmos handlers e disabled states.

## 15. Detalhe publico do bar

Arquivos: `routes/(pub)/pub.$pubId.tsx` e `components/pub/*`.

### 15.1. Loading e not found

- sempre dentro do AppShell Onside;
- loading usa Spinner + label, com `aria-live="polite"`;
- not found usa painel de borda ink, copy atual e Link de retorno;
- nao modificar condicoes `isLoading`, `isError` ou `!bar`.

### 15.2. Back link

- link textual mono com seta;
- area minima 44 px;
- foco visivel;
- continua apontando para `/dashboard`.

### 15.3. Hero do bar

- painel ink sem gradiente decorativo;
- uma faixa/live marker pode usar live quando `liveEvent` existir;
- foto quadrada de 88–112 px, borda paper;
- nome grande em Anton, com quebra segura;
- endereco, telefone e descricao em Archivo;
- CTA Como chegar acid + ink;
- favorito e compartilhar como botoes outline paper de 44 px;
- nao alterar handlers;
- em mobile, acoes ocupam largura ou grid 1fr + icons sem sobreposicao.

### 15.4. Agenda

- painel paper com borda ink;
- H2 Anton/Archivo de alto contraste;
- cada evento como linha semelhante a grade do dashboard mock:
  - data/dia na primeira coluna;
  - campeonato/confronto no centro;
  - horario/status a direita;
- live usa badge live + texto;
- proximos usam neutral/acid de forma contida;
- evento vazio mantem a copy atual.

### 15.5. Sidebar de informacoes

- cards viram secoes com borda/divisores, nao capsules;
- mapa com borda ink e raio minimo;
- CTA de direcoes reutiliza variante ink ou acid;
- sticky apenas se houver espaco vertical e sem nested scroll;
- endereco/telefone longo quebra sem overflow.

### 15.6. Dialog de compartilhamento

- manter primitive Dialog e todos os handlers;
- paper surface, ink border, sombra deslocada;
- URL em caixa stone com `break-all`/truncate responsivo;
- Copiar informa estado por texto e icone;
- compartilhamento nativo continua condicional;
- focus trap, Escape e retorno de foco devem continuar funcionando.

## 16. Painel do bar — fidelidade a proposta da landing

Arquivos: `routes/admin.tsx` e `components/admin/*`.

Este e o bloco de maior prioridade visual. O objetivo nao e apenas aplicar cores:
o painel real deve usar a mesma arquitetura perceptiva do `BarsDashboardMock` da
landing, preenchida exclusivamente com dados ja disponiveis.

### 16.1. Mapeamento mock -> produto real

| Mock da landing | Produto real | Decisao |
| --- | --- | --- |
| Header “ONSIDE PARA BARES” | `AppShell role="pub"` | Exibir wordmark + label mono no shell |
| Seletor “Bar do Ze” | `bar.name` unico | Exibir contexto somente-leitura; nao renderizar dropdown falso |
| Sidebar Visao geral | resumo da rota admin | Anchor/section link local |
| Minha grade | `EventsManager` | Secao principal |
| Meu espaco | `PubHeroSection` + `BarPreview` | Secao editavel/preview |
| Configuracoes | billing/menu existente | Link real para `/admin/billing`, sem nova tela |
| 3 stats demonstrativos | total, ao vivo, plano/limite | Usar apenas valores ja calculados |
| Adicionar transmissao | `openCreate` | Mesmo handler atual |
| Linhas Publicado/Rascunho | eventos reais live/upcoming/past | Nao inventar draft se o modelo nao possui draft |

### 16.2. Estrutura desktop

Dentro do shell:

- topbar paper/ink com “ONSIDE PARA BARES” e contexto do bar;
- grid `220–240px + minmax(0, 1fr)`;
- sidebar ink ou paper com borda direita;
- navegacao por links/anchors reais: Visao geral, Minha grade, Meu espaco,
  Configuracoes;
- estado ativo pode ser determinado por secao visivel apenas se implementado sem
  dependencia nova; caso contrario, manter primeiro item ativo estatico e links
  funcionais;
- main com kicker mono, H1 “Sua grade” e acao Novo evento;
- stats e agenda aparecem antes do editor detalhado do bar;
- avisos de plano/inatividade aparecem acima das stats e mantem links atuais;
- “Meu espaco” contem perfil/edit e preview abaixo da grade.

Em viewport menor que 1100 px, sidebar vira uma faixa de navegacao horizontal ou
menu compacto. Nao esconder destinations.

### 16.3. Visao geral e stats

Usar somente dados atuais:

1. Transmissoes: `totalCount`;
2. Ao vivo: `liveEvent ? 1 : 0`;
3. Plano: `plan`, complementado por `eventsRemaining` apenas no Starter.

Nao criar “Atualizacoes”, “Cobertura”, visualizacoes, lotacao ou performance sem
query existente. Numeros usam Anton + tabular nums; labels Geist Mono.

### 16.4. Avisos de plano e inatividade

- manter todas as condicoes e analytics via refs atuais;
- transformar capsules em faixas de status com borda forte;
- inativo: stone/amber semanticamente legivel;
- perto do limite: acid/ink ou amber com icone e texto;
- limite: danger/live com contraste AA;
- CTA Ver planos/Fazer upgrade continua `Link` para `/plan`;
- mobile empilha CTA abaixo do texto.

### 16.5. Minha grade / EventsManager

- heading, contagens e Novo evento alinham com o mock;
- CTA Novo evento acid + ink;
- skeletons preservam altura das linhas;
- evento real vira linha de grade com colunas dia/hora, jogo e status;
- live: `AO VIVO` em live;
- upcoming: `PROGRAMADO` ou label atual equivalente;
- past: `ENCERRADO`/tratamento muted apenas se derivado do estado ja calculado;
- nao introduzir rascunho;
- editar/excluir ficam sempre acessiveis por teclado e toque, nao apenas
  `group-hover`;
- exclusao deve ganhar confirmacao apenas se ja houver primitive/fluxo simples
  sem mudar mutation; se isso expandir o escopo, manter comportamento e registrar
  follow-up, nao bloquear a entrega;
- a ordem `live -> upcoming -> past` permanece.

### 16.6. EmptyEventsState

- usar painel acid/stone com simbolo editorial;
- heading deixa clara a primeira acao;
- CTA chama exatamente `openCreate`;
- sem ilustracao generica ou copy nova que prometa resultado.

### 16.7. Modal e EventForm

- Dialog paper, border ink, sombra `8px 8px 0 ink`;
- title em Anton/Archivo, close 44 x 44 px;
- max-height usa `dvh`, body com overscroll containment;
- labels mono, inputs retos, focus live;
- select recebe background e color explicitos;
- chips de times podem permanecer badges/toggles, selecionado acid + check;
- limites de dois participantes, free text e disabled states permanecem;
- botoes Cancelar/Salvar mantem handlers, validation e pending;
- erro aparece proximo ao rodape e em regiao anunciavel;
- nao alterar conversao datetime-local/ISO.

### 16.8. Meu espaco / PubHeroSection

- reduzir o hero atual a uma secao de perfil coerente com o painel, sem gradiente;
- label “MEU ESPACO” e status Visivel/Nao visivel;
- avatar/foto continua editavel pelo mesmo upload;
- modo de leitura e modo de edicao ocupam a mesma area para reduzir salto;
- inputs de edicao seguem a fundacao Onside;
- stats duplicadas de total/live podem ser removidas visualmente daqui se ja
  aparecerem na Visao geral, sem remover os props/calculos da rota ate a
  refatoracao ficar segura;
- salvar/cancelar mantem `isDirty`, callbacks e analytics.

### 16.9. BarPreview

- manter as queries internas atuais;
- apresentar como “COMO O TORCEDOR VE” com duas placas: card e mapa;
- card usa o mesmo componente redesenhado da dashboard fan;
- mapa mantem pins/center;
- mensagem de plano permanece real e visualmente secundaria;
- nao transformar preview em input ou simulador.

## 17. Responsividade

### 17.1. Matriz minima

Validar pelo menos:

| Largura | Expectativa |
| --- | --- |
| 320 px | sem overflow, uma coluna, CTAs completos, inputs 16 px |
| 375 px | fluxo mobile principal e teclado virtual |
| 760 px | transicao mobile/tablet sem cards esmagados |
| 1024 px | tablet/desktop compacto, sidebar adaptada |
| 1100 px | breakpoint de navegacao/grades complexas |
| 1440 px | shell max 1260 px, densidade equilibrada |

Tambem validar mobile landscape e zoom 200%.

### 17.2. Regras gerais

- mobile first;
- breakpoints baseados no conteudo, nao no nome do dispositivo;
- usar Grid/Flex, nunca medir layout em JavaScript;
- `min-height: 100dvh`, nao `100vh`;
- respeitar safe areas em barras fixas;
- evitar scroll regions aninhadas;
- sticky elements reservam offset do header + impersonation banner;
- nenhum texto deve ser truncado sem maneira razoavel de entender o valor;
- tabelas/listas densas viram rows empilhadas em mobile, nao scroll horizontal
  como primeira solucao;
- mapa nao fica sticky em mobile;
- sidebars viram navegacao horizontal/compacta sem perder destino.

## 18. Acessibilidade

### 18.1. Navegacao e semantica

- skip link em AppShell e auth/onboarding quando houver conteudo extenso;
- um H1 por pagina; headings sem saltos;
- links para navegacao, buttons para acao;
- tabs com semantica completa;
- anchors de admin usam `scroll-margin-top`;
- foco movido/gerenciado corretamente em Dialog e mudanca de rota;
- controles icon-only com aria-label contextual;
- favoritos anunciam adicionar/remover e estado `aria-pressed` quando aplicavel.

### 18.2. Forms

- todo control possui label associado;
- `name`, `type`, `autocomplete` e `inputmode` adequados;
- `aria-invalid` e mensagem ligada por `aria-describedby`;
- erro/pending/sucesso anunciado por `aria-live="polite"` ou toast existente;
- primeiro erro recebe foco quando viavel sem reescrever a biblioteca de form;
- paste nunca e bloqueado;
- password toggle comunica Mostrar/Ocultar;
- selects nativos definem color/background para compatibilidade.

### 18.3. Contraste e foco

- texto normal >= 4.5:1;
- texto grande e UI glyph >= 3:1;
- foco visivel de 3 px live com offset, inclusive em acid e ink;
- selecionado nao depende apenas de cor: check, borda, texto ou estado;
- disabled continua discernivel sem ficar ilegivel;
- cor nao e o unico sinal de live, erro, plano ou favorito.

### 18.4. Toque e teclado

- minimo 44 x 44 px;
- 8 px entre alvos adjacentes;
- acoes de row edit/delete sempre alcançaveis sem hover;
- todos os fluxos funcionam com Tab, Shift+Tab, Enter, Space e Escape;
- hover so dentro de media query que confirme pointer fino, quando CSS custom;
- `touch-action: manipulation` nos controles principais.

## 19. Estados obrigatorios por superficie

| Superficie | Estados a validar |
| --- | --- |
| Auth | idle, focus, password visible, pending, erro toast, disabled |
| Onboarding fan | sports loading, nenhum selecionado, selecionado, passo final, mutation error/pending |
| Onboarding pub | campos vazios/preenchidos, telefone, pending, error, conclusao |
| Dashboard fan | permissao unknown/idle/requesting/granted/denied/unavailable, loading, resultados, fallback, vazio, favorito pending, mapa error |
| Perfil | session loading, upload pending/error, edit/cancel/save, sem preferencias, sem favoritos, filtro vazio, lista/mapa |
| Detalhe bar | loading, not found, live, sem eventos, favorito anonimo/logado, copy/share success |
| Admin bar | loading, inativo, Starter normal/perto/limite, live/upcoming/past, agenda vazia, create/edit/delete pending/error, upload, preview |

Estados nao podem ser “embelezados” com dados falsos. Skeleton deve representar a
geometria final; empty state deve explicar a proxima acao real.

## 20. Plano de arquivos

### 20.1. Novos arquivos recomendados

- `apps/web/src/styles/onside-foundations.css`;
- `apps/web/src/components/brand/onside-brand.tsx`;
- componentes visuais pequenos extraidos de `dashboard_.profile.tsx` somente se
  reduzirem risco, por exemplo `profile/profile-header.tsx` e
  `profile/profile-tabs.tsx`.

Nao criar um arquivo por card estatico nem uma biblioteca paralela de primitives.

### 20.2. Arquivos compartilhados a alterar

- `apps/web/src/index.css`;
- `apps/web/src/components/landing/onside.css` apenas para extracao segura das
  fontes, se adotada;
- `apps/web/src/components/landing/onside-landing.tsx` apenas para consumir marca
  compartilhada, sem mudar copy/layout;
- `apps/web/src/components/app/app-shell.tsx`;
- `apps/web/src/components/app/google-map.tsx`;
- `apps/web/src/components/phone-input.tsx` somente se variantes visuais atuais
  nao puderem receber a fundacao por CSS externo.

### 20.3. Auth

- `routes/(auth)/login.tsx`;
- `routes/(auth)/signup.tsx`;
- `components/auth-brand-panel.tsx`;
- `components/auth-brand-copy.tsx`;
- `components/auth-input-field.tsx`;
- `components/auth-password-field.tsx`;
- `lib/auth-styles.ts`;
- `components/auth-form-field.tsx` apenas se continuar em uso real.

### 20.4. Onboarding

- as duas rotas `(onboarding)`;
- todos os arquivos em `components/onboarding/` necessarios ao visual.

### 20.5. Dashboard e pub

- as duas rotas `(dashboard)`;
- `components/dashboard/*`;
- rota `(pub)/pub.$pubId.tsx`;
- `components/pub/*`.

### 20.6. Painel do bar

- `routes/admin.tsx`;
- `components/admin/*` necessarios para layout, agenda, forms, preview e modal.

### 20.7. Arquivos proibidos sem justificativa funcional externa

- `packages/api/**`;
- `packages/auth/**`;
- `packages/db/**`;
- `apps/web/src/lib/auth-client.ts`;
- `apps/web/src/lib/analytics.ts`;
- `apps/web/src/utils/trpc.ts`;
- `apps/web/src/utils/auth-guards.ts`;
- `apps/web/src/routeTree.gen.ts`;
- migrations e lockfile.

## 21. Sequencia de implementacao

### Fase 1 — fundacao

1. registrar baseline visual e tecnico;
2. criar tokens/fonts/reduced motion escopados;
3. extrair marca compartilhada;
4. adaptar AppShell sem tocar contratos;
5. verificar landing e rotas excluidas do shell.

### Fase 2 — auth e onboarding

1. redesenhar componentes auth compartilhados;
2. ajustar login e signup;
3. redesenhar shell/progresso/navigation do onboarding;
4. ajustar selectors e form do bar;
5. verificar cada passo e mutation com mocks/estado real seguro.

### Fase 3 — torcedor

1. DashboardHero e SearchFilterBar;
2. BarCard e map chrome;
3. dashboard layout/estados;
4. detalhe do bar;
5. perfil por abas, extraindo somente apresentacao quando necessario.

### Fase 4 — painel do bar

1. reorganizar admin no esqueleto do mock da landing;
2. mapear stats reais;
3. avisos;
4. EventsManager, rows e empty state;
5. PubHero/edicao;
6. BarPreview;
7. Modal/EventForm.

### Fase 5 — endurecimento

1. teclado, focus, ARIA, labels e touch targets;
2. responsive 320–1440 e zoom;
3. reduced motion;
4. long content e estados vazios;
5. build/typecheck/Biome/diff check;
6. QA visual renderizado de landing + todas as rotas acessiveis.

## 22. Estrategia de verificacao

### 22.1. Inspecao estatica do diff

Confirmar:

- nenhum identificador tRPC/auth/analytics foi removido ou trocado;
- nenhum payload mudou;
- nenhum query option, enabled, key ou invalidate mudou;
- nenhum redirect/Link funcional mudou de destino;
- nenhum timer, date/time helper, geolocation ou map callback mudou;
- nenhuma dependencia/lockfile mudou;
- `routeTree.gen.ts` permanece intocado;
- landing so mudou para extracao visual compartilhada.

### 22.2. Testes focados

Adicionar testes apenas onde ja houver infraestrutura simples. Prioridades:

- role toggle de signup preserva `fan | pub`;
- onboarding navega passos e dispara payload existente;
- SearchFilterBar chama os mesmos callbacks;
- favorito impede navegacao acidental e chama handler;
- tabs do perfil chamam analytics existente;
- admin abre create/edit modal e monta payload existente;
- dialog share e modal admin preservam foco/fechamento.

Nao criar uma suite massiva nem testar implementacao de Tailwind.

### 22.3. Comandos tecnicos

Executar da raiz, de forma localizada:

```bash
rtk bunx biome check <arquivos-alterados>
rtk bunx tsc --noEmit -p apps/web/tsconfig.json
rtk bun --cwd apps/web run build
rtk git diff --check
```

Se `bun --cwd apps/web run build` nao for suportado pela versao local, executar
`rtk bun run build` com cwd `apps/web`.

Nao rodar `bun run check` na raiz porque ele pode escrever em arquivos nao
relacionados. Nao rodar qualquer teste que escreva no banco.

### 22.4. QA visual no navegador

Verificar renderizado, nao apenas por leitura de classes:

- `/` continua visualmente identica;
- `/login` e `/signup` desktop/mobile;
- todos os passos de `/onboarding/fan` e `/onboarding/pub`;
- `/dashboard` com permissao concedida, negada e fallback;
- `/dashboard/profile` nas tres abas;
- `/pub/:id` com e sem live/eventos;
- `/admin` em estados de plano acessiveis;
- modais, dropdown e sharing;
- 320, 375, 760, 1024, 1100 e 1440 px;
- reduced motion, teclado, zoom 200% e contraste;
- nenhuma rota excluida que usa AppShell quebra.

Se nao houver sessao/dados para uma rota, usar mocks locais de desenvolvimento ou
registrar a limitacao. Nao alterar banco nem fabricar validacao visual.

## 23. Criterios de aceite

### 23.1. Coerencia visual

- [ ] Todas as superficies usam paper/ink/acid/live de forma semanticamente
      consistente.
- [ ] Anton, Archivo e Geist Mono substituem Inter/Space Grotesk nas superficies
      redesenhadas.
- [ ] Wordmark e simbolo oficiais aparecem sem distorcao.
- [ ] Cards e botoes deixam de usar arredondamento/gradiente generico.
- [ ] Bordas e sombras deslocadas reproduzem a linguagem da landing.
- [ ] Emojis estruturais foram removidos.
- [ ] A landing nao sofreu regressao visual.

### 23.2. Painel do bar

- [ ] `/admin` se parece claramente com o mock “Onside para bares”.
- [ ] Existe navegacao Visao geral/Minha grade/Meu espaco/Configuracoes com
      destinos reais.
- [ ] O contexto do bar nao finge ser um seletor multi-bar.
- [ ] Stats usam apenas total, ao vivo e plano/limite ja disponiveis.
- [ ] Agenda real substitui as rows demonstrativas sem inventar rascunhos.
- [ ] Create/edit/delete/upload/preview continuam funcionando.

### 23.3. Preservacao funcional

- [ ] Queries/mutations/payloads/cache keys permanecem equivalentes.
- [ ] Auth, guards, redirects e roles permanecem equivalentes.
- [ ] Geolocalizacao, mapa, favoritos, upload e share permanecem equivalentes.
- [ ] Analytics existentes disparam nos mesmos momentos e sem payload novo.
- [ ] Nenhum arquivo de API, DB, auth contract, migration ou lockfile mudou.

### 23.4. Estados e acessibilidade

- [ ] Loading, empty, error, pending, live, upcoming, past, favorite, plan e
      limit possuem tratamento visual.
- [ ] Um H1 por pagina e headings hierarquicos.
- [ ] Labels, aria-invalid, aria-live e autocomplete estao presentes.
- [ ] Focus rings sao visiveis em todas as superficies.
- [ ] Icon buttons possuem aria-label e 44 x 44 px.
- [ ] Acoes de row nao dependem de hover.
- [ ] Dialogs preservam title, focus trap, Escape e retorno de foco.
- [ ] Contraste AA foi medido, nao presumido.
- [ ] Reduced motion remove pulse/translate/transicoes nao essenciais.

### 23.5. Responsividade e qualidade

- [ ] Sem overflow horizontal a partir de 320 px.
- [ ] Inputs tem 16 px em mobile.
- [ ] Sidebars e grids refluem sem esconder acoes.
- [ ] Sticky offsets respeitam header e impersonation banner.
- [ ] Conteudo longo nao quebra cards ou botoes.
- [ ] Biome focado, typecheck, build e `git diff --check` passam ou bloqueios de
      baseline sao documentados separadamente.
- [ ] Resultado foi inspecionado em navegador desktop e mobile.

## 24. Decisoes finais que nao devem ser reabertas

- O nome visual e Onside; o wordmark oficial substitui o antigo lockup textual
  FindSports nestas superficies.
- A landing ativa e a referencia, nao os componentes legados de landing ainda no
  repositorio.
- O painel do bar real e `/admin`, mesmo estando fora dos diretorios parenteticos
  citados no pedido.
- `/admin` usa a arquitetura do mock, mas somente dados reais ja disponiveis.
- Nao existe dropdown multi-bar, metrica de cobertura ou status rascunho novo.
- Acid e o acento principal para fan e pub; azul nao divide mais roles
  visualmente.
- Hugeicons pode permanecer; emojis nao.
- Shadcn continua dono de comportamento de forms, dialogs, dropdowns e feedback.
- Nao aplicar novo preset shadcn nem tematizar globalmente `packages/ui`.
- Nenhuma dependencia nova e necessaria.
- Nenhuma mudanca de backend, auth, analytics ou banco e autorizada.
- Fidelidade visual so e concluida apos QA renderizado.
