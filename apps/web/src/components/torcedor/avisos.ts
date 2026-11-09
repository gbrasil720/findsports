/*
 * Cada rota monta a sua casca do torcedor: o aviso dado antes de trocar de
 * tela se perderia com a casca de antes. Ele espera aqui e entra na fila da
 * casca que montar na tela seguinte (`TorcedorShell`). Só o cliente grava
 * (num clique ou numa ação), então não vaza entre pedidos do servidor. Fora
 * da casca (a página do bar), também é o jeito de o aviso chegar a ela.
 */
let pendentes: string[] = []

/**
 * O aviso para a tela seguinte. Só para a troca de rota: na mesma rota a
 * casca não remonta, e o aviso é o `avisar` dela.
 */
export function avisarNaProxima(texto: string) {
  pendentes = [...pendentes, texto]
}

/** Os avisos que esperam a casca nova; `limpar` depois de montada. */
export function avisosPendentes(): string[] {
  return pendentes
}

export function limparAvisosPendentes() {
  pendentes = []
}
