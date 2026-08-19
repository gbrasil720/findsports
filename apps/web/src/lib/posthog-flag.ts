import posthog from 'posthog-js'
import { useCallback, useSyncExternalStore } from 'react'

/**
 * Flags do PostHog, no cliente.
 *
 * ## Onde esta camada entra, e onde NÃO entra
 *
 * Ela é para rollout percentual, segmentação por cohort e experimento — as
 * três coisas que o PostHog faz bem e que a tabela `app_config` não faz:
 * bucket estável por usuário e leitura estatística amarrada aos eventos que
 * já capturamos.
 *
 * Ela **não** é portão. Flag de cliente é conselho: qualquer pessoa abre o
 * console e muda, ou chama o endpoint direto. Nada que precise de decisão
 * autoritativa — cobrança, cidade liberada, limite de abuso — pode depender
 * daqui. Isso vive em `app_config`, é lido no servidor e é recusado no
 * servidor.
 *
 * ## Por que `useSyncExternalStore`
 *
 * As flags chegam depois do `init`, por rede, e podem mudar de valor durante
 * a sessão. Com `useState` + `useEffect` o primeiro render do cliente usaria
 * um valor e o servidor outro — descasamento de hidratação, que o React
 * conserta apagando e redesenhando a árvore. Aqui o `getServerSnapshot`
 * devolve o mesmo padrão que o primeiro render do cliente devolve, e a troca
 * acontece só quando o PostHog avisa.
 *
 * ## O padrão manda sempre que houver dúvida
 *
 * Sem chave, em desenvolvimento, com bloqueador de anúncio, ou antes de as
 * flags chegarem: vale o `padrao` que quem chamou passou. Uma flag que não
 * respondeu nunca pode ligar caminho novo sozinha.
 */

function assinar(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  // `onFeatureFlags` devolve o cancelamento; sem chamá-lo, cada componente
  // desmontado deixaria um ouvinte vivo.
  return posthog.onFeatureFlags(callback)
}

function carregado(): boolean {
  return typeof window !== 'undefined' && posthog.__loaded === true
}

/**
 * Flag booleana. `padrao` vale enquanto o PostHog não responder — e para
 * sempre, se ele nunca responder.
 */
export function usePostHogFlag(nome: string, padrao: boolean): boolean {
  const snapshot = useCallback(() => {
    if (!carregado()) return padrao
    return posthog.isFeatureEnabled(nome) ?? padrao
  }, [nome, padrao])

  const noServidor = useCallback(() => padrao, [padrao])

  return useSyncExternalStore(assinar, snapshot, noServidor)
}

/**
 * Flag multivariante. Devolve o nome da variante, ou `padrao` enquanto o
 * PostHog não respondeu.
 *
 * `getFeatureFlag` também devolve booleano quando a flag não é multivariante;
 * nesse caso `padrao` vale, porque quem pediu variante espera um nome e não
 * teria o que fazer com `true`.
 */
export function usePostHogVariant(nome: string, padrao: string): string {
  const snapshot = useCallback(() => {
    if (!carregado()) return padrao
    const valor = posthog.getFeatureFlag(nome)
    return typeof valor === 'string' ? valor : padrao
  }, [nome, padrao])

  const noServidor = useCallback(() => padrao, [padrao])

  return useSyncExternalStore(assinar, snapshot, noServidor)
}
