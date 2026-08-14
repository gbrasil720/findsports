# Spec — auditoria e correção integral de consistência da UI Onside

## 1. Resumo executivo

Esta especificação sucede `specs/onside-app-pages-redesign.md` e transforma o
redesign já iniciado em uma revisão sistemática de **todas as superfícies de UI
ativas de `apps/web`**. A entrega deve localizar e corrigir inconsistências de
ícones, cor, contraste, tipografia, espaçamento, responsividade, inputs,
banners, cards, mapas, tabelas, menus, modais, estados assíncronos, semântica,
acessibilidade e microcopy operacional.

O resultado esperado não é uma nova direção visual. É uma única aplicação
Onside, coerente com a landing ativa, sem controles falsos, estados enganosos,
componentes interativos inválidos ou regressões nos contratos produtivos.

Esta spec amplia deliberadamente o escopo anterior:

- inclui `/plan`, `/admin/billing` e todas as rotas `/internal*`;
- substitui a decisão anterior que permitia Hugeicons nas páginas do produto;
- inclui o documento raiz, metadados, banners globais e componentes
  compartilhados;
- trata bugs de interface e acessibilidade como parte do redesign, ainda que
  não sejam apenas visuais;
- exige prova visual em desktop, mobile, zoom e navegação por teclado.

## 2. Relação com a spec anterior e precedência

`specs/onside-app-pages-redesign.md` continua sendo a referência para a direção
visual, os contratos que precisam ser preservados e as jornadas originalmente
mapeadas. Esta spec prevalece somente quando:

1. amplia o conjunto de rotas e componentes auditados;
2. exige Reicon como biblioteca de ícones de apresentação;
3. corrige um problema concreto de interface, semântica ou acessibilidade;
4. define critérios de aceitação mais específicos e verificáveis.

Em qualquer outro conflito, seguir esta ordem:

1. contratos produtivos atuais de autenticação, API, banco, cache e analytics;
2. esta spec;
3. `specs/onside-app-pages-redesign.md`;
4. a landing ativa e seus componentes;
5. os componentes shadcn/Base UI já instalados;
6. a UI atual apenas como evidência de funcionalidade.

O worktree já contém uma implementação extensa e ainda não consolidada da spec
anterior. Ela é o baseline desta entrega. Preservar todas as mudanças existentes
e evoluí-las; não restaurar arquivos, não recomeçar o redesign e não descartar
trabalho local.

## 3. Fonte de verdade visual

A referência ativa é:

- `apps/web/src/routes/index.tsx`;
- `apps/web/src/components/landing/onside-landing.tsx`;
- `apps/web/src/components/landing/onside-app-demo.tsx`;
- `apps/web/src/components/landing/onside-waitlist.tsx`;
- `apps/web/src/components/landing/onside.css`;
- `apps/web/public/onside-wordmark-paper.png`;
- `apps/web/public/onside-icone-preto.png`;
- `apps/web/public/fonts/onside/*`.

Fundamentos obrigatórios:

- paper `#F1EEE6` para superfícies principais;
- ink `#12120F` para texto, bordas e superfícies escuras;
- acid `#C9F135` para ação primária e confirmação;
- live `#E8320C` para ao vivo, atenção e foco, nunca como texto pequeno quando o
  contraste não alcançar AA;
- stone `#E7E3DB` e muted `#55554F` para hierarquia secundária em paper;
- Anton em títulos de impacto, Archivo no corpo e Geist Mono em metadados;
- geometria editorial, bordas firmes, pouco raio e sombras deslocadas;
- movimento curto e funcional, totalmente removível por
  `prefers-reduced-motion`.

Não reproduzir literalmente uma escolha da landing quando ela falhar em
contraste, acessibilidade ou comportamento no contexto do produto. A identidade
visual é a referência; WCAG 2.2 AA e a semântica do controle são restrições.

## 4. Escopo completo

### 4.1. Rotas de página

| Jornada | Arquivo |
| --- | --- |
| Documento raiz | `routes/__root.tsx` |
| Landing | `routes/index.tsx` e `components/landing/*` ativos |
| Login | `routes/(auth)/login.tsx` |
| Cadastro | `routes/(auth)/signup.tsx` |
| Onboarding torcedor | `routes/(onboarding)/onboarding.fan.tsx` |
| Onboarding bar | `routes/(onboarding)/onboarding.pub.tsx` |
| Descoberta | `routes/(dashboard)/dashboard.tsx` |
| Perfil | `routes/(dashboard)/dashboard_.profile.tsx` |
| Bar público | `routes/(pub)/pub.$pubId.tsx` |
| Painel do bar | `routes/admin.tsx` |
| Planos | `routes/plan.tsx` |
| Assinatura e pagamentos | `routes/admin_.billing.tsx` |
| Hall interno | `routes/internal.tsx` |
| Waitlist interna | `routes/internal_.waitlist.tsx` |
| Gestão interna de usuários | `routes/internal_.manage-users.tsx` |

