---
name: Onside
description: O jogo de hoje, no bar certo. Torcedor acha onde assistir; bar prova o público.
colors:
  ink: "#12120f"
  ink-raised: "#1c1c18"
  ink-well: "#2a2a24"
  ink-line: "#34342d"
  paper: "#f1eee6"
  stone: "#e7e3db"
  sand: "#d9d4c8"
  card: "#faf8f3"
  acid: "#c9f135"
  acid-drop: "#7f9a12"
  acid-deep: "#5b6d0c"
  live: "#e8320c"
  live-on-ink: "#f3421d"
  live-text: "#c92b0c"
  body: "#3a3a35"
  muted: "#55554f"
  muted-on-ink: "#aaa9a4"
  soft-on-ink: "#c9c7c0"
typography:
  display-hero:
    fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif"
    fontSize: "clamp(68px, 9.6vw, 150px)"
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: "-0.005em"
  display:
    fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif"
    fontSize: "clamp(46px, 6.2vw, 96px)"
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif"
    fontSize: "clamp(28px, 3vw, 44px)"
    fontWeight: 400
    lineHeight: 0.95
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
  data:
    fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.2
    fontFeature: "'tnum' 1"
rounded:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "28px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  7: "28px"
  8: "40px"
  9: "56px"
  10: "72px"
  section: "clamp(88px, 10vw, 140px)"
components:
  button-acid:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 26px"
    height: "56px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 26px"
    height: "56px"
  button-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 26px"
    height: "56px"
  button-compact:
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "44px"
  chip:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 15px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 15px"
    height: "36px"
  chip-positive:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "36px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  card-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.2xl}"
    padding: "26px"
  tag-live:
    backgroundColor: "{colors.live}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "4px 8px"
---

# Design System: Onside

## Overview

**Creative North Star: "O Telão do Bar"**

Tudo na Onside é visto como num telão de LED em noite de jogo. A tinta é a sala escura, a luz acid aparece onde a pessoa tem de olhar ou agir, o vermelho acende só para o que está ao vivo, e o produto real (telas do app, do painel, o código do balcão) sempre aparece em quadro, nunca uma ilustração no lugar dele. A voz é de boteco e de placar: títulos em Anton caixa-alta, como letreiro; horários, contagens e códigos em mono, como no placar; o resto em Archivo, direto.

O sistema tem dois registros com a mesma pele. **Vitrine** (landing, estados vazios, sucesso, cabeçalhos de seção): telão de LED vivo com fotos de torcida em pontos, faixas que correm, títulos de 100 px, celular inclinado com cartões flutuando. **Uso** (web do torcedor, painel do bar, app): as mesmas cores, tipos, botões e sombras, com o espetáculo recolhido. Telas de uso entregam valor com pouco: a primeira dobra responde "qual jogo, onde, quem vai" com o mínimo de moldura.

Papel e tinta seguem o tema do sistema nas telas de uso. Na vitrine, papel e tinta alternam por seção como dia e noite de jogo. Nada de vidro decorativo, gradiente em texto, cartão com faixa lateral colorida, emoji como ícone ou ilustração inventada do produto.

**Key Characteristics:**
- Tinta e papel quentes, acid como luz, vermelho só para "ao vivo".
- Anton caixa-alta em títulos, Geist Mono em dado, Archivo no texto.
- Sombra sólida embaixo dos botões, como peça apoiada no balcão.
- Telas reais do produto em moldura de celular ou navegador.
- Telão de LED (foto em pontos) como textura da marca, só na vitrine.

## Colors

Paleta quente e de pouca cor: dois neutros de tinta e papel carregam quase tudo, e duas cores vivas têm papéis que não se trocam.

### Primary
- **Acid de Refletor** (`acid`): a luz da marca. Ação principal (botão acid), item selecionado, dado positivo (barras, "+13%"), destaque do título sobre tinta. Sempre com texto `ink` em cima.
- **Acid Apoiado** (`acid-drop`): a sombra sólida dos botões acid. **Acid Fundo** (`acid-deep`): ícone ou fio acid sobre papel quando o acid puro some.

### Secondary
- **Vermelho Ao Vivo** (`live`): jogo rolando agora, o ponto pulsante, a bola do logo, o destaque do título sobre papel. **Sobre tinta** usa `live-on-ink`. Texto vermelho pequeno sobre papel usa `live-text`, que passa 4,5:1.

### Neutral
- **Tinta de Bar** (`ink`): texto principal no claro, fundo no escuro e nas seções de noite. **Tinta Elevada** (`ink-raised`): cartão sobre tinta. **Poço** (`ink-well`): trilho, chip negativo, tecla sobre tinta. **Fio na Tinta** (`ink-line`): divisória sobre tinta.
- **Papel de Comanda** (`paper`): fundo no claro, texto no escuro. **Pedra** (`stone`): faixa secundária, chip, ícone em caixa. **Areia** (`sand`): divisória e sombra sólida de cartão sobre papel. **Cartão** (`card`): superfície que sai do papel.
- **Texto** (`body`), **Apagado** (`muted`), **Apagado na Tinta** (`muted-on-ink`), **Suave na Tinta** (`soft-on-ink`): hierarquia de texto secundário.

