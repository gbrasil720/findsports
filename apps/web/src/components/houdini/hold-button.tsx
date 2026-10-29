import { useEffect, useRef, useState } from 'react'

const HOLD_MS = 1000

/**
 * "Segure para …": ação destrutiva só dispara depois de um segundo segurando
 * (mouse, toque ou Espaço/Enter). Soltar antes cancela.
 */
export function HoldButton({
  label,
  busyLabel,
  busy = false,
  disabled = false,
  onConfirm
}: {
  label: string
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  onConfirm: () => void
}) {
  const [progress, setProgress] = useState(0)
  const startRef = useRef<number | null>(null)
  const frameRef = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  function start() {
    if (busy || disabled || startRef.current !== null) return
    startRef.current = performance.now()
    const tick = () => {
      if (startRef.current === null) return
      const done = (performance.now() - startRef.current) / HOLD_MS
      if (done >= 1) {
        startRef.current = null
        setProgress(0)
        onConfirm()
        return
      }
      setProgress(done)
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }

  function stop() {
    startRef.current = null
    cancelAnimationFrame(frameRef.current)
    setProgress(0)
  }

  return (
    <button
      type="button"
      className="hd-btn hd-btn-danger is-block"
      disabled={busy || disabled}
      style={{ touchAction: 'none' }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault()
          start()
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') stop()
      }}
      onBlur={stop}
    >
      {/* `scaleX` e não `width`: o enchimento anda sem refazer o layout. */}
      <span
        aria-hidden="true"
        className="fill"
        style={{
          width: '100%',
          transform: `scaleX(${progress})`,
          transformOrigin: 'left'
        }}
      />
      <span className="lbl">
        {busy
          ? (busyLabel ?? label)
          : progress > 0
            ? `Segure… ${Math.round(progress * 100)}%`
            : label}
      </span>
    </button>
  )
}