Rotas de API, sitemap e robots não são superfícies visuais, mas não podem ser
quebradas por mudanças no root ou nas dependências.

### 4.2. Componentes compartilhados

Também fazem parte do escopo:

- `components/app/*`;
- `components/admin/*`;
- `components/auth-*`;
- `components/brand/*`;
- `components/dashboard/*`;
- `components/onboarding/*`;
- `components/pricing/*`;
- `components/pub/*`;
- `components/impersonation-banner.tsx`;
- `components/phone-input.tsx`;
- estilos globais e fundamentos Onside em `src/index.css`, `src/styles/*` e
  `src/lib/auth-styles.ts`.

Antes de editar um componente aparentemente legado, comprovar uso com busca de
imports. `auth-card.tsx`, `auth-form-field.tsx`, `user-menu.tsx` e
`admin/edit-profile-form.tsx` aparentam não integrar a árvore ativa atual. Se
continuarem inalcançáveis, não redesenhá-los por arrasto; remover somente quando
essa limpeza for segura e não misturar a remoção com mudanças funcionais.

## 5. Invariantes e limites

### 5.1. Preservar integralmente

- nomes e argumentos de queries e mutations tRPC;
- payloads, invalidações, optimistic updates e cache keys;
- guards, permissões, roles, ownership e redirects;
- contrato de Better Auth e sessão;
- regras de plano, limites, checkout, portal e upload;
- formato persistido, schema, migrations e dados;
- destinos de rotas e parâmetros públicos;
- eventos de analytics válidos e seus payloads;
- fluxo de Google Maps, geolocalização, favorito, compartilhamento e
  impersonação, exceto correções de feedback e apresentação descritas aqui.

### 5.2. Autorizado

- reorganizar markup e extrair componentes puramente visuais;
- corrigir HTML inválido, ARIA, foco, labels e navegação por teclado;
- introduzir estado local de apresentação, por exemplo active tab, pending,
  disclosure e feedback;
- adicionar validação de cliente equivalente ou mais clara, sem mudar o
  contrato enviado;
- corrigir copy operacional quando o texto atual contradiz a ação real;
- trocar Hugeicons por Reicon sem alterar a ação associada;
- criar tokens semânticos de contraste e componentes de shell compartilhados;
- remover um controle comprovadamente sem ação quando não existir contrato real
  que permita implementá-lo.

### 5.3. Fora de escopo

- qualquer alteração em banco ou migration;
- novos endpoints, filtros, entidades, planos ou permissões;
- dependências novas: Reicon já está instalado e em uso;
- trocar o provedor de mapas;
- reescrever a landing ou alterar sua proposta comercial;
- inventar links, dados, paginação, recuperação de senha ou páginas legais;
- autoformatar o monorepo inteiro;
- trocar o preset shadcn ou remodelar `packages/ui` globalmente.

## 6. Severidade e ordem de execução

### P0 — integridade da interação

Corrigir antes de polimento:

- elementos interativos aninhados ou sem ação;
- estado de sucesso exibido antes de a mutation terminar;
- copy de CTA que promete destino diferente do redirect real;
- falhas assíncronas que deixam loading preso ou somem silenciosamente;
- shell de usuário falso em página pública;
- botões destrutivos sem confirmação;
- inputs sem associação de label, validação ou feedback;
- layout que bloqueia ação em 320 px, zoom 200% ou com banner de impersonação.

### P1 — consistência sistêmica

- Reicon em toda a apresentação do app;
- tokens e contraste AA;
- shells, cards, inputs, badges, banners, menus, modais e tabelas Onside;
- estados loading/error/empty/pending/success consistentes;
- composição correta de shadcn/Base UI;
- foco, teclado, touch target e reduced motion.

### P2 — acabamento

- metadados e títulos Onside;
- microcopy, reticências tipográficas e nomenclatura consistente;
- redução de duplicação visual e componentes mortos comprovados;
- prevenção de layout shift, truncamento e refinamento responsivo.

## 7. Regras globais obrigatórias

### 7.1. Ícones: Reicon é a única fonte de apresentação

A landing ativa importa ícones diretamente de `reicon-react/icons/*`. Todas as
rotas e componentes de produto devem adotar o mesmo padrão.

- substituir imports de `@hugeicons/core-free-icons` e `@hugeicons/react` em
  superfícies ativas;
