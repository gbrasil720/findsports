---
name: ui-polish
description: Regras e rotina de acabamento de interface da Onside. Use antes de qualquer mudança de UI, CSS, layout, espaçamento, alinhamento, componente, tela, folha, card, formulário, e-mail, texto de tela ou animação em apps/web, apps/mobile e packages/ui, e em todo pedido de revisão de design, polimento, "refinar a interface", "achar problemas de UI", "pente fino" ou "ui polish". Mede a tela renderizada em 1280 e 390, claro e escuro (scripts/shoot.ts), varre o código (scripts/scan.ts), corrige na peça por onde todos passam, e passa o movimento pelas skills do Emil (animate, animate-expo, gestures, animation-performance, review-animations, emil-design-eng, apple-design, find-animation-opportunities, improve-animations, break-ui).
---

# Acabamento de interface da Onside

Meça, não olhe. O olho perde erro de 1 a 2 px, a leitura do código não vê pixel, e um print mostra o que mudou, não o que está errado. Confira a tela renderizada.

Acabamento é devolver a tela ao desenho aprovado. Desenho novo e texto novo são do dono: mostre o print e as alternativas antes do merge. Correção que só devolve ao desenho segue sem perguntar.

## De onde vem o certo

- `DESIGN.md` (raiz): cores, tipos, formas, sombras, componentes. `PRODUCT.md`: decisões de produto.
- Web: os protótipos de `docs/design/redesign-2026-11/<landing|torcedor|painel|entrada>/` (o README tem os artifacts).
- App: o projeto do Claude Design e os artifacts "App · Rodada N" (seção "App mobile" do `AGENTS.md`). Leia o arquivo da tela antes de mexer nela.
- Na dúvida entre o código e o desenho, vale o desenho. Na dúvida entre dois desenhos, pergunte.

## Os números da casa

- **Tipos:** Anton só em caixa-alta, nunca abaixo de 22 px nem em texto corrido. Geist Mono só para dado (hora, contagem, distância, código, rótulo), com algarismos tabulares. Archivo no resto. Nunca troque nem "melhore" as fontes, diga a ferramenta o que disser.
- **Cores:** a paleta do `DESIGN.md`. Acid é luz (fundo de botão, seleção, dado bom), nunca texto sobre papel. Vermelho só para ao vivo, agora e a marca. Destaque do título: vermelho no claro, acid no escuro. Texto apagado é `muted`, não cinza puro.
- **Alturas:** botão 56, compacto 44, chip 36, campo 52. **Raios:** pílula em botão, chip e busca; cartão 20; destaque e cartão de tinta 24 a 28; ícone em caixa 12 a 16.
- **Espaço:** 4, 8, 12, 16, 20, 24, 28, 40, 56, 72. O CSS veio dos protótipos e tem 10, 14, 18 e 22 espalhados: na peça em que você mexe, siga o protótipo dela. Não normalize o arquivo inteiro.
- **Sombra:** sólida embaixo (`0 4px 0` no botão, `0 3px 0` no cartão), preta sobre tinta. A peça clicável sobe 2 px no hover e desce 3 px no toque.
- **Movimento no web:** `var(--ease)` (`cubic-bezier(0.16, 1, 0.3, 1)`), interface entre 120 e 300 ms, só `transform` e `opacity`.
- **Movimento no app:** `EASE`, `POP`, `SWAP`, `usePressScale` (0,97), `haptic` e `useShake` de `components/motion.tsx`. Não invente curva nova ao lado delas.
- **Peles do web, cada uma presa à sua classe:** painel `.pn3`, torcedor `.tc`, Houdini `.houdini`, landing `.lp3`. Classe curta sem o prefixo da pele vaza para a vizinha (`.grid` do torcedor já quebrou as casas do 2FA): diálogo vai em portal no `<body>`.
- **Cor no app:** uma tabela só, `PALETTE` em `components/theme.tsx`, lida por `usePalette()` ou pelas constantes de `components/ui.tsx` (`FG`, `BG`, `SUB`...). Cor que mais de uma peça usa entra na tabela.

## Regras

Cada uma já custou uma correção aqui. Entre parênteses, a regra de `measure.js` ou `scan.ts` que a pega.

Layout
1. Nada preso à janela cobre conteúdo nem controle: aviso de cookies (`--onside-consent-space`), abas, avisos da casca, barra de ação do rodapé, "Pular o passeio". No fim da rolagem o último item passa inteiro acima da barra: a folga é a altura medida dela. (`coberto`)
2. A página não rola de lado em 390. `overflow-x: clip`, não `hidden`, senão nada `sticky` gruda. (`rolagem-lateral`)
3. Altura de tela no celular é `100dvh` ou `100svh`. `100vh` fica atrás da barra do navegador. (`100vh`)
4. O que encosta na borda desconta a área segura (`--gl`, `--gr`, `env(safe-area-inset-*)`).
5. A primeira dobra da tela de uso responde "qual jogo, onde, quem vai" ou o número do dia. Filtro e configuração vêm depois do resultado.
6. Fileira que rola de lado não corta a sombra sólida dos cartões: dê o respiro embaixo. (`sombra-cortada`)

