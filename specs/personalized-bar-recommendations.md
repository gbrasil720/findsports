# Sugestões personalizadas de bares

Status: aprovado na entrevista de produto em 2026-08-20.

## Objetivo

Exibir no perfil do torcedor três bares não favoritados com maior probabilidade
de gerar uma visita, sem perder a oportunidade de apresentar uma experiência
nova e plausível. O resultado deve ser explicável, estável durante o dia e
reagir imediatamente a uma nova ação relevante.

## Experiência do torcedor

A seção atual "Perto de você" da visão geral do perfil passa a ser "Sugestões
para você" e contém até três cards:

1. a recomendação de maior confiança;
2. uma recomendação que equilibra relevância e diversidade;
3. uma descoberta compatível com o perfil do torcedor.

Cada card mostra distância e um motivo verificável, sem expor score ou usar
linguagem de "IA":

- "Você demonstrou interesse neste bar";
- "Tem jogos de {esporte}, um dos seus esportes";
- "Experiência parecida com seus favoritos";
- "Bem avaliado por quem foi assistir";
- "Perto de você";
- "Uma experiência diferente para explorar".

Quando for necessário ultrapassar o raio configurado, o card também mostra
"Um pouco além do seu raio · {distância}". Esse aviso não substitui o motivo.

O card oferece "Não tenho interesse" (no app, "Passo"). A ação remove o bar
do trio, impede seu retorno por 30 dias (decisão do dono em 2026-10-21; antes
eram 60) e não penaliza bares semelhantes. Abrir o card registra a
origem da visita. Uma impressão, isoladamente, não aumenta afinidade.

## Elegibilidade

Um candidato precisa:

- ter `bar.isActive = true`, que no domínio atual significa assinatura
  comercialmente ativa (inclusive a carência já aplicada pelo billing);
- não estar nos favoritos do torcedor;
- não ter sido desfavoritado nos últimos 30 dias;
- não ter recebido "Não tenho interesse"/"Passo" nos últimos 30 dias;
- não ter recebido do torcedor uma avaliação "não voltaria" nos últimos 60
  dias;
- não estar sob a proteção temporária de qualidade descrita abaixo.

O nível Starter, Pro ou Elite não altera score ou posição. Falta de evento
futuro não torna o bar inelegível.

### Proteção de qualidade

Somente avaliações dos últimos 60 dias entram nessa proteção. Um bar fica fora
das recomendações enquanto tiver simultaneamente ao menos 10 avaliações
recentes e menos de 30% de respostas "voltaria". A condição é recalculada
diariamente; não muda `isActive`, não afeta a assinatura e não remove o bar da
busca normal ou de seu perfil público. O painel do bar deve comunicar o estado
e o critério sem identificar torcedores.

Bares sem amostra suficiente continuam elegíveis e recebem valor neutro no
eixo de qualidade.

## Janela e decadência temporal

Ações comportamentais usam uma janela móvel de 60 dias:

| Idade da ação | Multiplicador |
| --- | ---: |
| 0–7 dias | 1,00 |
| 8–21 dias | 0,70 |
| 22–45 dias | 0,40 |
| 46–60 dias | 0,15 |
| mais de 60 dias | 0 |

Preferências esportivas e raio vindos do onboarding são estado atual, não
eventos temporais, e portanto não expiram.

## Hierarquia dos sinais

Da maior para a menor força comportamental:

1. avaliação "voltaria";
2. WhatsApp, telefone ou abertura de rota;
3. visualização do perfil originada por uma chamada de jogo;
4. visualização direta do perfil.

Favoritos e avaliações positivas também formam a assinatura de experiência do
torcedor, mas o próprio favorito nunca é candidato. Desfavoritar é rejeição
moderada somente daquele bar por 30 dias, como "Não tenho interesse"/"Passo".
"Não voltaria" exclui somente aquele bar por 60 dias; uma avaliação negativa gera
apenas penalidade leve de similaridade, sem inferir rejeição a um esporte ou
bairro inteiro.

