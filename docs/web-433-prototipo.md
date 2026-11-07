# WEB-433 — protótipo dos jogos da semana com onde passa

Medição de 07/11/2026 do "Primeiro passo: protótipo" do WEB-433 (decisão do dono em
28/10: começar pelo protótipo). Fora do app, sem banco: busca → leitura da página →
extração com IA, e conferência à mão contra a fonte oficial.

Script: `packages/api/scripts/weekly-games-prototype/run.ts`. Saída de cada execução
em `resultados/<provedor>-<início>.json` (relatório e jogos) e `.md` (tabela da semana).

```bash
bun packages/api/scripts/weekly-games-prototype/run.ts exa 2026-11-07
bun packages/api/scripts/weekly-games-prototype/run.ts linkup 2026-11-14 "Brasileirão Série A,Brasileirão Série B"
```

## Método

1. **Busca:** Web Search da Cloudflare (`POST /accounts/<id>/ai/websearch/`) pelo Gateway
   `onside-preview`, com o token do login do `wrangler` (o mesmo caminho de
   `lib/ai/binding.ts` em desenvolvimento). Uma busca por campeonato:
   `"<campeonato> jogos desta semana onde assistir <dd/mm> a <dd/mm> 2026"`, 8 resultados.
2. **Leitura:** Browser Rendering `/markdown` nos 2 primeiros resultados que podem ser
   lidos. PDF é pulado; o `robots.txt` é conferido antes (grupo `User-agent: *`, curingas,
   regra mais longa, e o `Content-Signal: ai-input=no` da Cloudflare). Página cortada em
   40 mil caracteres.
3. **Extração:** GPT-6 Luna (`openai/gpt-6-luna`, US$ 0,10 / 0,50 por milhão), raciocínio
   `none`, `response_format: json_object`, saída `{jogo, campeonato, data, hora, canais}`;
   o script acrescenta a `fonte`. O prompt manda deixar o canal vazio quando a página não
   diz e recusar jogo sem data escrita.
4. **Jogo sem canal:** uma busca `"<jogo> <dd/mm> onde assistir ao vivo"`, leitura do
   primeiro resultado legível, mesma extração. Até 12 por execução.
5. **Junção:** o mesmo jogo em duas fontes vira uma linha (chave: data + começo do nome dos
   times sem acento); vale o canal da primeira fonte que trouxe canal, e a outra fica em
   `outras`.

Teto: cada chamada confere antes que o pior caso dela cabe em US$ 1,00 somando o que já
foi gasto em todas as execuções (`resultados/ledger.json`). Nada é gravado em banco; o
script não importa `env` nem `db`.

**Semana pedida (07 a 13/11) não tem Brasileirão Série A nem Libertadores.** A 34ª
rodada da Série A foi de 04 a 05/11 e a 35ª começa em 14/11 (CBF); a Libertadores teve as
semifinais em outubro e a final é em 28/11. Por isso rodei duas janelas:

- **A, 07 a 13/11:** Série A, Libertadores, Copa do Brasil, Sul-Americana, Série B e
  Premier League (6 campeonatos).
- **B, 14 a 20/11:** Série A, Série B e amistosos da Seleção (3 campeonatos), para medir
  uma rodada inteira da Série A.

As duas buscas da Série A e da Libertadores na janela A responderam certo: zero jogos.

## Custo real medido

Execuções "limpas" (sem cache), Exa:

| Janela | Buscas | Páginas | Chamadas Luna | Tokens (entrada / saída) | Busca | Luna | Total | Tempo |
| -- | -- | -- | -- | -- | -- | -- | -- | -- |
| A, 6 campeonatos | 15 (6 + 9 sem canal) | 21 | 21 | 179.268 / 1.888 | US$ 0,105 | US$ 0,019 | **US$ 0,124** | 5 min 39 s |
| B, 3 campeonatos | 14 (3 + 11 sem canal) | 16 | 17 | 99.026 / 2.035 | US$ 0,098 | US$ 0,011 | **US$ 0,109** | 4 min 39 s |

Mesmas buscas com a Linkup (primeira execução, que pagou as buscas):