- escolher o ícone Reicon pela semântica, não pela semelhança geométrica;
- usar imports diretos para preservar tree-shaking;
- manter tamanho e stroke coerentes por contexto;
- todo botão icon-only deve ter nome acessível explícito;
- ícones decorativos devem ser ocultos da árvore acessível;
- não usar emoji, caracteres Unicode ou letras como substituto de ícone de
  interface quando houver equivalente Reicon;
- não mapear modalidades para símbolos sem relação. Futebol, basquete, vôlei,
  futebol americano, automobilismo e lutas precisam de ícones semanticamente
  corretos; quando Reicon não tiver um equivalente confiável, usar uma sigla
  textual consistente com nome acessível completo;
- o SVG de pin específico do Google Maps é uma exceção de domínio permitida;
- ícones internos de primitives shadcn/Base UI podem continuar usando a
  implementação da própria primitive. Não alterar `components.json` nem forçar
  Reicon dentro de código de infraestrutura de `packages/ui`.

Aceite estático: imports Hugeicons não podem permanecer na árvore ativa das
páginas do app. Qualquer exceção precisa estar documentada no PR com o motivo e
não pode ser um ícone de apresentação substituível.

### 7.2. Cor e contraste

O baseline contém combinações que falham WCAG AA:

| Combinação observada | Contraste aproximado | Decisão |
| --- | ---: | --- |
| acid sobre paper | 1.12:1 | nunca usar acid como texto nem paper sobre acid |
| live sobre paper | 3.70:1 | não usar em texto normal pequeno |
| branco sobre live | 4.29:1 | não usar em badge pequeno normal |
| muted sobre ink | 2.50:1 | criar tom claro para texto secundário escuro |
| muted sobre paper | 6.47:1 | permitido |
| paper sobre ink | 16.18:1 | permitido |

Criar e usar tokens semânticos, centralizados nos fundamentos:

- `--onside-live-text: #C92B0C` para texto pequeno em paper e estados que
  precisam de AA;
- `--onside-muted-on-ink: #AAA9A4` para texto secundário em ink;
- acid sempre com texto ink;
- live original pode permanecer em áreas grandes, bordas, ícones e indicadores,
  desde que o texto adjacente carregue o significado;
- não codificar `blue-*`, `orange-*`, `green-*`, `amber-*`, `zinc-*`, white ou
  black arbitrários nas páginas. Mapear cada uso a um token semântico Onside;
- nunca comunicar status somente por cor.

Revalidar todos os badges, erros, links, placeholders, textos desabilitados,
estados passados, banners e overlays. Texto normal deve atingir 4.5:1; texto
grande e elementos gráficos essenciais, 3:1.

### 7.3. Tipografia, geometria e conteúdo

- usar Anton somente em títulos, números de impacto e labels editoriais;
- usar Archivo em corpo e controles; Geist Mono em metadados curtos;
- abandonar gradientes decorativos, pills excessivas e grandes raios herdados;
- não usar `transition-all`; animar apenas propriedades específicas;
- usar `…`, nunca três pontos em labels e estados;
- não truncar nomes ou dados críticos sem uma forma de acessar o conteúdo
  completo;
- reservar dimensões de imagens para evitar layout shift;
- não criar botões, links ou affordances sem ação real;
- não usar `href="#"` como placeholder.

### 7.4. Inputs e formulários

Todo campo ativo deve ter:

- `id` e `name` estáveis;
- `<label htmlFor>` ou associação ARIA equivalente;
- `type`, `inputMode` e `autoComplete` apropriados;
- estado `required` coerente com a validação e com o contrato;
- `aria-invalid` e `aria-describedby` quando houver erro;
- erro inline próximo, anúncio acessível e foco no primeiro campo inválido;
- limite de tamanho coerente com o backend;
- placeholder apenas como exemplo, nunca como label;
- foco visível de 3 px ou equivalente, sem `outline: none` desprotegido;
- loading com Spinner, disable e prevenção de envio duplicado.

Usar `Field`, `FieldGroup`, `InputGroup`, `Select`, `ToggleGroup`, `Spinner` e
`Skeleton` já instalados quando eles melhorarem a semântica. Não duplicar
primitives. No Base UI Select, fornecer `items` no root e envolver opções em
`SelectGroup`. Em DropdownMenu, usar `DropdownMenuGroup` e o `render` da
primitive para links, evitando `<Link>` aninhado em item/botão.

### 7.5. Acessibilidade e responsividade

- alvo mínimo de 44 × 44 px para ações de touch;
- foco nunca pode ficar oculto por header, banner, modal ou região sticky;
- todos os fluxos devem funcionar apenas por teclado;
- tabs precisam de roving focus, `aria-controls`, `tabpanel` e estado refletido
  na URL quando isso for necessário para deep link/voltar;
