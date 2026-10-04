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
 * Cloudflare Turnstile para formulário público. `widget` vai no fim do
 * formulário: mesmo invisível ele é um item do flex, e no meio somaria um
 * `gap` a mais. No envio, `fetchOptions` leva o token ao plugin `captcha` do
 * better-auth (header `x-captcha-response`); no tRPC ele vai como
 * `turnstileToken`. O token vale uma vez só: chame `reset` depois de cada
 * envio, deu certo ou não.
 *
 * Sem `VITE_TURNSTILE_SITE_KEY` não renderiza nada e o token fica vazio — o
 * servidor só o exige quando tem `TURNSTILE_SECRET_KEY`.
 */
export function useTurnstile() {
  const [token, setToken] = useState<string>()
  const [generation, setGeneration] = useState(0)
  return {
    token,
    fetchOptions: { headers: { 'x-captcha-response': token ?? '' } },
    widget: <TurnstileWidget key={generation} onToken={setToken} />,
    reset() {
      setToken(undefined)
      setGeneration((g) => g + 1)
    }
  }
}
