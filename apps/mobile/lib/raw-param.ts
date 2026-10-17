/**
 * Um parâmetro lido do endereço cru. Não do roteador: ele decodifica `%2B` e
 * só depois troca `+` por espaço, e a sessão tem `+` (assinatura em base64),
 * que chegava corrompida e o servidor recusava.
 */
export function rawParam(url: string, name: string) {
  const query = url.split('?')[1]?.split('#')[0] ?? ''
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=')
    if (key === name) return decodeURIComponent(value.replace(/\+/g, ' '))
  }
  return undefined
}
