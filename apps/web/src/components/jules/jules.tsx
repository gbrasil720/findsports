import { useEffect, useRef, useState } from 'react'
import { TACA_SVG } from './taca-still'
import { TACA_TINTA_SVG } from './taca-tinta'

/** As cenas do palco que o web usa (o app tem mais). */
export type JulesEstado =
  | 'idle'
  | 'empty'
  | 'refused'
  | 'down'
  | 'awaiting'
  | 'limit'
  | 'offline'
  | 'done'
  | 'pleased'

type Palco = Window & {
  setMascot?: (c: { state?: JulesEstado }) => void
}

/** O palco entra parado e só reage depois: as cenas são reações. */
const REAGE_EM_MS = 700

/**
 * O Jules no web (WEB-554, WEB-555). Primeiro a taça parada em SVG, que já
 * sai no HTML do servidor; depois de a página carregar, o palco do app
 * (`/jules/stage.html`, ~76 KB, gerado por `apps/mobile/scripts/mascot`) num
 * iframe do mesmo domínio, que troca de lugar com ela quando fica pronto.
 * Nada disso entra no JavaScript de entrada além deste componente, e com
 * "reduzir movimento" fica só a taça parada. Os olhos seguem o cursor da
 * página inteira: o movimento do ponteiro é repassado ao palco.
 *
 * Decorativo: o texto ao lado diz tudo. Quem posiciona a taça e o iframe é o
 * CSS de quem usa (`.jules-parado` e `.jules-palco`).
 */
export function Jules({
  estado,
  tinta = false,
  className
}: {
  estado: JulesEstado
  /** Em tinta com olhos acid, para fundo acid. Sem isso, acid (fundo escuro). */
  tinta?: boolean
  className?: string
}) {
  const [montar, setMontar] = useState(false)
  const [pronto, setPronto] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const atual = useRef(estado)
  atual.current = estado

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cancel: () => void = () => {}
    const depois = () => {
      const id = setTimeout(() => setMontar(true), 0)
      cancel = () => clearTimeout(id)
    }
    if (document.readyState === 'complete') depois()
    else {
      addEventListener('load', depois, { once: true })
      cancel = () => removeEventListener('load', depois)
    }
    return () => cancel()
  }, [])

  // Troca de cena depois da primeira reação (a página que muda de erro).
  const enviado = useRef<JulesEstado>(undefined)
  const enviar = (state: JulesEstado) => {
    enviado.current = state
    ;(frame.current?.contentWindow as Palco | null)?.setMascot?.({ state })
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: enviar só lê refs
  useEffect(() => {
    if (enviado.current && enviado.current !== estado) enviar(estado)
  }, [estado])

  // O palco avisa depois do primeiro quadro pintado (`jules-ready`). Sem o
  // aviso (arquivo fora do ar, bloqueio), fica a taça parada.
  // biome-ignore lint/correctness/useExhaustiveDependencies: enviar só lê refs
  useEffect(() => {
    if (!montar) return
    let timer = 0
    const ouvir = (e: MessageEvent) => {
      if (e.data !== 'jules-ready') return
      if (e.source !== frame.current?.contentWindow) return
      if (e.origin !== location.origin) return
      setPronto(true)
      timer = window.setTimeout(() => enviar(atual.current), REAGE_EM_MS)
    }
    addEventListener('message', ouvir)
    return () => {
      removeEventListener('message', ouvir)
      clearTimeout(timer)
    }
  }, [montar])

  // O cursor fora do iframe chega ao palco como se estivesse dentro dele.
  useEffect(() => {
    if (!pronto) return
    const mover = (e: PointerEvent) => {
      const el = frame.current
      const win = el?.contentWindow as (Window & typeof globalThis) | null
      if (!el || !win) return
      const r = el.getBoundingClientRect()
      win.dispatchEvent(
        new win.PointerEvent('pointermove', {
          clientX: e.clientX - r.left,
          clientY: e.clientY - r.top,
          pointerType: e.pointerType
        })
      )
    }
    addEventListener('pointermove', mover, { passive: true })
    return () => removeEventListener('pointermove', mover)
  }, [pronto])

  const config = encodeURIComponent(
    JSON.stringify({ state: 'idle', dark: !tinta, reduced: false })
  )

  return (
    <div className={className} aria-hidden="true">
      <span
        className="jules-parado"
        style={pronto ? { visibility: 'hidden' } : undefined}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG estático gerado, sem dado de usuário
        dangerouslySetInnerHTML={{ __html: tinta ? TACA_TINTA_SVG : TACA_SVG }}
      />
      {montar ? (
        <iframe
          ref={frame}
          className="jules-palco"
          src={`/jules/stage.html#${config}`}
          title="Jules"
          tabIndex={-1}
          // Invisível até o palco pintar; depois a troca é no mesmo quadro,
          // sem fade: com a parada escondida e o iframe a meio caminho, a
          // tinta saía translúcida sobre o acid (o Jules "apagado").
          style={{ opacity: pronto ? 1 : 0 }}
        />
      ) : null}
    </div>
  )
}