- grupos de escolha usam fieldset/legend, radiogroup ou ToggleGroup apropriado;
- loading, erro, sucesso e mudança de etapa usam live region com parcimônia;
- respeitar `prefers-reduced-motion` em hover, width, transform, skeletons,
  spinners não essenciais e transições personalizadas;
- não criar scroll horizontal de página em 320 px;
- tabelas largas precisam de região de scroll nomeada ou representação em
  cards, mantendo coluna chave e ações acessíveis;
- validar texto longo, nomes longos, e-mail, endereço, erro e tradução;
- `svh`/`dvh` e safe areas devem ser consistentes; evitar `100vh` rígido.

### 7.6. Estados assíncronos

Cada query e mutation visível precisa de uma decisão explícita para:

- loading ou skeleton sem layout shift;
- erro humano, retry quando seguro e detalhe técnico apenas em desenvolvimento;
- vazio verdadeiro, distinto de falha;
- pending com ação desabilitada;
- sucesso mostrado somente após confirmação;
- rollback/recuperação quando já existir no contrato.

Não transformar `undefined` de loading/error em dados falsos como “Starter”,
“Meu bar”, zero itens ou localização real.

## 8. Auditoria por superfície

### 8.1. Documento raiz, metadados e fundamentos

Arquivos principais: `routes/__root.tsx`, `src/index.css`, `src/styles/*`,
`src/lib/auth-styles.ts`.

Correções:

- substituir title, description, author, Open Graph, Twitter e theme color
  herdados de FindSports pela marca Onside;
- remover o carregamento remoto de Inter/Space Grotesk se nenhuma rota ativa
  continuar dependendo deles; usar as fontes Onside self-hosted;
- renderizar TanStack Router/Query devtools apenas em desenvolvimento;
- alinhar o viewport shell em `svh`/`dvh` e safe areas;
- eliminar duplicação de tokens crus entre `index.css` e os fundamentos;
- corrigir `.onside-input`: foco deve usar `:focus-visible` e não remover outline
  sem substituto equivalente;
- ampliar reduced motion para cards, escolhas, tabs, progress bars e custom
  transitions, não apenas botões;
- minimizar overrides `!important`; preferir wrappers/variants locais;
- adicionar skip link funcional e destino no conteúdo principal de cada shell.

Aceite: nenhuma página ativa herda marca FindSports, fontes antigas ou devtool
de produção; os tokens de contraste são definidos uma vez.

### 8.2. AppShell e impersonação

Arquivos: `components/app/app-shell.tsx`,
`components/impersonation-banner.tsx`.

Correções:

- migrar todos os ícones para Reicon;
- compor itens do menu com `DropdownMenuGroup` e `render={<Link ... />}`, sem
  interativos aninhados;
- nomear acessivelmente o trigger, inclusive quando só avatar/chevron aparece;
- usar `…` no fallback de nome;
- oferecer variantes explícitas `fan`, `pub/admin` e `public` baseadas em sessão;
  visitante de bar público recebe login/entrada, nunca avatar `?` nem menu fan;
- garantir que ação de sair, perfil e billing reflitam a role atual;
- transformar o banner de impersonação em layout responsivo: altura dinâmica,
  conteúdo que quebra linha, ação mínima de 44 px, Reicon e contraste Onside;
- expor falha ao encerrar impersonação, permitir retry e não esconder erro;
- calcular o offset do conteúdo a partir da altura real do banner, sem `pt-11`
  fixo;
- marcar o banner como status sem anunciar repetidamente a cada render.

### 8.3. Login e cadastro

Arquivos: `routes/(auth)/login.tsx`, `routes/(auth)/signup.tsx` e componentes
`auth-*` ativos.

Correções:

- remover do login a chamada incorreta a `analytics.signupStarted()` disparada
  por foco; usar evento real de login se já existir ou não inventar métrica;
- remover/fazer texto dos links falsos `href="#"` de “Esqueceu a senha?” e
  termos até existirem destinos reais;
- adicionar validação real de nome, e-mail, senha e confirmação nos campos, com
  feedback inline, associação ARIA e primeiro foco inválido;
- impedir que `noValidate` converta campos vazios em request inválida sem
  feedback;
- tratar toast como feedback complementar, não único;
- tornar role um grupo nomeado semanticamente, com estado selecionado exposto;
- limitar `signupStarted` a uma vez por tentativa/jornada, em vez de cada foco;
- usar Spinner e labels “Acessando…”/“Criando conta…” durante pending;
- revisar autocomplete, input mode, spellcheck e password-manager affordances;
- corrigir contraste do painel escuro com `--onside-muted-on-ink`;
- manter os calls de auth, payloads, redirects e analytics válidos existentes.

### 8.4. Onboarding do torcedor

Arquivos: `routes/(onboarding)/onboarding.fan.tsx` e
`components/onboarding/*` usados por essa rota.

