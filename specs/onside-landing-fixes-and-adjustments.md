# Spec — correções e consistência visual da landing Onside

Status: decisões fechadas; pronta para implementação

Escopo desta entrega: corrigir a legenda do mockup, tornar o controle do ticker previsível, aplicar o gênero feminino da marca e substituir glifos de interface inconsistentes por Reicon na landing ativa.

Limite operacional: implementar e validar no worktree atual, sem commit, push ou PR.

## 1. Objetivo

Entregar quatro ajustes coesos na rota pública `/`:

1. a legenda da prévia deve aparecer abaixo do mockup do iPhone, bem alinhada e sem ser coberta pelo aparelho ou por sua sombra em desktop e mobile;
2. o botão do ticker deve pausar e retomar a animação imediatamente, sem depender de mover o ponteiro, retirar foco ou rolar a página;
3. toda referência gramatical à marca deve usar o feminino — `a Onside` — sem reescrever a mensagem, a estrutura ou a intenção da copy;
4. emojis, glifos e ícones improvisados da landing ativa devem ser substituídos por componentes do pacote já instalado `reicon-react`, mantendo como texto apenas pontuação e conteúdo textual legítimo.

## 2. Decisões confirmadas

- O botão é a única fonte de verdade para pausar e retomar o ticker.
- `:hover` e `:focus-within` não podem alterar `animation-play-state`.
- `prefers-reduced-motion: reduce` continua desativando o marquee e ocultando um controle que não teria efeito.
- A legenda sai da área de sobreposição e entra no fluxo normal abaixo do aparelho.
- A legenda deve ser centralizada pelo eixo visual do aparelho, ficar fora da extensão da sombra e manter espaçamento consistente em todos os breakpoints.
- A transição para o feminino é estritamente gramatical. Não alterar argumentos, promessas, labels, ordem das seções nem intenção dos CTAs.
- Exemplo: `Levar o Onside à minha cidade` passa a `Levar a Onside à minha cidade`; não trocar por um CTA conceitualmente diferente.
- A migração de ícones abrange apenas a landing ativa e sua apresentação na rota `/`, não componentes legados que não são renderizados.
- Ícones Reicon decorativos usam `aria-hidden="true"`; controles continuam com nome acessível por texto visível ou `aria-label`.
- O botão do ticker mostra ícone e texto: `Pause` + `Pausar` ou `Play` + `Retomar`.
- `2 × 2`, separadores `·` e demais pontuações de conteúdo continuam texto.
- O ponto de status continua sendo uma forma CSS, não um ícone.
- A implementação não cria commit, não envia branch e não abre PR.

## 3. Superfícies em escopo

### 3.1. Arquivos esperados

- `apps/web/src/components/landing/onside-app-demo.tsx`
- `apps/web/src/components/landing/onside-landing.tsx`
- `apps/web/src/components/landing/onside-waitlist.tsx`
- `apps/web/src/components/landing/onside.css`
- `apps/web/src/routes/index.tsx`

### 3.2. Dependência disponível

O pacote real instalado é:

```text
reicon-react@1.1.302
```

Ele já aparece nas mudanças locais de `package.json` e `bun.lock`. Reutilizar essa instalação; não reinstalar, remover ou trocar a biblioteca. Preferir imports diretos, que o próprio pacote documenta como a opção de menor bundle:

```tsx
import ArrowRight from 'reicon-react/icons/ArrowRight'
import Check from 'reicon-react/icons/Check'
```

Não importar o barrel completo quando um subpath direto resolver.

### 3.3. Fora de escopo

- componentes legados da landing que não são alcançados por `apps/web/src/routes/index.tsx`;
- APIs, banco, schema da waitlist ou payloads dos formulários;
- mudanças na busca `pubs.getEliteEvents` ou no fallback editorial do ticker;
- mudanças na instrumentação de analytics;
- nova copy, novo posicionamento de produto ou nova ordem de seções;
- redesign do aparelho, do painel de bares ou da identidade visual;
- animações adicionais;
- alteração do wordmark ou dos assets da marca;
- commit, push ou PR.