### Named Rules
**The Live Red Rule.** Vermelho só para o que acontece agora (ao vivo, "agora" na régua, a bola do logo) e para o destaque do título no claro. Nunca decoração, nunca erro genérico.

**The Acid Light Rule.** Acid é luz, não tinta: fundo de botão, seleção, dado bom, destaque sobre tinta. Nunca texto acid sobre papel (some). No claro, o destaque do título é vermelho; no escuro, acid. Exceção de marca: "O JOGO?" do título do app é sempre vermelho.

## Typography

**Display Font:** Anton (com Impact, Arial Narrow)
**Body Font:** Archivo (com ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono (com ui-monospace, Menlo)

**Character:** letreiro de bar e placar eletrônico. Anton condensado grita o título como faixa de estádio; Geist Mono dá ao horário e ao código a cara de placar; Archivo conversa no meio, sem pose.

### Hierarchy
- **Display Hero** (Anton 400, `clamp(68px, 9.6vw, 150px)`, 0.92): só o título da landing.
- **Display** (Anton 400, `clamp(46px, 6.2vw, 96px)`, 0.92): título de seção na vitrine; título de página nas telas de uso cai para 40–56 px.
- **Headline** (Anton 400, `clamp(28px, 3vw, 44px)`, 0.95): nome do jogo, nome do bar, número de KPI.
- **Title** (Archivo 700, 20 px, 1.25): título de cartão, pergunta de FAQ, nome na lista.
- **Body** (Archivo 400, 17 px, 1.55): texto corrido, até 52–62 caracteres por linha. **Body sm** (14,5 px): meta de lista, nota.
- **Label** (Geist Mono 600, 11,5 px, 0.08em, caixa-alta): rótulo de campo, "O QUE PESOU".
- **Data** (Geist Mono 500, 13–15 px, algarismos tabulares): horário, contagem, distância, código, URL.

### Named Rules
**The Letreiro Rule.** Anton é sempre caixa-alta, nunca em texto corrido nem abaixo de 22 px. Duas a três linhas por título; a segunda linha pode levar a cor de destaque.

**The Mono Is Data Rule.** Geist Mono só para o que é medido ou lido como placar: hora, contagem, código, distância, rótulo. Nunca parágrafo.

## Layout

Contêiner de 1320 px com respiro lateral de 24 px no desktop e 16 px (mais a área segura) no celular. Seções da vitrine respiram `clamp(88px, 10vw, 140px)` em cima e embaixo; telas de uso usam 24–40 px. Grupos irmãos em flex ou grid com `gap` da escala (8, 12, 16, 20, 28, 40, 56, 72). Mais espaço acima de um título do que abaixo.

A vitrine alterna largura e densidade: título largo, depois duas colunas (texto e produto em quadro), faixa de tela inteira (ticker, esportes), e um telefone fixo que troca de tela conforme a rolagem. Abaixo de 1100 px tudo vira uma coluna; abaixo de 900 px o telefone fixo vira uma tela por passo. Telas de uso: navegação lateral que vira trilho de ícones até 1180 px (como o `PainelShell`), conteúdo com a resposta principal na primeira dobra.

### Named Rules
**The Little Chrome Rule.** Em tela de uso, a primeira dobra já entrega o valor (o jogo, os bares, quem vai, o número do dia) com no máximo uma faixa de cabeçalho. Filtro e configuração moram depois do resultado, nunca antes.

## Elevation & Depth

Profundidade por **sombra sólida**, como objeto apoiado no balcão, mais uma sombra ambiente longa e suave quando o objeto flutua (celular, resultado da busca, painel). Sobre tinta a sombra sólida é preto puro. Nada de halo colorido sem deslocamento nem brilho em volta de borda.

### Shadow Vocabulary
- **Botão acid** (`box-shadow: 0 4px 0 #7f9a12`; hover `0 6px 0` e sobe 2 px; pressionado `0 1px 0` e desce 3 px).
- **Botão tinta** (`box-shadow: 0 4px 0 #000`).
- **Cartão no papel** (`box-shadow: 0 3px 0 #d9d4c8, 0 24px 40px -30px rgba(18,18,15,.5)`).
- **Objeto flutuante** (`box-shadow: 0 4px 0 rgba(0,0,0,.55), 0 24px 40px -18px rgba(0,0,0,.7)`): cartões em volta do celular, resultado da busca.
- **Celular** (`box-shadow: inset 0 0 0 1.5px #3a3a33, 0 50px 90px -30px rgba(0,0,0,.75)`).

### Named Rules
**The Solid Drop Rule.** Toda peça clicável tem a sombra sólida embaixo e reage ao toque descendo. A sombra diagonal antiga do painel (`4px 4px 0`) migra para a vertical no redesign.

## Shapes

Cantos generosos e pílulas. Botão, chip, campo de busca de uma linha e navegação flutuante são pílula (999 px). Cartão 20 px, cartão de destaque e painéis sobre tinta 24–28 px, conversa e caixa de mensagem 32 px. Ícone em caixa 12–16 px. A marca é o anel com a bola vermelha no canto inferior direito; o fim de "ONSIDE" leva o quadradinho vermelho. Balões de conversa têm um canto menor (6 px) do lado de quem fala. Separadores em lista são fios de 1,5 px em tinta (vitrine) ou 1 px em areia (uso).

## Components

### Buttons
- **Shape:** pílula (999 px), 56 px de altura; compacto 44 px; Archivo 700 16 px.
- **Primary:** acid com texto tinta e sombra `acid-drop`. Um por tela.
- **Ink / Paper:** tinta com texto papel (sobre papel) ou papel com texto tinta (sobre tinta), mesma mecânica de sombra.
- **Ghost:** contorno de 1,5 px na cor do texto, sem sombra; ação secundária ("Tenho um bar").
- **Hover / Focus / Active:** sobe 2 px com sombra maior; foco com anel acid de 3 px afastado 3 px; pressionado desce 3 px. Rótulo diz o que acontece ("Ver bares", "Vou assistir aqui", "Me avise").

### Chips
- **Style:** pílula de 36 px, Archivo 600 14 px. Pedra no claro, poço na tinta.
- **State:** selecionado em tinta com texto papel; positivo (o que pesou bem) em acid; negativo em poço.

### Cards / Containers
- **Corner Style:** 20 px (lista, nota), 24–28 px (destaque, cartão de tinta).
- **Background:** `card` sobre papel, `ink-raised` sobre tinta, `ink` como cartão de destaque no claro.
- **Shadow Strategy:** "Cartão no papel" (ver Elevation).
- **Internal Padding:** 18–26 px.
- Cartão não aninha cartão; lista dentro de cartão usa fio, não outra caixa.

### Inputs / Fields
- **Style:** campos agrupados numa barra pílula de papel (busca do hero), cada campo com rótulo mono em cima e valor em Archivo 700 18 px; divisória de 1 px em areia. Campo isolado: papel, 52 px, raio 24 px.
- **Focus:** o campo ganha fundo `card` e o anel acid.
- **Error:** texto em `live-text` abaixo, dizendo o que corrigir.

### Navigation
- **Vitrine:** pílula flutuante fixa no topo, tinta translúcida sobre seções de tinta e papel translúcido sobre papel (troca ao rolar); logo à esquerda, âncoras ao centro, ação acid à direita.
- **Uso:** barra lateral do painel / abas do app; item ativo em cartão com sombra sólida, contadores em mono.

### Icons
- **Conjunto único:** os ícones do app (`ICONS` em `apps/mobile/components/ui.tsx`), 24 × 24, preenchidos e em duotom: uma camada a 30%, a camada cheia e um detalhe de acento (`--spark`: vermelho no claro, acid no escuro e sobre tinta; vermelho quando o ícone está numa caixa acid). Web, painel e app usam os mesmos desenhos; nada de ícone de traço de outra biblioteca.

### Telão de LED (signature)
Foto real de torcida ou bar reduzida a uma grade de quadrados (passo ~6 px, 78% de preenchimento) em papel sobre tinta; o que é TV ou gramado acende em acid. Pisca devagar, uma faixa de luz desce, e acende perto do ponteiro. Só na vitrine (hero, seção de prova, fechamento). Pausa fora da tela e para com movimento reduzido.

### Telefone e navegador em quadro (signature)
Telas reais do app em moldura de celular (raio 15,5%/7,2%, borda escura) e do painel em moldura de navegador com a URL em mono. Na vitrine o celular inclina 3–4° e ganha até três cartões flutuantes com dados da tela.

### Placar e régua (signature)
Ticker de jogos em Geist Mono acid sobre tinta, com trama de pontos; relógio em dígitos de placar (mono 26 px em teclas escuras com brilho acid); régua da noite (16h–2h) com o "agora" em vermelho.

## Do's and Don'ts

### Do:
- **Do** mostrar o produto real: tela do app, do painel, o código do balcão. Dado de exemplo é marcado como exemplo.
- **Do** usar acid para uma ação por tela e para o que está selecionado ou bom.
- **Do** dar a horário, contagem, distância e código a Geist Mono com algarismos tabulares.
- **Do** manter a primeira dobra das telas de uso respondendo "qual jogo, onde, quem vai" ou o número do dia do bar.
- **Do** animar com `cubic-bezier(.16,1,.3,1)` a partir de um estado visível, e respeitar `prefers-reduced-motion`.
- **Do** seguir o tema do sistema nas telas de uso: tinta e papel trocam, acid substitui o vermelho no destaque do título.

### Don't:
- **Don't** pôr o telão de LED, faixas que correm ou títulos acima de 56 px dentro de telas de uso.
- **Don't** usar vermelho para nada que não seja ao vivo, agora ou a marca.
- **Don't** escrever texto acid sobre papel, nem texto cinza puro: use `muted` ou `muted-on-ink`.
- **Don't** usar vidro como enfeite, gradiente em texto, faixa lateral colorida em cartão, emoji como ícone, ou rótulo pequeno em cima de título.
- **Don't** desenhar uma tela do produto à mão quando existe a tela real para enquadrar.
- **Don't** chamar presença de reserva em nenhum texto de interface.
