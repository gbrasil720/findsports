/**
 * Sem acento, minúsculas, espaços simples: é como a busca de times compara
 * (`team.search_text` e o termo digitado). Arquivo à parte porque a API, que
 * roda no Worker, importa só isto, e não a leitura de arquivos do catálogo.
 */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