Alinhamento
7. Controles lado a lado têm a mesma altura. Diminua o mais alto. (`alturas`)
8. Respiro de cima igual ao de baixo, o da esquerda igual ao da direita. (`respiro`)
9. Canto dentro de canto: raio de dentro = raio de fora menos a folga. (`raio-aninhado`)
10. Número que muda (placar, contagem, relógio, preço) tem largura fixa: `tabular-nums`. Botão que troca o rótulo ao carregar não muda de largura (`BotaoAcao` no painel, `phaseLabel` com `busy` no app).
11. Ícone ao lado de texto centra no meio das maiúsculas, não na caixa da linha.

Texto
12. Quebre o sentido, não corte. "…" só quando o texto inteiro aparece em outro lugar. (`reticências`, `texto-cortado`)
13. Rótulo de botão não quebra de linha. Botões lado a lado cabem em 390 e, no app, com a letra em 1,35×. (`rótulo-quebra`, `quebra-palavra`)
14. Anton não perde o acento: no app, sem `lineHeight` abaixo de 1,505em (margem negativa no lugar).
15. Letra de 11 px para cima. Contraste 4,5:1 (3:1 em letra grande) nos dois temas: tinta sobre tinta no escuro e número sobre acid são os que mais escapam. (`letra-miúda`, `contraste`)
16. Texto de tela: presença nunca é "reserva"; é "teste", não "trial"; frase sem gênero; sem travessão nem ponto e vírgula; número só o que o servidor mandou; o que não existe diz "em breve" e não finge funcionar.

Estados
17. Todo bloco tem carregando, vazio e erro. Bloco que falhou vira `ErroBloco` (painel) ou `ErrorState` (app) com "Tentar de novo", nunca some. Mudança que falha avisa, nunca falha calada.
18. O próprio botão conta a fase (salvando, tentando de novo, salvo). Sem spinner solto ao lado.
19. Peça clicável tem os quatro estados: hover dentro de `@media (hover: hover)` (no toque o hover gruda), `:active` que desce, foco de teclado com o anel acid de 3 px afastado 3 px, e desligado. (`hover-solto`, `sem-pressionado`, `sem-foco`)
20. Alvo de toque: 44 × 44 para ícone, 36 de altura para pílula com palavra. No app, `hitSlop` completa. (`alvo-de-toque`)
21. Todo controle tem nome para o leitor de tela. Erro de campo fica abaixo dele, em `live-text`, ligado por `aria-describedby`. (`sem-nome`)
22. Imagem tem `width` e `height` ou `aspect-ratio`, e não estica. No app, `Image` com `width` e `height` explícitos. (`imagem`)

Tema
23. Toda mudança de cor é conferida no claro e no escuro. Sombra troca com o tema. Diferença entre os temas é token, nunca cor escrita na regra. (`cor fora da paleta`)

Movimento
24. Anime `transform` e `opacity`. Nada de `transition: all`, de `width`, `height`, `top` ou `left` animados, de `ease-in`, nem de nascer de `scale(0)`. (`scan.ts`)
25. Interface responde em menos de 300 ms; sair é mais rápido que entrar. Nada pisca nem aparece seco: card novo, folha, aviso. O que a pessoa faz cem vezes por dia não anima.
26. Estado que liga e desliga usa transição (dá para interromper no meio), não `@keyframes`.
27. Com movimento reduzido, só esmaece: sem subir, crescer nem deslizar. No CSS, as regras de `prefers-reduced-motion` ficam no fim do arquivo, para vencer a especificidade de cada peça. No app, `useReducedMotion`. (`movimento-reduzido`)
28. No app: `entering` e `exiting` são constante de módulo (escrito no JSX, o Reanimated recomeça a entrada); gesto segue o dedo no UI thread e solta com mola na velocidade do dedo; háptico só quando o valor muda; nada de opacidade animada sobre vidro.

App
29. `Text` e `TextInput` vêm de `@/components/ui`. Confira com a letra de acessibilidade no máximo (comando no `AGENTS.md`).
30. Barra de status por `useStatusBar`. Borda tracejada de um lado só é SVG.
31. A tela é comparada com o desenho no simulador de 390 × 844, no claro e no escuro, antes de dizer "pronto".

## Rotina

1. **Escopo.** Um pedido de auditoria ("acha problemas") só relata. Um pedido de polimento corrige. Lote grande (muitas telas): proponha primeiro, com o antes, o achado e a correção de cada item, e construa depois do sim.
2. **Varra o código** (segundos):
   ```bash
   bun .agents/skills/ui-polish/scripts/scan.ts --changed        # o que o branch mexeu
   bun .agents/skills/ui-polish/scripts/scan.ts apps/web/src/components/painel
   ```
