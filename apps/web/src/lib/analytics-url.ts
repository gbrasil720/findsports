/*
 * O que nunca vai ao PostHog dentro de um endereço: o token do reset de senha
 * (`/reset-password?token=`), a sessão que o servidor devolve ao app
 * (`?cookie=`) e códigos (`?code=`). O SDK anota a URL da página em todo
 * evento (`$current_url`, `$referrer`, `$initial_current_url`…), então a
 * limpeza vale no `before_send` (`posthog.ts`) e na página vista
 * (`capturePageview`).
 */
const SENSIVEIS = ['token', 'cookie', 'code']

/** A URL sem os parâmetros sensíveis; o que não é URL volta sem a query. */
export function semDadosSensiveis(endereco: string): string {
  try {
    const url = new URL(endereco)
    for (const nome of SENSIVEIS) url.searchParams.delete(nome)
    return url.toString()
  } catch {
    return endereco.split('?')[0] ?? ''
  }
}

const URL_PROPS = [
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
  '$session_entry_url',
  '$session_entry_referrer',
  '$prev_pageview_url'
]

type Props = Record<string, unknown> | undefined

function limpar(props: Props) {
  if (!props) return
  for (const chave of URL_PROPS) {
    const valor = props[chave]
    if (typeof valor === 'string' && valor.includes('?'))
      props[chave] = semDadosSensiveis(valor)
  }
}

/** `before_send` do PostHog: limpa as URLs do evento e das pessoas. */
export function limparEvento<
  T extends { properties?: Props; $set?: Props; $set_once?: Props }
>(evento: T | null): T | null {
  if (!evento) return evento
  limpar(evento.properties)
  limpar(evento.$set)
  limpar(evento.$set_once)
  return evento
}