## 4. Correção da legenda do mockup

### 4.1. Problema atual

Em `onside-app-demo.tsx`, o `figcaption.onside-demo-caption` está dentro de `figure.onside-product-stage`. Em `onside.css`, ele é absoluto e fica próximo ao limite inferior da stage, enquanto `.onside-phone-shell` ocupa praticamente toda a altura e projeta uma sombra para baixo. O resultado é a legenda coberta visualmente pelo aparelho/sombra, tanto em desktop quanto em mobile.

### 4.2. Estrutura esperada

Colocar o conjunto visual do mockup em um wrapper próprio e deixar o `figcaption` como o próximo item no fluxo:

```text
figure.onside-product-stage
├── div.onside-demo-visual
│   ├── badge de prévia
│   ├── glow
│   ├── phone shell
│   └── notas flutuantes
└── figcaption.onside-demo-caption
```

O nome exato de `.onside-demo-visual` é recomendado para tornar a intenção explícita. Se a implementação escolher outra estrutura, ela deve preservar os mesmos invariantes de layout.

### 4.3. Regras de layout

- `.onside-product-stage` organiza visual e legenda em linhas, sem posicionar a legenda de forma absoluta.
- `.onside-demo-visual` passa a ser o contexto `position: relative` dos elementos sobrepostos do mockup.
- Preservar a largura, rotação desktop, sombra, glow, badge e notas flutuantes atuais.
- A legenda deve ficar centralizada em relação ao aparelho, não ao viewport ou à coluna inteira quando esses centros divergirem.
- Reservar a extensão inferior da sombra antes do gap da legenda; texto e sombra não podem se tocar.
- Usar um gap visual consistente, recomendado entre `16px` e `24px` depois da sombra.
- Remover os overrides mobile que dependem de `bottom` absoluto.
- A legenda pode quebrar em mais de uma linha, mas não pode causar overflow horizontal.
- Preservar o texto atual da legenda, alterando somente o gênero conforme a seção 6.
- O hero pode ganhar a pequena altura adicional necessária para conter o fluxo; não reduzir o mockup para esconder o problema.

### 4.4. Aceite visual

- Em desktop e mobile, o retângulo da legenda começa abaixo do limite visual inferior da sombra.
- Os centros horizontais da legenda e do aparelho parecem alinhados; não há deslocamento perceptível.
- Badge, notas flutuantes e glow continuam posicionados em relação ao aparelho.
- Não há recorte, colisão ou overflow em larguras de `320px`, `390px`, `760px`, `1100px` e `1440px`.

## 5. Correção do ticker

### 5.1. Causa conhecida

O estado React atual alterna a classe `.is-paused`, mas o CSS também pausa o track quando a faixa está em `:hover` ou `:focus-within`. Depois de clicar em `Retomar`, o botão continua focado e o ponteiro normalmente continua sobre a faixa. Assim, o estado React diz “rodando”, mas o CSS continua pausando a animação.

### 5.2. Comportamento esperado

- Estado inicial sem preferência de movimento reduzido: ticker animando.
- Clique/toque em `Pausar`: `isPaused = true`, `aria-pressed="true"`, ícone `Pause` troca para `Play`, texto e `aria-label` passam a indicar `Retomar`, e a posição congela.
- Clique/toque em `Retomar`: `isPaused = false`, `aria-pressed="false"`, ícone `Play` troca para `Pause`, texto e `aria-label` passam a indicar `Pausar`, e o marquee continua da posição em que parou.
- Retomar deve funcionar enquanto o botão continua focado e sem mover o ponteiro.
- Teclas `Enter` e `Space` devem produzir o mesmo resultado nativo do clique.
- O comportamento é idêntico para agenda real e fallback de benefícios.
- O estado é local à montagem da página; não criar persistência em storage.

### 5.3. CSS

Deixar `.is-paused` como o único seletor interativo que aplica:

```css
animation-play-state: paused;
```

Remover os seletores de pausa por `:hover` e `:focus-within`. Não adicionar uma segunda fonte de estado por atributo, estilo inline ou manipulação direta do DOM.