Correções:

- substituir os mapeamentos semânticos errados de esportes: medalha para
  futebol, radio button para basquete, peso para futebol americano e alvo de
  dinheiro para MMA não são aceitáveis;
- migrar navegação, boas-vindas, raio e seletores para Reicon;
- mostrar loading, erro com retry e vazio para a consulta de esportes;
- não apresentar “Tudo pronto” ou feed calibrado antes da mutation final. O
  último passo é revisão/pronto para salvar; sucesso só após resposta;
- tornar os passos nomeados, com etapa atual visível/para screen reader e
  `aria-current` correto;
- ao mudar de etapa, focar o heading e anunciar a mudança sem mover o cursor de
  modo inesperado;
- expor seleção de esporte e raio como grupos acessíveis, com alvo de 44 px;
- remover props visuais legadas `orange`/`blue` quando não tiverem mais efeito;
- preservar os quatro passos, payload, analytics e redirect existentes.

### 8.5. Onboarding do bar e PhoneInput

Arquivos: `routes/(onboarding)/onboarding.pub.tsx`,
`components/onboarding/pub-info-form.tsx`, `components/phone-input.tsx`.

Correções:

- no último passo, não dizer “BAR CADASTRADO” antes da mutation;
- alinhar o CTA ao redirect real `/plan`, por exemplo “Escolher meu plano”, sem
  alterar o redirect;
- adicionar id/name/label/required e erro inline a todos os campos;
- corrigir autocomplete de endereço: `address-line1` para endereço,
  `address-level2` para cidade e tratamento apropriado para bairro; não usar
  `address-level1` como cidade;
- alinhar asteriscos e `canAdvance` ao que é realmente obrigatório no payload;
- validar e trimar texto antes de habilitar avanço, sem alterar o payload final;
- PhoneInput deve encaminhar id/name/required/invalid/describedby, manter label
  associada, `type="tel"`, `inputMode="tel"` e autocomplete;
- não usar emoji de bandeira como ícone de interface. Preferir código ISO e
  affordance Reicon consistente;
- não inferir falsamente EUA quando `+1` também pode ser Canadá. Preservar a
  escolha do usuário ou representar o código compartilhado de forma neutra;
- garantir reset/sincronização do estado interno quando o formulário for
  reiniciado;
- estilizar dropdown, busca, foco e estados do telefone com os fundamentos.

### 8.6. Dashboard de descoberta

Arquivos: `routes/(dashboard)/dashboard.tsx`, `components/dashboard/*` e
`components/app/google-map.tsx`.

Correções na busca e filtros:

- transformar busca em `type="search"`, com nome, label acessível, autocomplete
  off, spellcheck false e foco visível no container;
- elevar todos os filtros/reset para 44 px e representar esportes/raio como
  grupos acessíveis;
- mostrar estados loading/error/empty das opções de esportes;
- remover API visual morta de filtros individuais ou disponibilizar a ação
  correspondente sem duplicar controles;
- validar que a região sticky não consome a tela em mobile/zoom.

Correções na página:

- distinguir localização real, solicitando, negada, indisponível e fallback de
  São Paulo; não dizer “perto de você” quando a origem for fallback;
- renderizar erro/retry de esportes, busca, fallback e favoritos em vez de falso
  vazio;
- remover “Ver mais bares” porque atualmente não possui ação, salvo se puder ser
  conectado a paginação já existente sem criar contrato;
- conectar o analytics de campeonato apenas a um gatilho real já suportado ou
  remover o handler morto; não inventar evento;
- validar coordenadas antes de mapear e manter card útil para bar sem posição;
- não tratar `occupancy: 0` como sinal real de lotação/heat;
- usar Spinner/reticência correta e reservar espaço nos skeletons.

Correções em `BarCard`:

- eliminar `<button>` de favorito aninhado dentro de `<Link>`; usar link
  estendido ou elementos irmãos com ordens de foco claras;
- desabilitar ação de favorito enquanto pending e anunciar erro;
- impedir colisão do badge de plano com título/ações em largura estreita;
- preservar acesso ao nome completo mesmo quando houver truncamento;
- manter target mínimo e estados de foco/hover/touch equivalentes.

Correções no mapa:

- exibir o ponto “você” somente com coordenadas reais do usuário, nunca no
  fallback de São Paulo;
- validar coordenadas de markers;
- usar gesture handling que não capture o scroll da página em mobile;
- fornecer skeleton/status enquanto carrega, erro humano e retry;
- permitir nova tentativa após falha do loader, em vez de manter promise
  rejeitada para sempre;