Ações repetidas têm retorno decrescente. Em cada eixo, o sinal mais forte vale
integralmente e repetições acrescentam parcelas menores até o teto do eixo.

## Score de relevância

O score base varia de 0 a 100:

| Eixo | Máximo | Conteúdo |
| --- | ---: | --- |
| Intenção direta | 30 | ações recentes sobre o próprio candidato |
| Afinidade esportiva | 20 | esportes declarados, esportes/times de ações recentes e jogos futuros correspondentes |
| Distância | 15 | queda gradual dentro do raio e até a expansão máxima |
| Similaridade de experiência | 18 | comodidades, faixa de telas e bairro secundário comparados ao histórico positivo |
| Qualidade | 17 | avaliação "voltaria" ajustada pela confiança da amostra |

A assinatura de experiência é construída somente com dados estruturados de
favoritos, avaliações positivas e ações de alta intenção. Comodidades pesam
mais que bairro. Nome, descrição livre e plano comercial não participam desta
versão.

A qualidade usa valor neutro quando a amostra não é suficiente. Popularidade
agregada serve apenas como desempate determinístico ou fallback, nunca como
substituto da afinidade individual.

## Seleção e diversidade

Após ordenar o score base:

1. o primeiro card é o maior score elegível;
2. o segundo maximiza 85% de relevância e 15% de diversidade;
3. o terceiro maximiza 65% de relevância e 35% de diversidade, somente entre
   candidatos com score base de pelo menos 70% do primeiro.

Diversidade considera bairro, esporte e comodidades. Se não houver candidato
que satisfaça o piso de relevância, usa-se o próximo maior score; nunca se
mostra uma opção claramente pior apenas para variar.

A busca começa no raio configurado pelo torcedor. Se não houver três
candidatos, expande gradualmente até no máximo 1,5 vezes o raio. Favoritos,
rejeições vigentes, bares sem assinatura ativa e bloqueios de qualidade não
são reintroduzidos para completar o trio. Se ainda assim houver menos de três
candidatos, a interface mostra somente os elegíveis, sem inventar resultados.

## Rodada do app: "Bares pra você" (WEB-425)

O app mostra as sugestões como um baralho, aberto pelo menu "Você" (design,
seção 08, rodadas 22 e 23). Decisões do dono em 2026-10-21:

- uma rodada de até **cinco** bares por dia, gravada em `recommendation_round`
  na primeira leitura do dia com localização; o limite vale no servidor. A
  rodada vira às **10:00 de Brasília** (antes disso ainda vale a de ontem) e
  fica a mesma o dia todo, mesmo com ações novas;
- posições 1 "Sua cara", 2 "Pra variar", 3 "Vale arriscar"; a 4 repete a
  regra da 2 e a 5 a da 3, com o mesmo piso de 70% da nota do primeiro. O
  perfil do web continua com três (`rankRecommendations(..., count = 3)`);
- "Curti" salva em Seus bares e entra como intenção forte (`high_intent`) nas
  próximas rodadas; "Passo" é o "Não tenho interesse" (30 dias); "Voltar"
  desfaz o último dos dois sem o resfriamento do desfavoritar;
- rodada curta ou vazia oferece completar até cinco com o dobro do raio, só
  naquele dia (o raio do perfil não muda); fora dele o card diz "Fora do seu
  raio";
- "Avisar" (bar sem jogo) inscreve bar + esporte ou bar + time; o jogo
  publicado depois que case vira aviso na tela de Avisos do app. "Lembrar"
  (jogo em outro dia) põe o jogo em Avisos no dia. Não há push;
- "Vou assistir" a partir do card manda o `recommendationRunId`, gravado como
  `attend` em `recommendation_event`.

O card e "Por que esse bar?" usam a nota arredondada ("Combina 86"), os
cinco eixos com os pontos e frases montadas com números reais (aberturas do
jogo na semana, o bar parecido e as visitas validadas, a nota pública só
quando a plataforma a mostra).

## Estabilidade e atualização

