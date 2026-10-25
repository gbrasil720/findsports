import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

/*
 * Rede no painel (WEB-460). O React Query já sabe se há rede
 * (`navigator.onLine`): sem ela, as consultas esperam e as mutations ficam
 * paradas até voltar; ao voltar, o `router.tsx` relê a tela.
 */

const subscribe = (avisar: () => void) => onlineManager.subscribe(avisar)

/** `false` enquanto o navegador está sem rede. No servidor, sempre `true`. */
export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => onlineManager.isOnline(),
    () => true
  )
}

/**
 * A faixa de "sem conexão": uma só, presa no topo da tela, por cima do
 * conteúdo (não empurra nada). Some sozinha quando a rede volta.
 */
export function FaixaSemConexao() {
  const online = useOnline()
  return (
    <>
      <div className="painel-faixa-rede" data-visivel={!online} aria-hidden>
        <span className="painel-faixa-rede-ponto" />
        Sem conexão. O painel se atualiza quando a rede voltar.
      </div>
      <span role="status" className="sr-only">
        {online
          ? ''
          : 'Sem conexão. O painel se atualiza quando a rede voltar.'}
      </span>
    </>
  )
}
