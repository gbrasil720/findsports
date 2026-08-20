# ADR 0001: Recomendações híbridas, explicáveis e sem influência de plano

- Status: aceita
- Data: 2026-08-20

## Contexto

O perfil do torcedor mostra hoje até três bares próximos que não estão nos
favoritos. A plataforma já possui preferências esportivas, raio, favoritos,
avaliações e eventos comerciais autenticados por torcedor e bar. É necessário
transformar essa superfície em recomendações personalizadas sem depender de
massa crítica entre usuários nem permitir que o nível da assinatura distorça
afinidade.

No modelo existente, `bar.isActive` é uma projeção da elegibilidade comercial
por assinatura: o billing ativa o bar e o cancelamento o desativa. Isso não
representa horário, recência de atividade ou existência de jogos.

## Decisão

Adotar na V1 um ranking híbrido baseado no próprio torcedor e no conteúdo
estruturado dos bares. O score combina intenção direta, afinidade esportiva,
distância, similaridade de experiência e qualidade. Não haverá filtragem
colaborativa, embeddings ou aleatoriedade pura.

O ranking será calculado no servidor e retornará três resultados ordenados,
cada um com código de motivo, distância, indicação de expansão do raio e um
identificador opaco de execução. O servidor é a única fonte de verdade para
elegibilidade, decadência, score, diversidade, rejeições e atribuição.

Somente `isActive = true` é elegível, mas Starter/Pro/Elite não pontuam. Uma
posição comercial futura deverá ser separada e identificada como publicidade.

Aplicar redução de candidatos antes do score: união deduplicada de um pool
espacial limitado, candidatos com intenção direta e candidatos com jogos que
casem com afinidades, todos dentro de `1,5×` o raio. Agregar os sinais em lote
somente para esses ids e executar o reranking sobre um conjunto limitado em
memória. É vedado buscar sinais em N+1 ou agregar o catálogo inteiro.

Reutilizar o trio diário por versão de comportamento do torcedor. Ações que
alteram afinidade invalidam a versão; impressões não. O desenho precisa manter
p95 abaixo de 300 ms e erros abaixo de 1% no harness representativo já adotado
pelo projeto.

Reutilizar os eventos comerciais existentes como sinais de leitura. Adicionar
eventos próprios de recomendação para impressão, abertura, rejeição e reset,
sem alterar a semântica ou os direitos de visualização da análise comercial do
bar. Registrar desfavoritar antes de remover a relação, pois o estado atual da
tabela de favoritos não preserva histórico.

Persistir um marco de reset da personalização. Consultas ignoram sinais
comportamentais anteriores a esse marco, mas preservam preferências, raio,
favoritos, avaliações e métricas comerciais.

## Consequências

- O algoritmo funciona no cold start com dados já coletados no onboarding.
- Resultados são auditáveis e podem explicar o motivo dominante.
- Novos bares não são punidos por ausência de avaliações.
- Será necessária uma migração compatível para histórico de interação,
  execuções/rejeições e reset.
- O cálculo precisa limitar candidatos espacialmente antes de agregar sinais,
  evitando varrer o catálogo e o histórico completo por request.
- O pool espacial terá teto de 200, o pool de jogos correspondentes terá teto
  de 100 e candidatos com intenção direta elegível serão unidos explicitamente
  para não desaparecerem em regiões densas.
- Índices, plano de execução e teste de carga fazem parte da aceitação, não de
  uma otimização futura.
- A estabilidade diária requer chave determinística ou snapshot/cache
  invalidável por versão de comportamento.
- Eventos de analytics não podem, sozinhos, alterar afinidade: impressão é
  observação, não preferência.

## Alternativas rejeitadas

- Ordenar apenas por proximidade: não usa comportamento nem experiência.
- Ordenar por plano: transforma recomendação em publicidade não identificada.
- Filtragem colaborativa: massa e governança insuficientes para a V1.
- Exigir jogo futuro: elimina bons bares em períodos sem agenda cadastrada.
- Tratar `isActive` como atividade operacional: contradiz o contrato atual de
  billing.
- Recomeçar onboarding no reset: apaga preferências válidas e cria atrito sem
  relação com o objetivo.
