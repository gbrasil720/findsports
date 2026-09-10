/**
 * Concordância de número em texto de tela.
 *
 * Os contadores do painel interno eram montados com interpolação direta —
 * `${liberados} liberados` — e produziam "1 liberados", "1 ativados",
 * "1 falhas". Um helper resolve isso num lugar só, e obriga quem escreve a
 * declarar as duas formas.
 *
 * Em português a forma singular vale para 0 ou 1 apenas em alguns casos
 * ("0 pessoas", não "0 pessoa"), então o corte é `=== 1`.
 */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/** `plural` com o número na frente, que é o formato usado nos contadores. */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${plural(count, one, many)}`
}