Manter o bloco `prefers-reduced-motion: reduce` atual: animação desligada, conteúdo legível e controle oculto.

### 5.4. Controle visual e acessível

- Inserir `Pause` quando o próximo comando disponível for pausar.
- Inserir `Play` quando o próximo comando disponível for retomar.
- Manter texto visível ao lado do ícone; não transformar o controle em icon-only.
- O SVG é decorativo porque o botão já possui texto e `aria-label`; usar `aria-hidden="true"` e `focusable="false"`.
- Preservar `type="button"`, `aria-pressed` e touch target mínimo de `44px`.
- Ajustar apenas gap/alinhamento necessários; preservar a estética atual do controle.

## 6. Gênero feminino da marca

### 6.1. Regra editorial

Tratar Onside como marca feminina em toda a landing ativa:

- `o Onside` → `a Onside`;
- `do Onside` → `da Onside`;
- `no Onside` → `na Onside`;
- `ao Onside` → `à Onside`, se houver;
- `pelo Onside` → `pela Onside`, se houver;
- aplicar as mesmas transições em caixa alta.

Fazer ajustes mínimos de concordância quando forem indispensáveis. Não substituir verbos, benefícios, promessas, informação factual ou estrutura das frases.

### 6.2. Locais obrigatórios

- navegação desktop e mobile;
- eyebrow, hero, CTAs, seções, ticker e FAQ em `onside-landing.tsx`;
- legenda e demais textos em `onside-app-demo.tsx`;
- labels e mensagens de sucesso em `onside-waitlist.tsx`;
- `description` do JSON-LD;
- meta description;
- títulos e descrições Open Graph;
- títulos e descrições Twitter;
- textos acessíveis que contenham artigo ou contração associada à marca.

`Onside` isolado, wordmark, nome do produto no schema e frases como `Onside para bares` permanecem iguais quando não existe marcação de gênero.

### 6.3. Exemplos normativos

```text
O Onside já funciona na minha cidade?  →  A Onside já funciona na minha cidade?
O ONSIDE ESTÁ CHEGANDO                 →  A ONSIDE ESTÁ CHEGANDO
Levar o Onside à minha cidade          →  Levar a Onside à minha cidade
AJUDE O ONSIDE A CHEGAR                →  AJUDE A ONSIDE A CHEGAR
Benefícios do Onside                   →  Benefícios da Onside
quando o Onside chegar                 →  quando a Onside chegar
```

Não trocar o CTA por `Quero a Onside na minha cidade` ou outra nova formulação: isso alteraria mais do que o gênero.

## 7. Migração de ícones para Reicon

### 7.1. Princípios

- Usar ícones `Outline`, `currentColor` e tamanhos coerentes com o texto/controle existente.
- Fazer imports diretos por subpath.
- Não criar um wrapper genérico de ícone para esta tarefa; os poucos tamanhos podem permanecer explícitos e legíveis.
- Ícones decorativos recebem `aria-hidden="true"` e `focusable="false"`.
- O SVG não recebe handler quando o elemento pai já é o controle.
- Preservar labels e semântica HTML existentes.
- Remover regras CSS `content` que desenham `✓` ou `↗`; React deve renderizar esses ícones na árvore.
- Pseudo-elementos puramente gráficos com `content: ""` permanecem permitidos.

### 7.2. Mapeamento mínimo

| Uso atual | Reicon recomendado | Observação |
|---|---|---|
| menu do mockup e menu mobile fechado | `Menu` | o menu mobile aberto usa `Xmark` |
| busca `⌕` | `Search` ou `SearchNormal` | escolher um e reutilizar nos dois mocks |
| limpar busca `×` | `Xmark` | somente o `×` que representa ação de limpar |
| checks `✓` em sucesso, fatos e notas | `Check` | incluir os checks hoje gerados por pseudo-elementos CSS |
| CTA `→` | `ArrowRight` | manter o texto do CTA |
| CTA/benefício `↗` | `ArrowUpRight` | não implica abrir nova aba; é tratamento visual existente |
| dropdown `▾` | `ChevronDown` | painel ilustrativo, ainda `aria-hidden` pelo ancestral |
| `+ Adicionar transmissão` | `Add` | preservar label e caráter demonstrativo |
| expansão FAQ `+` | `Add` | pode rotacionar no estado `open`; sem novo estado React |
| ticker | `Pause` / `Play` | sempre junto ao texto visível |