3. **Meça a tela, antes de mexer.** Suba o web local (`AGENTS.md`: banco de dev, `EMAIL_DELIVERY=console`, par de teste do Turnstile) e rode:
   ```bash
   bun .agents/skills/ui-polish/scripts/shoot.ts /dashboard /bar/<slug> \
     --base http://localhost:3001 --out <scratchpad>/polish --label antes
   bun .agents/skills/ui-polish/scripts/shoot.ts /admin /admin/jogos \
     --base http://localhost:3001 --login <e-mail de QA>:<senha> --label antes
   ```
   Sai um print da página inteira por tela, largura e tema, e a lista de achados (erros primeiro). Falta o Chromium: `cd apps/e2e && bunx playwright install chromium`. Com outra ferramenta de navegador, `scripts/measure.js` é uma expressão: passe o arquivo ao `evaluate` dela.
4. **Triagem.** Abra o print e confira cada achado na tela. Três destinos: defeito (corrija), falso positivo (diga por quê na resposta; se for de vez, `data-polish-skip` no elemento ou `polish-ok` na linha), decisão de desenho (pergunte). O script não vê tudo: olhe o print também atrás de hierarquia, ritmo, alinhamento entre colunas e o que destoa do protótipo.
5. **Abra os estados.** O script mede a tela como ela carrega. Menu, folha, diálogo, erro, vazio, carregando, hover e foco você abre e mede um a um (`measure.js` na página já aberta).
6. **Corrija na origem.** Na classe da pele ou na peça do kit (`components/ui.tsx` do app, `packages/ui`, `components/painel/*`), por onde todos os usos passam, não na tela que alguém reportou.
7. **Varra os irmãos.** `grep` do mesmo padrão no web inteiro e no app, inclusive onde ninguém reclamou, e corrija na mesma mudança. Web e app recebem a mesma correção.
8. **Pior caso.** Rode a skill `break-ui` em todo componente que mostra dado: nome de bar longo, campeonato longo, uma letra, zero itens, 9.999, sem foto, sem nota. Na largura real do contêiner, em 390 e no escuro. O botão de teste dela não vai para produção.
9. **Movimento.** Passe pelas skills do Emil (abaixo).
10. **Meça de novo** com `--label depois`. Os achados têm de cair e nenhum novo aparecer. Confira o CSS do build quando a ordem das regras importar (o dev e o build ordenam diferente).
11. **Entregue** a tabela (achado, onde, antes, depois), os prints lado a lado em 1280 e 390, e o que ficou de fora e por quê. Pronto é cada item do pedido conferido numa tela de verdade. No fim, a varredura do Linear do `AGENTS.md`.

### App (`apps/mobile`)

Não há DOM para medir. `scan.ts` cobre o código; a tela se confere no simulador (seção "Ver a tela no simulador" do `AGENTS.md`): print a 3× ao lado do desenho em 390 × 844, claro e escuro, letra de acessibilidade no máximo, `idb` para toques e `recordVideo` para ver o movimento quadro a quadro. Tela nova entra no navegador DEV (`SECTIONS`).

## As skills do Emil

Regra do dono: toda tela nova ou mexida, no app e no web, passa por elas antes do "pronto" e antes do merge. Use a que o trabalho pede, nesta ordem:

| Quando | Skill |
|---|---|
| Construir movimento no web | `animate` (e o `RECIPES.md` dela) |
| Construir movimento no app | `animate-expo` |
| Arrastar, deslizar, folha, segurar | `gestures` |
| Engasgo, quadro perdido, `will-change` | `animation-performance` |
| Os princípios por trás da decisão | `emil-design-eng`, `apple-design` |
| O que devia animar e não anima | `find-animation-opportunities` (só propõe) |
| Auditoria de uma área inteira | `improve-animations` (só planeja) |
| Dar nome a um efeito | `animation-vocabulary` |
| Dado de pior caso | `break-ui` |
| Revisão final do movimento | `review-animations` |

`review-animations` tem `disable-model-invocation`: só o dono a chama. Leia `.claude/skills/review-animations/SKILL.md` e o `STANDARDS.md` e aplique à mão. A tabela (antes, depois, por quê) e o veredito vão no corpo do PR. Subagente faz o mesmo, lendo o arquivo. Tela de conversão (cadastro, plano, primeiro valor, página do bar) passa também por `revenue-centric-design`.

## Impeccable

Só para auditar: `/impeccable audit <alvo>` relata e não escreve. Não rode os comandos que redesenham ou gravam arquivo no repositório (`craft`, `shape`, `bolder`, `colorize`, `delight`, `overdrive`, `document`, `extract`, `init`, `live`). Nunca aceite o conselho de fonte dele. `frontend-design` e `ui-ux-pro-max` ficam fora das telas do produto: o desenho já está decidido.