| Janela | Buscas | Páginas | Chamadas Luna | Tokens (entrada / saída) | Busca | Luna | Total | Tempo |
| -- | -- | -- | -- | -- | -- | -- | -- | -- |
| A | 11 | 16 | 17 | 120.187 / 904 | US$ 0,055 | US$ 0,012 | **US$ 0,068** | 3 min 55 s |
| B | 15 | 15 | 18 | 98.932 / 2.058 | US$ 0,075 | US$ 0,011 | **US$ 0,086** | 4 min 20 s |

Os arquivos `linkup-*.json` são de uma segunda execução sobre as mesmas buscas e páginas
guardadas (por isso mostram 0 ou 1 busca), depois de corrigir a junção: a primeira
misturava a hora de uma fonte com o canal de outra.

- **A busca é 85 a 90% do custo.** O Luna saiu em média 8,5 mil tokens de entrada e
  ~100 de saída por página, US$ 0,0009 por leitura (o ticket estimou 8 mil e US$ 0,0012).
- **Browser Rendering:** 8 s por página em média (172 s para 21 páginas). Uma semana com
  15 campeonatos dá ~40 páginas e ~6 min; um mês, ~25 min, dentro das 10 h do Workers Paid.
- **O que mais pesa é o "sem canal":** cada jogo sem canal é uma busca de US$ 0,007, e
  rodada que a TV ainda não escolheu (Série B 38ª) gera um por jogo.
- Gasto total do protótipo, com os testes de ajuste: **US$ 0,69** (de US$ 1,00).

## Conferência à mão

Fonte oficial usada, acessada em 07/11/2026:

- **Série A, 35ª rodada:** tabela detalhada da CBF de 29/10/2026
  ([PDF](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/Tabela_Detalhada_Brasileiro_Serie_A_2026_35_e_36_rodada_e41122dd5b.pdf)),
  com a coluna de transmissão (1 Globo, 2 Record, 3 SporTV, 4 Amazon, 5 YouTube/CazéTV,
  6 GE TV, 7 Premiere).
- **Série B, 37ª e 38ª:** tabela detalhada da CBF de 07/10/2026
  ([PDF](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/Tabela_Detalhada_35_a_38_rodada_Brasileiro_Serie_B_2026_1_f9990e396e.pdf))
  para canais, e a [notícia da CBF de 06/11](https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro/campeonato-brasileiro-serie-b/37-rodada-da-serie-b-continua-neste-fim-de-semana)
  para data e hora (dois jogos mudaram de dia depois da tabela).