### 7.3. Ocorrências obrigatórias

Em `onside-app-demo.tsx`:

- ponto textual `●`: substituir por elemento vazio com círculo em CSS;
- `☰`;
- busca `⌕`;
- limpar busca `×`;
- check da nota “Transmissão confirmada”.

Manter o `×` do placar `2 × 2` como texto.

Em `onside-landing.tsx`:

- ícone do botão real de menu nos estados aberto/fechado;
- setas dos CTAs;
- ícone da busca do JourneyVisual;
- chevron do mock de seletor de bar;
- add do mock “Adicionar transmissão”;
- checks das listas de prova/fatos;
- setas dos benefícios para bares;
- expansão do FAQ;
- Pause/Play do ticker.

Em `onside-waitlist.tsx`:

- check da mensagem de sucesso;
- setas dos botões de envio quando não estão pendentes.

Em `onside.css`:

- remover `content: "✓"` e `content: "↗"`;
- adaptar seletores de pseudo-elementos para classes/filhos SVG reais;
- adicionar uma classe compartilhada pequena para alinhamento de ícones apenas se ela reduzir duplicação sem apagar diferenças de tamanho/cor.

### 7.4. O que não converter

- `2 × 2` e outros usos matemáticos/textuais de `×`;
- separadores `·`, travessões, copyright e pontuação;
- pontos e linhas puramente decorativos feitos com CSS;
- o logotipo/wordmark da Onside;
- números de pins do mapa;
- o texto `+` se aparecer como conteúdo matemático real — atualmente, o caso relevante de adicionar transmissão deve virar ícone.

## 8. Preservação de comportamento

A implementação não pode regredir:

- `client.waitlist.join.mutate` e os payloads atuais de torcedor/bar;
- estados de validação, pending, erro e sucesso dos formulários;
- eventos de analytics existentes, incluindo `demoViewChanged`, cliques de CTA e funil de waitlist;
- `trpc.pubs.getEliteEvents.queryOptions()`;
- fallback de benefícios quando não há eventos;
- toggle lista/mapa do mockup e seus atributos `aria-pressed`, `aria-controls` e região live;
- menu mobile, foco inicial, Escape, restauração de foco e bloqueio de scroll;
- navegação por âncoras;
- fontes, cores, assets, rotação e linguagem visual editorial/brutalista atuais;
- SSR e metadata da rota.

## 9. Sequência recomendada de implementação

1. Ler integralmente esta spec e os cinco arquivos em escopo.
2. Confirmar o status do Git e preservar todas as mudanças preexistentes, especialmente instalação de `reicon-react` e skills locais.
3. Implementar primeiro a estrutura de `OnsideAppDemo` e o fluxo da legenda.
4. Corrigir a autoridade única do ticker e adicionar `Pause`/`Play`.
5. Migrar os glifos por componente, removendo pseudo-elementos Unicode correspondentes.
6. Aplicar a transição gramatical para o feminino, incluindo metadata.
7. Formatar somente arquivos alterados e rodar validações direcionadas.
8. Fazer QA visual/interativo em desktop e mobile.
9. Revisar o diff completo e deixar as mudanças sem commit.

## 10. Verificação automatizada

Executar a partir da raiz, sem auto-fix amplo no repositório:

```bash
bunx biome check \
  apps/web/src/components/landing/onside-app-demo.tsx \
  apps/web/src/components/landing/onside-landing.tsx \
  apps/web/src/components/landing/onside-waitlist.tsx \
  apps/web/src/components/landing/onside.css \
  apps/web/src/routes/index.tsx

bun run check-types

cd apps/web
bun run build
```

Depois, voltar à raiz e executar:

```bash
git diff --check
```

