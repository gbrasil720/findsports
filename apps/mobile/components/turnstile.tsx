import { useState } from 'react'
import { View } from 'react-native'
import { WebView } from 'react-native-webview'
import { env } from '@/lib/env'

/**
 * A página que a WebView carrega: só o widget do Turnstile. Cada mudança de
 * estado volta para o app por `postMessage`. `interaction-only`: invisível para
 * quem passa direto, aparece só se houver desafio, como no web.
 */
const page = (siteKey: string) => `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>html, body { margin: 0; background: transparent; }</style>
  </head>
  <body>
    <div id="widget"></div>
    <script>
      function send(message) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message))
      }
      function ready() {
        turnstile.render('#widget', {
          sitekey: ${JSON.stringify(siteKey)},
          appearance: 'interaction-only',
          theme: 'dark',
          language: 'pt-br',
          callback: function (token) { send({ token: token }) },
          'expired-callback': function () { send({}) },
          'error-callback': function () { send({}) }
        })
      }
    </script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ready" async defer></script>
  </body>
</html>`

function TurnstileWidget({
  siteKey,
  onToken
}: {
  siteKey: string
  onToken: (token?: string) => void
}) {
  return (
    // Altura do widget do Turnstile; fica vazia quando não há desafio.
    <View style={{ height: 70 }}>
      <WebView
        // O Turnstile confere o domínio da página contra a chave: a WebView se
        // apresenta como o servidor (onside.sh em produção, localhost em dev).
        source={{ html: page(siteKey), baseUrl: env.EXPO_PUBLIC_SERVER_URL }}
        originWhitelist={['*']}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data) as {
              token?: string
            }
            onToken(message.token)
          } catch {
            onToken(undefined)
          }
        }}
        scrollEnabled={false}
        style={{ backgroundColor: 'transparent' }}
      />
    </View>
  )
}

/**
 * Guarda o token e deixa o envio esperar por ele. Cópia de `createTokenGate`
 * do web (`apps/web/src/components/turnstile.tsx`, WEB-254): o token chega
 * instantes depois da tela, e quem envia antes mandaria o cabeçalho vazio.
 */
function createTokenGate(timeoutMs = 10_000) {
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
          waiting.splice(waiting.indexOf(waiter), 1)
          resolve(token)
        }, timeoutMs)
        waiting.push(waiter)
      })
    }
  }
}

/**
 * Turnstile para as telas públicas do app (login, cadastro), com o mesmo
 * contrato do web: `widget` vai na tela, `fetchOptions` leva o token ao plugin
 * `captcha` do better-auth (cabeçalho `x-captcha-response`), e `reset` depois
 * de cada envio, porque o token vale uma vez só.
 *
 * Sem `EXPO_PUBLIC_TURNSTILE_SITE_KEY` não renderiza nada e o token vai vazio:
 * o servidor só o exige quando tem `TURNSTILE_SECRET_KEY`.
 */
export function useTurnstile() {
  const siteKey = env.EXPO_PUBLIC_TURNSTILE_SITE_KEY
  const [gate] = useState(() => createTokenGate())
  const [generation, setGeneration] = useState(0)

  return {
    fetchOptions: {
      onRequest: async ({ headers }: { headers: Headers }) => {
        const token = siteKey ? await gate.wait() : undefined
        headers.set('x-captcha-response', token ?? '')
      }
    },
    widget: siteKey ? (
      <TurnstileWidget key={generation} siteKey={siteKey} onToken={gate.set} />
    ) : null,
    reset() {
      gate.set(undefined)
      setGeneration((g) => g + 1)
    }
  }
}
