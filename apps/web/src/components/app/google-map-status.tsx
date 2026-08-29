import { Component, type ReactNode, type Ref } from 'react'

/**
 * `onRetry` é opcional porque nem toda falha é passageira: chave recusada e
 * Map ID ausente não melhoram por insistir. Botão que nunca vai dar certo é
 * pior que botão nenhum — some.
 */
export function MapLoadError({
  message,
  onRetry
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--onside-stone)] p-6 text-center">
      <div>
        <div className="font-bold text-[var(--onside-ink)] text-sm">
          Mapa indisponível
        </div>
        <div className="mt-1 text-[var(--onside-muted)] text-xs">{message}</div>
        {onRetry ? (
          <button
            type="button"
            className="onside-btn onside-btn-outline mt-4 min-h-11"
            onClick={onRetry}
          >
            Tentar novamente
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function MapCanvas({
  containerRef,
  ready
}: {
  containerRef: Ref<HTMLDivElement>
  ready: boolean
}) {
  return (
    <div className="absolute inset-0">
      {!ready ? (
        <div
          className="absolute inset-0 z-[1] grid place-items-center bg-[var(--onside-stone)]"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="text-sm text-[var(--onside-muted)]">
            Carregando mapa…
          </span>
        </div>
      ) : null}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}

/**
 * Rede de segurança do mapa.
 *
 * O mapa é acessório: quem procura bar decide pela lista, e o mapa ilustra.
 * Sem uma fronteira própria, qualquer coisa que o SDK do Google lance de
 * dentro de um efeito sobe até a fronteira de erro da rota e troca o dashboard
 * inteiro pelo "Something went wrong!" — a tela perde a lista, os filtros e a
 * localização por causa de um quadrado que ninguém precisava.
 *
 * As causas conhecidas estão tratadas em `isMapaVivo` e nos `try` do
 * componente. Esta fronteira existe para as que ainda não conhecemos: o SDK é
 * código remoto que muda sem aviso, e o custo de errar aqui não pode ser a
 * página.
 *
 * Voltar do erro remonta o mapa do zero: enquanto `falhou` é verdadeiro os
 * filhos ficam desmontados, então limpar o estado recria a instância e os
 * pinos pelos efeitos. Reusar a instância que acabou de quebrar levaria de
 * volta ao mesmo lugar.
 */
export class MapBoundary extends Component<
  { children: ReactNode },
  { falhou: boolean }
> {
  state = { falhou: false }

  static getDerivedStateFromError() {
    return { falhou: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Mapa falhou e foi isolado da página:', error)
  }

  render() {
    if (this.state.falhou) {
      return (
        <MapLoadError
          message="Mapa temporariamente indisponível"
          onRetry={() => this.setState({ falhou: false })}
        />
      )
    }
    return this.props.children
  }
}
