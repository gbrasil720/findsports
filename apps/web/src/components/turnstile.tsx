import { useEffect, useRef, useState } from 'react'

import { env } from '@/lib/env'

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      appearance: 'interaction-only'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    }
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let script: Promise<TurnstileApi> | undefined

function loadTurnstile(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    el.async = true
    // Falhou, esquece o cache: o próximo `reset` tenta carregar de novo.
    const fail = () => {
      script = undefined
      el.remove()
      reject(new Error('Turnstile indisponível'))
    }
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : fail())
    el.onerror = fail
    document.head.appendChild(el)
  })
  return script
}

function TurnstileWidget({ onToken }: { onToken: (token?: string) => void }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const siteKey = env.VITE_TURNSTILE_SITE_KEY
    if (!siteKey) return
    let widgetId: string | undefined
    let unmounted = false
    // Sem o script (bloqueador, rede) o formulário segue; o servidor recusa
    // sem token e a mensagem diz o que fazer.
    loadTurnstile()
      .then((turnstile) => {
        if (unmounted || !container.current) return
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          // Invisível para quem passa direto; aparece só se houver desafio.
          appearance: 'interaction-only',
          callback: onToken,
          'expired-callback': () => onToken(undefined),
          'error-callback': () => onToken(undefined)
        })
      })
      .catch(() => {})
    return () => {
      unmounted = true
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [onToken])

  return env.VITE_TURNSTILE_SITE_KEY ? <div ref={container} /> : null
}

/**
 * Guarda o token e deixa o envio esperar por ele (WEB-254). Sem token até o
 * teto, resolve vazio e o servidor decide — a mensagem dele diz o que fazer.
 */
export function createTokenGate(timeoutMs = 10_000) {
  let token: string | undefined
  const waiting: ((token?: string) => void)[] = []
  return {
    set(next?: string) {
      token = next
      if (next) for (const resolve of waiting.splice(0)) resolve(next)
    },
    wait() {
      if (token) return Promise.resolve<string | undefined>(token)
      return new Promise<string | undefined>((resolve) => {
        const waiter = (next?: string) => {
          clearTimeout(timer)
          resolve(next)
        }
        const timer = setTimeout(() => {
          // Quem desistiu sai da fila: sem isso cada envio sem token deixava
          // um callback preso até o formulário desmontar.
          waiting.splice(waiting.indexOf(waiter), 1)
          resolve(token)
        }, timeoutMs)
        waiting.push(waiter)
      })
    }
  }
}

/**
 * Cloudflare Turnstile para formulário público. `widget` vai no fim do
 * formulário: mesmo invisível ele é um item do flex, e no meio somaria um
 * `gap` a mais. No envio, `fetchOptions` leva o token ao plugin `captcha` do
 * better-auth (header `x-captcha-response`); no tRPC ele vai como
 * `turnstileToken`, lido de `waitForToken()`. O token vale uma vez só: chame
 * `reset` depois de cada envio, deu certo ou não.
 *
 * WEB-254: o token chega alguns instantes depois da página. Quem enviava antes
 * disso (senha preenchida pelo navegador + Enter) mandava o header vazio e
 * levava 400 na primeira tentativa. Por isso o envio espera o token.
 *
 * Sem `VITE_TURNSTILE_SITE_KEY` não renderiza nada e o token fica vazio — o
 * servidor só o exige quando tem `TURNSTILE_SECRET_KEY`.
 */
export function useTurnstile() {
  const [generation, setGeneration] = useState(0)
  const [gate] = useState(createTokenGate)
  const waitForToken = () =>
    env.VITE_TURNSTILE_SITE_KEY ? gate.wait() : Promise.resolve(undefined)

  return {
    waitForToken,
    fetchOptions: {
      onRequest: async ({ headers }: { headers: Headers }) => {
        headers.set('x-captcha-response', (await waitForToken()) ?? '')
      }
    },
    widget: <TurnstileWidget key={generation} onToken={gate.set} />,
    reset() {
      gate.set(undefined)
      setGeneration((g) => g + 1)
    }
  }
}