- manter seleção/hover sincronizados também para teclado e touch;
- esconder detalhe técnico da key em produção;
- renomear acentos internos `orange/blue/black` para semântica
  `live/acid/ink`, preservando os SVGs específicos de pin.

### 8.7. Perfil do torcedor

Arquivo: `routes/(dashboard)/dashboard_.profile.tsx`.

Correções:

- fornecer label/status ao loading inicial;
- adicionar dimensões à imagem de perfil;
- nomear o input de edição, limitar tamanho e oferecer save/cancel com 44 px,
  labels acessíveis e Escape para cancelar;
- não usar `autoFocus` indiscriminadamente em mobile;
- implementar tabs completas: ids, aria-controls, tabpanels, roving tabindex,
  setas e estado navegável/deep-link quando aplicável;
- substituir `transition-all` da barra de progresso e respeitar reduced motion;
- usar skeletons para favoritos e evitar layout shift;
- transformar toggle grid/list em controle com `aria-pressed` e 44 px;
- corrigir todas as combinações acid com paper: seleção acid sempre usa ink;
- envolver save de raio em `try/catch/finally`, mostrar erro e nunca deixar
  `savingRadius` travado;
- nomear os grupos de raio e esportes, expor seleção e erro;
- elevar desfavoritar para 44 px, sem sobrepor/nestar com o link do card;
- substituir glyph `›` e Hugeicons por Reicon;
- migrar classes zinc e cores cruas para tokens semânticos;
- manter queries, mutations, uploads e invalidações intactos.

### 8.8. Página pública do bar

Arquivos: `routes/(pub)/pub.$pubId.tsx` e `components/pub/*`.

Correções:

- usar AppShell público/session-aware. Visitante não pode aparecer como fan
  desconhecido; role pub/admin não pode ser enviado ao login ao tentar uma ação
  exclusiva de fan sem explicação;
- para visitante, favorito vira entrada/login real; para role incompatível,
  ocultar ou desabilitar com explicação; para fan, preservar mutation;
- loading e not-found também usam shell público correto;
- filtrar “Próximos jogos” por data futura; o baseline inclui eventos passados
  por testar apenas `!isLive`;
- desabilitar favorito pending e mostrar falha;
- validar coordenadas antes de abrir direções;
- capturar rejeição de clipboard/native share e fornecer feedback;
- fazer a linha de compartilhar quebrar/empilhar em 320 px e manter 44 px;
- transformar telefone em link `tel:` quando válido e endereço/direções em ação
  clara;
- corrigir grid de evento que usa três colunas sem breakpoint;
- tornar nome completo de participantes acessível quando truncado;
- não usar live como cor genérica de link ou ícone fora de estado live;
- revisar sticky sidebar, textos longos e `break-all`;
- usar título/meta Onside coerente, preferencialmente com nome real do bar.

### 8.9. Painel do bar

Arquivos: `routes/admin.tsx` e `components/admin/*` ativos.

Correções na página:

- não substituir loading/error por dados falsos como “Meu bar” ou plano Starter;
- mostrar erro/retry para bar, eventos e subscription;
- impedir flash de banner/limite Starter antes da subscription carregar;
- não manter `aria-current="true"` estático na navegação por âncoras; refletir a
  seção atual ou retirar o atributo;
- renomear “Configurações” para “Assinatura e pagamentos” se o destino continuar
  sendo billing;
- não disparar analytics de limite repetidamente por ref callback/render;
- quando o plano estiver no limite, desabilitar “Novo evento” com explicação e
  caminho real de upgrade, preservando enforcement do backend;
- usar display label do plano, não valor cru lowercase;
- remover duplicação de query apenas se isso não mudar cache/contrato.

Correções em eventos e formulários:

- usar AlertDialog para confirmar exclusão com nome/data do evento;
- mostrar erros de delete/create/update e permitir retry seguro;
- mostrar loading/error/empty das consultas de eventos, esportes e times;
- substituir skeletons manuais pelos primitives já instalados;
- transformar time/esporte em grupos acessíveis, 44 px, sem pills azuis;
- adicionar name/id/required e trim a inputs/selects; whitespace não habilita
  save;
- estilizar select nativo explicitamente para color scheme correto;
- evitar scroll aninhado entre Modal e EventForm;
- garantir uma única autoridade de fechamento: não chamar `onClose` em
  `DialogClose` e novamente em `onOpenChange`;
- usar Spinner, pending disable e reticências corretas.

Correções de perfil do bar:

- labels visíveis nos inputs inline de `PubHeroSection`, não apenas placeholders;
- foco visível, erro da mutation e targets mínimos em editar/salvar/cancelar;
- `PubAvatar` precisa de aria-label, affordance em focus/touch, dimensões de
  imagem e erro de upload anunciado;
