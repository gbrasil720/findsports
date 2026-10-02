/** Escapa `\`, `%` e `_` para LIKE/ILIKE com `ESCAPE '\'`. */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}
