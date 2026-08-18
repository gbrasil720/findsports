import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState
} from 'react'

/**
 * Relógio de granularidade de minuto (ESC-17).
 *
 * O dashboard mantinha um contador que era incrementado a cada 60 segundos só
 * para forçar re-render. Como o estado morava no componente da página, o
 * minuto inteiro — herói, filtros, mapa e lista — era re-renderizado, quando
 * o que depende do tempo é só o selo de "ao vivo" de cada cartão.
 *
 * O tique em si é legítimo: um jogo passa a estar ao vivo no horário do apito,
 * e a tela precisa refletir isso sem recarregar. O que muda aqui é o alcance.
 *
 * O provedor devolve `children` sem tocá-los, então trocar o valor do contexto
 * re-renderiza apenas quem o consome — e não a árvore inteira.
 */

const MinuteContext = createContext<number>(0)

/** Milissegundos até a virada do próximo minuto. */
export function msUntilNextMinute(now: number): number {
  const restante = 60_000 - (now % 60_000)
  // Exatamente na virada, espera o minuto seguinte inteiro em vez de disparar
  // duas vezes no mesmo instante.
  return restante === 0 ? 60_000 : restante
}

/** Minuto corrente, como número inteiro desde a época. */
export function currentMinute(now: number): number {
  return Math.floor(now / 60_000)
}

export function MinuteTickProvider({ children }: { children: ReactNode }) {
  const [minute, setMinute] = useState(() => currentMinute(Date.now()))

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined

    const agendar = () => {
      // Alinhado à virada do minuto, e não a cada 60s a partir da montagem:
      // com intervalo fixo, um jogo que começa às 20:00 podia só aparecer
      // como ao vivo às 20:00:47.
      timeout = setTimeout(() => {
        setMinute(currentMinute(Date.now()))
        agendar()
      }, msUntilNextMinute(Date.now()))
    }

    const aoMudarVisibilidade = () => {
      if (document.hidden) {
        if (timeout) clearTimeout(timeout)
        timeout = undefined
        return
      }
      // Ao voltar para a aba, o tempo andou: atualiza antes de reagendar.
      setMinute(currentMinute(Date.now()))
      agendar()
    }

    if (!document.hidden) agendar()
    document.addEventListener('visibilitychange', aoMudarVisibilidade)

    return () => {
      if (timeout) clearTimeout(timeout)
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    }
  }, [])

  return (
    <MinuteContext.Provider value={minute}>{children}</MinuteContext.Provider>
  )
}

/**
 * Instante corrente com granularidade de minuto. Muda uma vez por minuto, o
 * que basta para "ao vivo" e evita re-render a cada segundo.
 */
export function useMinuteNow(): number {
  return useContext(MinuteContext) * 60_000
}