Sem ação nova, o trio é determinístico e estável durante o mesmo dia. A
decadência e a proteção de qualidade são recalculadas diariamente. Uma ação
relevante invalida o resultado e permite novo cálculo imediato. Empates usam
chaves determinísticas; não há aleatoriedade pura.

## Desempenho e escala

O ranking não pode agregar o catálogo inteiro a cada abertura do perfil. A
consulta deve primeiro produzir um conjunto pequeno de ids elegíveis usando
`ST_DWithin` e o índice espacial parcial de bares ativos. Esse conjunto é a
união deduplicada de:

- até 200 bares ativos mais próximos dentro de `1,5×` o raio;
- bares com intenção direta recente do torcedor que ainda estejam dentro do
  limite geográfico;
- até 100 bares ativos com jogo futuro correspondente às afinidades
  esportivas, também dentro do limite geográfico.

Somente depois dessa redução o servidor agrega ações, avaliações, eventos e
atributos de experiência. O enriquecimento deve ocorrer em lote, sem uma
consulta por bar. O score e o reranking em memória ficam limitados ao conjunto
deduplicado, nunca ao catálogo completo.

Novas tabelas precisam de índices que comecem pelas chaves reais de leitura:
torcedor + instante para comportamento/reset, torcedor + bar + tipo + instante
para rejeições e execução + instante para atribuição. Consultas de avaliações
recentes devem partir dos candidatos e da janela de 60 dias.

O trio diário pode ser reutilizado enquanto a versão de comportamento do
torcedor não mudar. Favoritar, desfavoritar, avaliar, abrir contato/rota,
rejeitar ou resetar incrementa/invalida essa versão; impressão não invalida.
Não se admite cache que mantenha sugestão obsoleta após uma dessas ações.

O endpoint deve respeitar o SLO já usado pelo projeto: p95 abaixo de 300 ms e
taxa de erro abaixo de 1% no harness representativo. A validação inclui plano
de execução sobre massa comparável à carga existente, prova de uso do índice
espacial, ausência de N+1 e comparação de latência do perfil antes/depois.
O caminho de fallback devolve menos sugestões ou estado recuperável; não faz
uma varredura global para completar três cards.

## Cold start

O onboarding já coleta esportes e raio. Antes de existir histórico
comportamental, o ranking usa esportes declarados, distância, jogos futuros,
qualidade neutra/observada e diversidade. Contas antigas ou incompletas usam
distância, qualidade e jogos futuros como fallback defensivo.

## Recomeçar sugestões

Em Configurações, "Recomeçar minhas sugestões" cria um marco de reset para o
algoritmo, limpa rejeições específicas de recomendação e invalida o trio
estabilizado. Não reinicia onboarding e não apaga esportes, raio, favoritos,
avaliações, conta ou métricas comerciais. O novo trio usa os dados estruturais
atuais e ignora ações comportamentais anteriores ao marco.

## Métricas de sucesso

A métrica primária é uma recomendação que gera favorito, rota, telefone ou
WhatsApp em até sete dias. Uma avaliação "voltaria" vinculada a um jogo do bar
é confirmação tardia.

Também serão medidos:

- abertura do perfil a partir da recomendação;
- impressões (sem efeito no score);
- taxa de "Não tenho interesse";
- cobertura de três sugestões;
- frequência de expansão de raio;
- diversidade entre os três resultados.

Cada execução recebe um identificador opaco. Eventos derivados guardam esse
identificador para atribuição, sem expor o histórico individual ao bar.

Guardrails: bares novos não recebem score zero por falta de avaliações; plano
não afeta afinidade; o bar não recebe identidade ou histórico do torcedor; e o
algoritmo não usa filtragem colaborativa nesta versão. Latência, quantidade de
candidatos avaliados e falhas do endpoint também são guardrails operacionais.

## Fora do escopo da V1

- filtragem colaborativa entre usuários;
- posição patrocinada;
- interpretação de nome ou descrição por embeddings/LLM;
- inferência de visita física;
- alteração do onboarding;
- mudança na aba de favoritos;
- alteração dos critérios de assinatura que mantêm `isActive`.
