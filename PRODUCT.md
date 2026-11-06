# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

O monorepo tem duas superfícies de produto. Esta raiz vale para as duas e é a do web
(`apps/web`: painel do bar, entrada, Houdini). O app do torcedor tem o seu em
`apps/mobile/PRODUCT.md`, que herda daqui e muda plataforma e usuário.

## Users

- **Torcedor** (app, `apps/mobile`): quer ver um jogo específico fora de casa, hoje ou
  nos próximos dias, num bar perto, com telão e som, e saber quem mais vai. Usa o
  celular na rua ou em casa decidindo para onde ir.
- **Dono de bar** (web, `apps/web`, `/admin`): publica a grade de jogos da casa, mede
  quem se interessou, quem foi e quanto o bar rendeu com a Onside, e decide se vale o
  plano. Usa no computador ou no celular entre um turno e outro; o painel segue o tema
  do sistema.
- **Equipe Onside** (Houdini, `houdini.onside.sh`): revisa fotos, descrições e
  comentários, liga feitiços, acompanha IA e cobrança. Só admin com 2FA.

**Torcedor volta ao web (decisão do dono, 05/11/2026, revoga a de 24/10/2026).** Qualquer
pessoa vê bares, jogos e a página do bar sem conta, no web e no app. Favoritar, "Vou
assistir aqui", avaliar, amigos e o resto do que grava algo pedem login. A landing nova, o
web do torcedor e o painel do bar redesenhados entram juntos, sem esperar o app chegar às
lojas; o app mobile é redesenhado depois, no mesmo mundo visual. No web, logado, entram
(dono, 05/11/2026): favoritos, "Vou assistir aqui" com o código do balcão, Meus jogos, a
avaliação do pós-jogo, Bares pra você, preferências, perfil completo (com conquistas) e o
onboarding do torcedor; e o onboarding do bar redesenhado. Amigos, ranking e busca com IA
ficam no app por ora. Até o app chegar às lojas, nada no web é travado para empurrar o
app: o web só convida ("avise quando o app chegar"). No lançamento, reavaliar quais
recursos do web passam a ficar só no app.

## Product Purpose

Ligar o torcedor ao bar que passa o jogo dele. Para o torcedor, achar onde assistir e ir
com os amigos; para o bar, encher a casa em dia de jogo e provar esse público. Sucesso é
torcedor que vai de fato (visita verificada) e bar que paga plano porque vê o retorno.

## Positioning

Os dois lados juntos, o que vizinho nenhum faz honestamente:

- **A busca começa pelo jogo, não pelo bar.** "Onde passa Fla × Flu hoje perto de mim",
  com telão e som por jogo, quem vai e quais amigos. Mapa e Instagram mostram o bar; a
  Onside mostra o jogo no bar.
- **A visita é verificada.** Código do balcão (Elite) ou check-in "Estou aqui" a até
  150 m: só quem foi entra na nota, nas conquistas, no ranking e na conta do bar. O bar
  mede público real, não curtida.

## Operating Context

- Dia de jogo é o momento: o dia da casa vira às 6h de Brasília, "a noite" vai de 18h a
  2h. "Hoje" é sempre o dia de Brasília.
- Torcedor: Explorar (mapa + lista), busca, busca com IA, "Vou assistir aqui", código no
  balcão, pós-jogo ("Você foi?", "Voltaria?", estrelas), conquistas, amigos, ranking.
- Bar: Hoje, Jogos (grade por dia ou semana), Desempenho, Quem vai, Meu espaço (perfil,
  fotos, horário, oferta), Configurações, Plano e cobrança, Validar código.
- Planos Starter, Pro e Elite (Stripe, BRL); teste de 90 dias no Elite no cadastro, sem
  cartão. Recurso pago aparece como tal para quem não tem.
- Esportes além do futebol: NBA, NFL, UFC, F1, tênis, vôlei, NBB (catálogo de times e
  atletas).

## Capabilities and Constraints

- **Ver é aberto, agir pede conta.** Busca, mapa, jogo e bar abrem deslogado; a ação
  que grava (favorito, presença, avaliação, check-in, lembrete, amigo) leva ao login e
  volta para onde a pessoa estava.
- **Não existe reserva de mesa.** "Vou assistir aqui" marca presença; no Elite gera o
  código do balcão. Nunca chame de reserva.
- **O desenho manda.** Telas seguem os projetos do Claude Design: app
  `5185ab40-42b3-4469-a0a7-9e96448d9e24`, painel do bar `5f5ec999` ("Bar Web 3 Planos"),
  Houdini proposta 3 (https://claude.ai/artifact/YbJ76gkJaTKaqTtuRLQmNt). Leia o arquivo
  da tela antes de implementar; não invente layout que o projeto não tem.
- O que o design mostra e o servidor não tem aparece como "em breve", não some nem finge.
- Toda foto, descrição e comentário passa pela revisão da Onside antes de aparecer.
- Falha de rede tem regra única: tentar de novo com espera, botão que conta a fase,
  bloco que não carregou nunca some (`ErroBloco`/`ErrorState`).
- Texto de produto em português do Brasil, sem gênero presumido ("o Gabriel foi avisado"
  vira forma neutra).
- Mudança de tela: o dono vê print e alternativas antes do merge e decide desenho e texto.

## Brand Commitments

- Nome **Onside** (minúsculo no domínio `onside.sh`; app `sh.onside.app`).
- Marca "ON / SIDE"; tokens de tinta, papel, acid e vermelho (`bg-ink`, `text-paper`,
  `bg-acid`); fontes Anton (display) e Geist Mono, entre outras do design.
- Voz direta, de torcedor para torcedor, frases curtas, sem jargão de app ("Vou assistir
  aqui", "Quem vai", "Viram o jogo").

## Evidence on Hand

- Bares reais no ar e torcedores reais (o preview copia produção, com e-mails reais).
- **Sem receita ainda.** Não há bar pagante, depoimento, case nem métrica pública.
  Nenhuma tela, peça de marketing ou cópia pode inventar cliente, número, depoimento,
  avaliação ou resultado.
- Demo gravada para a YC em `~/dev/onside/films/onside-yc-demo`.

## Product Principles

1. O jogo vem primeiro: toda tela responde "qual jogo, onde, quando".
2. Só conta o que é verificado: visita, nota e público do bar saem do balcão ou do
   check-in, nunca de intenção.
3. Honesto com o que falta: "em breve" no lugar de fingir, nada de número inventado.
4. O bar precisa ver o retorno para pagar: cada recurso do painel liga a público real.
5. Privacidade de quem vai: amigo só é nomeado com permissão; estranho nunca.

## Accessibility & Inclusion

- Painel do bar em claro e escuro, pelo tema do sistema.
- App aguenta o "Texto maior" do iOS até 1,35× (1,2× em Anton); componentes não podem
  cortar rótulo nesses tamanhos.
