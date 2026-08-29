/**
 * O mapa ainda é o mapa que está na tela?
 *
 * O SDK do Google Maps não tem `destroy()`. Quando o React desmonta o
 * componente — trocar de rota já basta — o `<div>` do mapa sai do documento,
 * mas a instância `google.maps.Map` continua viva nas nossas refs, e continua
 * sendo alvo dos efeitos que sincronizam pinos.
 *
 * O ponto exato onde isso quebra está no setter `map` do
 * `AdvancedMarkerElement`. Traduzindo o código minificado que a API serve hoje:
 *
 * ```js
 * set map(a) { this.setMap(a); this.pl && (a = _.on(this.pl)) && ... }
 * _.on = function (a) { a = a.getDiv(); var b = a.getRootNode(); ... }
 * ```
 *
 * Ou seja: **toda** atribuição `marker.map = map` chama `map.getDiv()` e usa o
 * retorno sem checar nada. Num mapa que já foi desfeito, `getDiv()` devolve
 * `undefined` e o SDK estoura
 * `Cannot read properties of undefined (reading 'getRootNode')`.
 *
 * O detalhe que transforma um pino quebrado numa página quebrada: essas
 * chamadas saem de dentro de um `useEffect`. Erro em efeito sobe pelo commit do
 * React até a fronteira de erro da rota, que troca o dashboard inteiro pelo
 * "Something went wrong!". Por isso a checagem vem antes de qualquer escrita:
 * mapa que não está mais no documento não recebe comando nenhum.
 *
 * `getDiv()` é chamado dentro de `try` porque ele mesmo é um acesso a estado
 * interno (`this.__gm.div`) — num mapa meio construído ele lança em vez de
 * devolver `undefined`.
 */
export function isMapaVivo(map: google.maps.Map | null | undefined): boolean {
  if (!map) return false
  let div: HTMLElement | null | undefined
  try {
    div = map.getDiv() as HTMLElement | null | undefined
  } catch {
    return false
  }
  return Boolean(div?.isConnected)
}
