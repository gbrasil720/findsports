---
version: 1
slug: "apps-web-src-routes-index-tsx"
primary_target: "apps/web/src/routes/index.tsx"
related_targets: []
---

# Landing + web do torcedor

Scope: `/` (landing), página do jogo, página do bar completa, Explorar no web. Mode: Persuade (landing); jogo/bar/explorar são Operate dentro do mesmo mundo.
Audience: torcedor decidindo onde ver o jogo de hoje (celular à noite, notebook à tarde). Secundário: dono de bar (faixa "Tenho um bar").
Action: buscar jogo + lugar e ver os bares, no web, sem conta. Conta só para "Vou assistir aqui". Reverte "web só para bares" (dono, 05/11/2026).
Proof: grade real de hoje (`pubs.todayGames`, `countTodayNear`), visita verificada, nota só de quem foi. Sem número inventado: contagens do design são exemplo.
Constraint: não pode parecer panfleto ou cartaz (dono).

## Direction contract
THESIS: a página é a noite do jogo. Refuso o hero de headline + botão + linha de cards; o topo é a busca funcionando e a régua da noite com os jogos de hoje.
OWN-WORLD: tinta #12120f, papel #f1eee6, pedra #e7e3db, acid #c9f135 como luz de refletor, vermelho #e8320c só para ao vivo. Anton nos títulos, Archivo no texto, Geist Mono só para horário, placar e código. Régua horizontal de 18:00 a 02:00, jogos como faixas pelo horário e duração.
STORY: entendo em 5 s que é "onde passa meu jogo hoje", vejo a grade real antes de qualquer cadastro, busco, e o resto da noite (amigos, código no balcão, avaliação verificada) mostra por que confiar.
FIRST VIEWPORT: título Anton à esquerda em 2 linhas, busca larga (jogo, onde, Ver bares) logo abaixo, régua da noite ocupando a largura com 5–7 jogos de hoje e a contagem de bares em cada; relógio da noite fixo à direita.
FORM: estrutura 7 da lista (a noite do jogo), seed:1481948aef21a615. Interação assinatura: rolar avança o relógio 18:00→02:00 e o fundo vai do papel à tinta quando a bola rola.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