- confirmar se `EditProfileForm` está ativo. Se estiver, layout de uma coluna em
  mobile, labels/required coerentes e estilo Onside; se não, não gastar escopo;
- estados passados não podem reduzir o contraste das ações abaixo de AA.

### 8.10. Planos

Arquivos: `routes/plan.tsx`, `components/pricing/plan-card.tsx`.

Correções:

- redesenhar a superfície antiga escura/azul/verde para paper/ink/acid/live;
- migrar todos os ícones para Reicon;
- substituir cards arredondados, gradientes e scale decorativo pela hierarquia
  editorial Onside;
- representar planos como radiogroup ou controle de seleção equivalente, com
  nome, descrição, preço e seleção acessíveis;
- sincronizar plano selecionado quando subscription assíncrona chega, sem
  sobrescrever uma escolha que o usuário já fez;
- mostrar loading/error/retry da subscription antes de assumir current plan;
- mostrar erro de checkout em live region e manter ação disponível para retry;
- usar Spinner/pending e impedir checkout duplicado;
- comunicar downgrade/limites com callout de contraste AA, não amber genérico;
- preservar IDs, preços derivados, mutation e redirect/checkout atuais.

### 8.11. Assinatura e pagamentos

Arquivo: `routes/admin_.billing.tsx`.

Correções:

- migrar cards, badges, botões e ícones para fundamentos Onside/Reicon;
- usar “Assinatura e pagamentos” consistentemente em título, breadcrumb e
  navegação;
- remover ignore ARIA sem justificativa e corrigir a causa;
- mostrar erro/retry da lista de pagamentos;
- mostrar falha ao abrir portal, hoje silenciosa;
- substituir skeletons manuais e `animate-pulse` ad hoc;
- medir contraste de status, diferenciar texto/ícone além de cor;
- elevar ações pequenas a 44 px e garantir pending/disable;
- garantir que lista de pagamentos, IDs, valores e status funcionem em 320 px e
  com conteúdo longo;
- não assumir plano/status enquanto a subscription está carregando;
- preservar mutations de checkout/portal e contrato de billing.

### 8.12. Área interna

Arquivos: `routes/internal.tsx`, `routes/internal_.waitlist.tsx`,
`routes/internal_.manage-users.tsx`.

Correções compartilhadas:

- substituir visual FindSports, Logo antigo, zinc/white/blue/orange e Hugeicons;
- extrair `InternalShell` compartilhado com OnsideBrand, contexto admin, voltar,
  sair, conteúdo principal e suporte ao banner de impersonação;
- manter guards e autorização server-side intactos;
- não esconder “Acessar” até hover; link deve ser perceptível por touch/teclado;
- evitar overflow do header “Hall / Admin / Sair” em 320 px;
- usar metadados Onside.

Waitlist e filtros:

- search precisa de label, name, type search, autocomplete off e spellcheck;
- Selects precisam de label, `items` no root e `SelectGroup`;
- loading deve ser anunciado; erro precisa de ação real de retry;
- export deve manter feedback de erro e pending;
- tabela deve ter região de scroll nomeada ou cards responsivos, com ações
  sempre alcançáveis.

Gestão de usuários:

- corrigir os Selects de filtro e role com `items`/`SelectGroup`;
- botão de mais ações precisa de 44 px e aria-label com o nome do usuário;
- associar labels a textarea, select e campos dos dialogs;
- garantir pending/erro nas ações de role, ban, unban e impersonação;
- manter confirmação para ban e adicionar confirmação/undo apropriado para
  unban quando o impacto justificar;
- confirmar claramente a identidade antes de impersonar;
- impedir que status, role e ban dependam somente de cor;
- tornar dialogs e tabelas utilizáveis em mobile/zoom sem esconder ações.

## 9. Plano de implementação

Executar nesta ordem para evitar remendos locais:

### Fase 1 — fundação e primitives

1. consolidar tokens, contraste, foco e reduced motion;
2. definir helpers/aliases semânticos Reicon apenas quando reduzirem repetição;
3. corrigir AppShell, InternalShell e impersonation banner;
4. corrigir composição Base UI/shadcn compartilhada;
5. criar padrões únicos para form field, feedback, skeleton e empty/error state.

### Fase 2 — P0 por jornada

1. auth e onboarding;
2. dashboard, mapa e BarCard;
3. perfil e bar público;
4. admin e eventos;
5. plan/billing;
6. internal.

Cada jornada só avança depois de passar typecheck/lint focado e uma inspeção
responsiva básica. Não acumular erros estruturais até o fim.

### Fase 3 — migração visual completa

1. remover Hugeicons da árvore ativa;
2. remover cores e geometrias legadas;
3. revisar todos os estados assíncronos;
4. revisar copy operacional, metadata e conteúdo longo;
5. provar teclado, touch e reduced motion.

