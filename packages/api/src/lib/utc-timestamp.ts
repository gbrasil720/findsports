/**
 * `timestamp` sem fuso lido por SQL cru (WEB-250).
 *
 * O `db.execute` do Drizzle devolve a coluna como o texto que o Postgres
 * mandou — `2026-10-08 19:55:00` —, e só o mapeador de coluna do ORM
 * acrescenta o `+0000`. Entregue assim ao navegador, o `new Date()` de lá lê
 * a string como horário local, e o jogo das 16:55 aparece às 19:55 em
 * Brasília. No servidor o erro é o mesmo, do tamanho do fuso do processo.
 *
 * Toda consulta crua que lê `timestamp` passa o valor por aqui. A conversão
 * é a mesma do ORM, para os dois caminhos concordarem.
 */
const TEM_FUSO = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/

export function utcIso(value: string | Date): string {
  if (typeof value !== 'string') return value.toISOString()
  // `timestamptz` já vem com o deslocamento; acrescentar outro invalida a data.
  return new Date(TEM_FUSO.test(value) ? value : `${value}+0000`).toISOString()
}
