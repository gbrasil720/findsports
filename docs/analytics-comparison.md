# Comparação de analytics por jogo

## Contrato por plano

- `starter`: `previous_period`; compara a janela atual com a janela anterior.
- `pro`: `cross_game`; compara dois ou mais jogos selecionados, ou um jogo com
  a média dos demais jogos do mesmo bar.
- `elite`: `advanced`; entrega o mesmo alvo do Pro, além dos benchmarks e
  anomalias calculados pelo servidor.

O servidor resolve o bar pela sessão e o plano pela assinatura. O alvo só é
aceito para `cross_game` ou `advanced`; um Starter recebe `FORBIDDEN` ao tentar
enviar um alvo entre jogos. IDs de jogos são filtrados novamente por `bar_id`,
portanto um ID de outro bar nunca vira dado de resposta.

## Métricas e normalização

As métricas comparáveis são visitantes únicos, visualizações de perfil, rota,
telefone e WhatsApp. Cada canal segue o entitlement do plano; o cliente não
decide quais colunas pode exibir.

O valor bruto continua disponível para volume. A comparação também retorna o
valor por hora da janela efetiva do jogo: `ends_at - starts_at`, ou três horas
quando o jogo não tem término informado, mesma janela usada no perfil público.
Janelas menores que 15 minutos são tratadas como 15 minutos para evitar uma
taxa artificialmente infinita. A taxa de conversão é
`ações de alta intenção visíveis / visitantes únicos * 100`.

Na opção jogo contra bar, a média é aritmética por jogo e exclui o próprio jogo
alvo. Isso evita que o alvo altere o seu benchmark. O ranking de jogos usa a
taxa de conversão; empates usam o início mais recente e, por fim, o ID do jogo
para manter a ordem determinística.

## Estados sem dados

- comparação entre jogos com menos de dois jogos com dados: `empty` e
  `not_enough_games`;
- jogo alvo sem métrica elegível: `empty` e `no_data`;
- jogo contra bar sem outro jogo com dados: `empty` e `no_baseline`.

Linhas de jogos sem eventos continuam aparecendo na grade, mas não são usadas
para fabricar uma comparação.

## Elite: benchmark e insights

Os benchmarks usam valores por hora da janela efetiva. O benchmark histórico
usa os jogos do bar nos 84 dias anteriores ao início da
janela consultada. Para cada métrica elegível, a resposta traz a média da
janela atual, a média histórica e a variação calculada a partir desses números.
Também há benchmarks por dia da semana, comparando cada jogo atual com jogos
históricos do mesmo dia. Jogos sem nenhuma métrica elegível ficam fora das
médias; a seleção atual define os jogos comparados.

Uma anomalia só é emitida quando existe histórico do mesmo dia e a variação
absoluta é de pelo menos 30%. Cada insight inclui jogo, métrica, valor atual,
baseline e percentual; não há texto genérico sem número rastreável.

Após a retenção de eventos brutos, a atribuição histórica por jogo pode ficar
incompleta: os rollups preservam agregados diários, mas não a dimensão do jogo.