### Fase 4 — limpeza limitada

Somente após comprovar que não são importados, remover componentes legados que
ficaram sem consumidores. Não fazer refactor arquitetural adicional.

## 10. Verificação obrigatória

### 10.1. Checagens estáticas

Executar a partir da raiz, com RTK:

```bash
rtk bunx tsc --noEmit -p apps/web/tsconfig.json
rtk bun run --filter web build
rtk bunx biome check <arquivos-alterados>
rtk git diff --check
rtk rg -n "@hugeicons/(react|core-free-icons)" apps/web/src
rtk rg -n "href=.[#]|transition-all|outline-none" apps/web/src
rtk rg -n "text-(blue|orange|green|amber|zinc)|bg-(blue|orange|green|amber|zinc)" apps/web/src/routes apps/web/src/components
```

Resultados de `rg` não são aprovação/reprovação automática: revisar cada match,
eliminar os ativos e documentar exceções reais. Não rodar formatter ou autofix
no repositório inteiro.

O baseline em 2026-08-12 já passou em `rtk bun run --filter web build`; isso
prova compilação client/SSR, não qualidade visual. O build reportou chunk
principal acima de 500 kB; observar regressão, mas não abrir um projeto de
performance fora desta entrega.

### 10.2. Matriz visual

Validar no browser conectado, com dados seguros e sem testes que mutem banco:

- larguras 320, 375, 760, 1024, 1100 e 1440 px;
- landscape mobile quando a tela tiver modal, tabela ou mapa;
- zoom de 200%;
- teclado completo e foco visível;
- `prefers-reduced-motion: reduce`;
- sessão anônima, fan, pub, admin e impersonação;
- loading, erro, vazio, pending, sucesso e conteúdo longo.

Rotas mínimas:

```text
/
/login
/signup
/onboarding/fan (todos os passos)
/onboarding/pub (todos os passos)
/dashboard
/dashboard/profile (todas as tabs)
/pub/:pubId
/admin
/plan
/admin/billing
/internal
/internal/waitlist
/internal/manage-users
```

Na ausência de um browser conectado, registrar explicitamente que QA visual está
pendente. Build, SSR e inspeção estática não autorizam afirmar que o visual foi
validado.

### 10.3. Cenários de regressão

- login/cadastro inválido, pending, erro e sucesso;
- cada passo de onboarding, voltar/avançar e falha final;
- localização permitida, negada, indisponível e fallback;
- busca/filtro/reset, favorito, mapa/card e query error;
- edição de perfil, upload, tabs, esportes e raio com mutation rejeitada;
- bar público anônimo/fan/pub e evento live/futuro/passado;
- criar/editar/excluir evento, limite de plano e erro de mutation;
- plano atual tardio, troca, checkout e portal com falha;
- waitlist loading/error/empty/export;
- gestão de role, ban, unban e impersonação;
- banner longo em 320 px e 200% de zoom;
- logout e menus por teclado em todos os shells.

## 11. Critérios finais de aceitação

A entrega só está pronta quando:

- todas as rotas da seção 4 foram auditadas e corrigidas;
- nenhuma superfície ativa aparenta ser FindSports ou um template genérico
  blue/zinc;
- Reicon é a fonte única de ícones de apresentação, com exceções documentadas;
- não há interativos aninhados, links falsos ou botões sem ação;
- não há sucesso prematuro, CTA enganoso ou loading travado conhecido;
- inputs possuem labels, nomes, autocomplete, validação e feedback corretos;
- contraste, foco, targets, teclado, zoom e reduced motion atendem aos critérios;
- cada query/mutation visível tem estado coerente de loading/error/empty/pending;
- os contratos funcionais da seção 5 permaneceram equivalentes;
- typecheck, build, Biome focado e `git diff --check` passam ou qualquer ruído de
  baseline é isolado com evidência;
- a matriz visual foi executada em browser conectado, ou a limitação foi
  declarada sem alegação de sucesso visual;
- o diff contém somente arquivos intencionalmente classificados.

## 12. Decisões encerradas

Não reabrir durante a implementação:

- a landing Onside é a referência visual;
- todas as páginas ativas de `apps/web`, inclusive plan/billing/internal, estão
  no escopo;
- Reicon substitui Hugeicons na apresentação do app;
- SVGs específicos do mapa e primitives internos do shadcn são exceções
  limitadas, não precedentes para misturar bibliotecas;
- acid usa texto ink; live não é texto pequeno sem token de contraste;
- UI pública é session-aware e não inventa role fan;
- não se inventa ação para controle morto;
- comportamento produtivo, autenticação, autorização, API e banco permanecem
  intactos;
- nenhuma aprovação visual pode ser declarada sem browser conectado.
