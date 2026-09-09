# Clássicos e benefício Elite

## Regra editorial

Clássico é uma classificação editorial de eventos, não uma inferência do nome
do campeonato. A migration 0030 cria `classic_rule_version` e `classic_rule`.
Cada versão é imutável; a versão de maior número é a ativa. A versão 1 contém
pares de times por slug e cada regra tem `reason`, que é devolvido pela API
como explicação (`because X`). Para alterar a lista, publique uma versão nova;
não edite a antiga.

As medições copiam `classic_rule_id`, versão e motivo no evento bruto. Assim,
uma alteração editorial futura não reescreve a classificação já medida.

## Contrato por superfície

| Superfície | Contrato | Exceção |
| --- | --- | --- |
| Busca por relevância | O backend ordena `Elite clássico → plano → qualidade Wilson → próximo jogo → distância → id`. Um Elite com próximo evento clássico fica no topo antes dos demais resultados. O cursor carrega todas as chaves e a versão 2 da ordem. | Nenhuma reordenação no cliente. |
| Busca por rating | O backend ordena nota pública/Wilson, depois plano, jogo, distância e id. | A ordenação pedida pelo torcedor tira o plano da frente; não há garantia Elite. |
| Busca por localização | O backend ordena distância (`<->`) e id. | É fallback sem contexto de evento; não há garantia Elite. |
| Mapa | Recebe a mesma sequência da busca por relevância e não a reordena. | A posição geográfica dos marcadores não representa ranking; fallback local segue distância. |
| Ticker da home | O backend coloca eventos clássicos Elite antes dos demais eventos Elite, com horário e id como desempate. | É um destaque editorial informativo, não promessa de ranking de busca. |
| Recomendações | Ranking orgânico/personalizado por intenção, esporte, distância, experiência e qualidade. | Plano comercial não entra no ranking; exposição passiva de clássico não vira intenção; não há garantia Elite. |

As chaves são do servidor para impedir que uma tela diferente do dashboard
crie uma promessa diferente. `classic` no próximo evento contém `reason` e
`ruleVersion`, permitindo explicar a classificação ao consumidor da API.

## Medição

`classic_exposure` é enviado quando um resultado clássico Elite é exibido na
lista de relevância; `classic_click` é enviado ao abrir esse resultado pelo
card ou mapa nessa mesma superfície.
Ambos usam o `sourceEventId`, passam pela deduplicação diária existente e são
aceitos somente quando o servidor confirma bar ativo, plano Elite e evento
classificado na versão ativa. O rollup diário guarda `classic_exposures` e
`classic_clicks`.

Somente o Elite recebe esses dois indicadores no analytics: exposições,
cliques e CTR. Starter e Pro recebem `null`, sem vazamento de métrica.