- **Copa do Brasil, voltas da semifinal:** data e hora pela
  [CBF](https://www.cbf.com.br/futebol-brasileiro/noticias/copa-brasil-masculino/a/gremio-e-palmeiras-abrem-vantagem-pela-semifinal-da-copa-do-brasil);
  canal pela Máquina do Esporte ([Atlético-MG x Grêmio](https://maquinadoesporte.com.br/?p=244416),
  [Vasco x Palmeiras](https://maquinadoesporte.com.br/?p=244420)), que não é oficial.
- **Premier League:** sem fonte oficial legível (premierleague.com monta com JavaScript).
  Hora pela tabela da [fifplay](https://www.fifplay.com/premier-league-2026-2027-matchday-10/)
  (horário do Reino Unido, 3 h à frente de Brasília em novembro) e pela página da Goal
  lida pelo script. Canal não conferido jogo a jogo: ESPN e Disney+ têm a temporada inteira.

### Jogo a jogo (Exa)

| Jogo | Protótipo | Oficial | Data | Hora | Canal |
| -- | -- | -- | -- | -- | -- |
| Mirassol x Atlético-MG (A) | 14/11 18:30 · Prime Video | 14/11 18:30 · Amazon | ✓ | ✓ | ✓ |
| Coritiba x Santos (A) | 18/11 19:30 · Premiere, Record, CazéTV | igual | ✓ | ✓ | ✓ |
| Remo x Chapecoense (A) | 18/11 20:00 · Premiere | igual | ✓ | ✓ | ✓ |
| Flamengo x Athletico-PR (A) | 18/11 20:30 · SporTV, Premiere | igual | ✓ | ✓ | ✓ |
| Cruzeiro x Palmeiras (A) | 18/11 20:30 · Premiere | igual | ✓ | ✓ | ✓ |
| Corinthians x Botafogo (A) | 18/11 21:30 · Premiere | igual | ✓ | ✓ | ✓ |
| Grêmio x Bahia (A) | 18/11 21:30 · Premiere | igual | ✓ | ✓ | ✓ |
| Vasco x Internacional (A) | 19/11 19:30 · SporTV, Premiere | igual | ✓ | ✓ | ✓ |
| Vitória x Bragantino (A) | 19/11 19:30 · Premiere | 19/11 19:30 · coluna vazia | ✓ | ✓ | não conferível |
| São Paulo x Fluminense (A) | 19/11 21:30 · Globo, Premiere, GE TV | igual | ✓ | ✓ | ✓ |
| Atlético-MG x Grêmio (CB) | 07/11 18:00 · SporTV, Prime Video, Premiere | igual | ✓ | ✓ | ✓ |
| Vasco x Palmeiras (CB) | 08/11 17:00 · Globo, SporTV, Prime Video, Premiere | + GE TV | ✓ | ✓ | incompleto |
| Avaí x São Bernardo (B) | 07/11 16:00 · Disney+ | ESPN/Disney+ | ✓ | ✓ | ✓ |
| Novorizontino x Fortaleza (B) | 07/11 16:10 · RedeTV!, GOAT, ESPN4 | RedeTV, ESPN/Disney+, GOAT | ✓ | ✓ | ✓ |
| Cuiabá x Juventude (B) | 07/11 20:00 · Disney+ | 07/11 20:00 · ESPN/Disney+ | ✓ | ✓ | ✓ |
| Vila Nova x Criciúma (B) | 07/11 20:00 · Disney+ | 07/11 20:00 · ESPN/Disney+ | ✓ | ✓ | ✓ |
| Náutico x CRB (B) | 07/11 21:30 · GE TV, Premiere | SporTV, Premiere, GE TV | ✓ | ✓ | incompleto |
| Athletic x Atlético-GO (B) | 08/11 16:00 · ESPN | ESPN/Disney+ | ✓ | ✓ | ✓ |
| Ceará x América-MG (B) | 08/11 19:15 · XSports, SportyNet, Disney+ | ESPN/Disney+, SportyNet, XSports | ✓ | ✓ | ✓ |
| Goiás x Ponte Preta (B) | 08/11 19:15 · Disney+ | ESPN/Disney+ | ✓ | ✓ | ✓ |
| Londrina x Náutico (B) | **11/11** 19:00 · Disney+ | 14/11 16:30 (38ª) | ✗ | ✗ | — |
| São Bernardo x Athletic (B) | 14/11 16:30 · GE, "TV aberta", Premiere | Premiere, GE TV | ✓ | ✓ | ✓ (com ruído) |
| Japão x Brasil (amistoso) | 14/11 07:15 · sem canal | 14/11 07:15 · canal não anunciado | ✓ | ✓ | ✓ (vazio certo) |

Premier League, 10 jogos de 07 e 08/11: data 10 de 10; hora 9 de 10 (Fulham x Newcastle
saiu 10:00, a página dizia 12:00).

Série B, 38ª rodada (14/11, os 10 às 16:30): data e hora 10 de 10. Canal: a CBF ainda não
definiu nove deles. O protótipo deixou 4 sem canal (certo) e deu canal a 5 a partir de
páginas que listam todas as emissoras da competição (terfaro, futponte), o que não é
transmissão confirmada.

### Acerto

Só o que a fonte oficial permite conferir (23 jogos da tabela acima):

| Campo | Acerto |
| -- | -- |
| Data | 22 de 23 (96%) |
| Hora | 22 de 23 (96%); com a Premier, 31 de 33 (94%) |
| Canal sem erro (todo canal citado é de fato transmissor, ou vazio quando não há) | 21 de 21 conferíveis (100%) |
| Canal completo (todos os transmissores oficiais) | 19 de 21 (90%) |

**Linkup, mesmas janelas:**

- Janela A: achou 8 jogos (a Exa achou 20). Ficaram de fora Atlético-MG x Grêmio, 7 dos 9
  jogos da Série B e metade da Premier. Dos 8: Novorizontino x Fortaleza e Náutico x CRB
  certos e completos (melhor que a Exa no Náutico); Palmeiras x Vasco com mando invertido e
  sem GE TV; os 5 da Premier com hora errada (09:00 e 11:30, horário de Nova York, de uma
  página da Goal americana).
- Janela B: Série A igual à da Exa (mesma página, guiadejogos), mais 3 linhas repetidas com a
  hora em UTC (flashscore: Corinthians x Botafogo e Grêmio x Bahia em "19/11 00:30"). Série B
  38ª: só São Bernardo x Athletic com canal, os outros 9 vazios, o que está certo: não pegou
  as listas genéricas da competição.

## Erros típicos

1. **Canal incompleto, não errado.** Nos dois casos (Vasco x Palmeiras sem GE TV, Náutico x
   CRB sem SporTV) a segunda fonte lida tinha a lista completa e ficou em `outras`. Juntar os
   canais de duas fontes que concordam no jogo resolveria os dois.
2. **Canal "da competição" antes da escolha da TV.** Para a 38ª da Série B, sites de
   agregação põem todas as emissoras do campeonato em cada jogo. Para o modelo isso é canal
   escrito na página. É o caso perigoso (bar no canal errado): precisa de regra (lista igual
   para todos os jogos da rodada = não confirmado) ou da fonte oficial.
3. **Data errada da fonte.** Londrina x Náutico em 11/11 veio de `ondeassistir.net.br`; o
   jogo é em 14/11. O mesmo jogo apareceu certo na janela B, de outra fonte.
4. **Hora mal lida pelo modelo.** Fulham x Newcastle: a página dizia 12:00, saiu 10:00. A
   mesma página pode dar hora diferente entre execuções (ver o item 6).
5. **Jogo antigo com data nova.** Antes de o prompt exigir data escrita, um vídeo do YouTube
   virou "Fluminense x Independiente Rivadavia, 08/11" (jogo de agosto). Depois da regra não
   repetiu.
6. **Fuso horário da página.** Página que monta a hora com JavaScript mostra a hora no fuso
   do navegador do Browser Rendering ou do país do site: flashscore saiu em UTC (+3 h), a Goal
   americana no horário de Nova York (−2 h), a tabela da ESPN em UTC. O modelo copia ou
   "converte" sem saber o fuso. Na execução medida da Exa, a tabela da ESPN (14:00, UTC)
   virou 11:00, certo; numa execução de ajuste, a mesma tabela virou 14:00. Não dá para
   contar com a conversão.
7. **Robots e PDF.** 1 página pulada pelo `robots.txt` por execução e o PDF da CBF, que é a
   melhor fonte da Série A e da Série B, não é lido (o Browser Rendering devolve HTML).

## Recomendações para as 4 decisões em aberto

1. **Rodada de quinta: sim, mas só para o que estava sem canal.** A Série B 38ª mostrou o
   motivo: 9 de 10 jogos sem canal definido a uma semana. Custo: ~10 buscas, ~US$ 0,07 por
   quinta, ~US$ 0,30/mês, como o ticket estimou.
2. **Provedor:** **Exa.** Na mesma busca a Linkup achou 40% dos jogos da janela A e trouxe páginas em
   outro fuso (Goal americana, flashscore em UTC); a Exa trouxe páginas brasileiras com
   "horário de Brasília". A diferença medida é ~US$ 0,02 a 0,05 por execução (~US$ 0,15 a
   0,30/mês). Ponto a favor da Linkup: deixou vazio o canal que a TV ainda não escolheu.
3. **Teto mensal: US$ 5 continua bom.** Medido: ~US$ 0,11 a 0,12 por execução com 3 a 6
   campeonatos e o "sem canal". Com 15 campeonatos, ~25 buscas e ~40 páginas por segunda
   (~US$ 0,21) mais a quinta (~US$ 0,07): ~US$ 1,20/mês. US$ 5 cobre 4× isso.
4. **Jogos por bar: até 10.** O protótipo não muda isso (não mede o bar). O que ele mostra é
   que a lista por semana é grande (43 jogos em 2 janelas com só 3 a 6 campeonatos), então
   o corte por histórico do bar é necessário, e 10 cabem numa tela.

## O que falta para produção

- **Canal com fonte e "não confirmado":** guardar todas as fontes de cada jogo; juntar canais
  quando duas concordam; marcar como não confirmado quando a lista é a mesma para a rodada
  inteira; o dono confirma antes de cadastrar (como o ticket já prevê).
- **Fonte oficial primeiro onde existir:** para Série A e Série B, o PDF da tabela detalhada
  da CBF tem dia, hora e canal por coluna; ler PDF (o Browser Rendering não lê) daria o
  Brasileirão sem busca. A busca fica para o que não tem tabela oficial legível.
- **Calendário sem busca:** football-data.org para as ligas europeias e a Série A, se a
  licença permitir (ver abaixo). Jolpica para a F1 **não** serve sem acordo (licença
  não comercial, abaixo).
- **Teto e registro:** feature `weekly_games` no `ai_run` e teto próprio no `app_config`,
  como o ticket descreve; o protótipo já para antes de passar do teto.
- **Hora:** aceitar só hora que a página diz ser de Brasília (ou de site brasileiro com o
  jogo em texto), conferir que a hora extraída aparece no texto, e descartar a fonte quando
  duas discordam por um número inteiro de horas (sinal de fuso). `temperature: 0`: a mesma
  página deu horas diferentes em execuções diferentes.
- **Web Search em beta aberto:** preço pode mudar.

## Licença do football-data.org

Acessado em 07/11/2026.

- `/terms` continua 404. Os termos estão no formulário de cadastro,
  <https://www.football-data.org/client/register> ("General Terms and Conditions",
  "Last updated: June 1, 2018"), de Freitag Web Tec UG, lei da Holanda.
- Não há cláusula sobre uso comercial, nem permitindo nem proibindo. O texto fala de app em
  geral: "The API Key applies to a single Application, in its web and/or mobile form" (2.3).
- Exige atribuição: "Football data provided by the Football-Data.org API" (7.1).
- Ao cancelar, a Onside não pode mais mostrar o que veio de lá: "the Customer is not
  permitted to reference the football data (incl. match fixtures, results, league tables
  ...) obtained through the Football-Data API" (9.1). Escudos e fotos não são licenciados
  (9.2).
- A página de preços diz só "Free Plan is Free Forever." e "Questions? Drop me a line to
  daniel@football-data.org".
- Nenhuma fonte de terceiros confiável trata do assunto.

**Conclusão: não confirmado.** Os termos não proíbem uso num produto pago, mas também não o
permitem por escrito. Só confirma perguntando. Texto pronto (o dono manda, de
`daniel@football-data.org`, com cópia para `info@football-data.org`):

> Hi Daniel, we run Onside (onside.sh), a Brazilian app that helps football fans find bars
> showing a match. Bars pay us a monthly subscription. We would like to use the free tier
> (Brasileirão Série A and the European leagues) to suggest to each bar the fixtures of the
> week, showing date, time and teams inside our paid bar dashboard, with your attribution
> in the footer. Is that allowed on the free tier, or does it need a paid plan or a
> separate license? One API key, one application (web and mobile). Thanks!

## Licença da Jolpica

Acessado em 07/11/2026: `TERMS.md` do repositório,
<https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md> ("Last updated: August 27, 2025").

- "The API is freely available for **non-commercial use**."
- "The data is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  International (CC BY-NC-SA 4.0)."
- "For commercial usage, please contact us via admin@jolpi.ca"

**Conclusão: proibido sem acordo.** Uso comercial precisa de autorização deles. Isso vale
também para o que já existe: o catálogo de times (`catalog:propose`, WEB-381) usa a
Jolpica para a grade da F1.