Não executar `bun run check`, pois ele usa `biome check --write .` e pode alterar o repositório inteiro.

Fazer também buscas direcionadas:

```bash
rg -n -i '\b(o|do|no|ao|pelo) onside\b|\bO ONSIDE\b|\bDO ONSIDE\b|\bNO ONSIDE\b|\bAO ONSIDE\b|\bPELO ONSIDE\b' \
  apps/web/src/components/landing/onside-app-demo.tsx \
  apps/web/src/components/landing/onside-landing.tsx \
  apps/web/src/components/landing/onside-waitlist.tsx \
  apps/web/src/routes/index.tsx

rg -n '[☰⌕✓↗→●▾]' \
  apps/web/src/components/landing/onside-app-demo.tsx \
  apps/web/src/components/landing/onside-landing.tsx \
  apps/web/src/components/landing/onside-waitlist.tsx \
  apps/web/src/components/landing/onside.css
```

Ambas devem terminar sem ocorrências. A busca não inclui `×` porque o placar textual deve permanecer; revisar manualmente para confirmar que apenas o placar e usos textuais legítimos restaram.

## 11. QA visual e interativo

Validar pelo menos em:

- desktop: `1440 × 900`;
- mobile principal: `390 × 844`;
- mobile estreito: `320 × 700`.

Checklist:

- legenda visível, abaixo da sombra, centralizada com o aparelho e sem overflow;
- badge, glow e notas flutuantes preservados;
- nenhuma colisão nova no hero;
- ticker começa animado quando movimento não está reduzido;
- `Pausar` congela o transform do track;
- `Retomar` volta a alterar o transform sem blur, movimento do ponteiro ou scroll;
- repetir pause/retomar pelo menos três vezes;
- testar clique/toque e teclado;
- confirmar `aria-pressed`, texto, `aria-label` e ícone a cada estado;
- confirmar que hover sobre a faixa não pausa;
- confirmar que foco no botão não pausa quando o estado é “rodando”;
- menu mobile alterna `Menu`/`Xmark` sem perder nome acessível ou fluxo de foco;
- FAQ continua abrindo/fechando e o ícone acompanha o estado visual;
- lista/mapa do mockup continua funcional;
- formulários continuam exibindo validação e mantêm seus payloads;
- sem overflow horizontal nas três larguras;
- console sem novos erros ou warnings de hydration.

Se o ambiente não oferecer navegador, registrar essa limitação de forma explícita; build e inspeção estática não contam como QA visual.

## 12. Critérios finais de aceite

A tarefa só está completa quando todos os itens abaixo forem verdadeiros:

- [ ] legenda em fluxo normal abaixo do mockup, bem alinhada em desktop e mobile;
- [ ] sombra do iPhone não cobre nenhum pixel da legenda;
- [ ] ticker controlado exclusivamente por `isPaused`/`.is-paused`;
- [ ] retomar funciona imediatamente com botão ainda focado e ponteiro parado;
- [ ] reduced motion continua estático e sem controle inútil;
- [ ] `Pause`/`Play` aparecem com texto visível e semântica acessível;
- [ ] todas as referências gramaticais à marca estão no feminino;
- [ ] nenhum aspecto da copy além de gênero/concordância foi reescrito;
- [ ] todos os glifos de interface listados foram migrados para `reicon-react`;
- [ ] placar `2 × 2`, separadores e pontuação legítima foram preservados;
- [ ] nenhum comportamento de formulário, ticker de dados, analytics, menu ou demo regrediu;
- [ ] imports diretos de Reicon mantêm o bundle analisável;
- [ ] Biome direcionado passa;
- [ ] typecheck passa ou qualquer falha baseline é documentada com evidência;
- [ ] build cliente + SSR de `apps/web` passa;
- [ ] `git diff --check` passa;
- [ ] QA desktop/mobile foi concluído ou a indisponibilidade do navegador foi explicitamente registrada;
- [ ] o diff final contém apenas a spec, os arquivos de implementação em escopo e mudanças locais preexistentes preservadas;
- [ ] nenhum commit, push ou PR foi criado.
