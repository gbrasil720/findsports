import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useRef,
  useState
} from 'react'
import posters from './hero-posters.json'
import { HERO_BARS, type HeroBar } from './onside-landing-content'
import type { SceneHandle } from './onside-scenes'

/**
 * Palco das cenas 3D da landing (WEB-333).
 *
 * O HTML do servidor é sempre o pôster: uma imagem da própria cena, com os
 * cards dos bares alternando em CSS. Só no desktop, depois da hidratação, o
 * three é baixado e a cena viva entra por cima — e sai de novo se o WebGL
 * faltar, cair ou sair caro (`onside-scenes.ts`).
 */

const PORTRAIT = posters.portrait

/** Onde a cena viva roda: mouse de verdade, tela larga e movimento permitido. */
const LIVE_SCENE =
  '(hover: hover) and (pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)'

/** A mesma condição do CSS que troca o hero para a composição em retrato. */
const PORTRAIT_MEDIA =
  '(max-width: 760px), (max-width: 1100px) and (orientation: portrait)'

type Scenes = typeof import('./onside-scenes')
type Spot = (typeof posters.landscape.spots)[number]

/**
 * Sobe a cena quando o palco entra na tela, pausa quando sai ou a aba fica
 * oculta, e devolve `true` depois do primeiro trecho de frames bons. Até lá,
 * e em qualquer falha, quem aparece é o pôster.
 */
function useLiveScene(
  stageRef: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  start: (
    scenes: Scenes,
    canvas: HTMLCanvasElement,
    onWarm: (ok: boolean) => void
  ) => SceneHandle | null
) {
  const [live, setLive] = useState(false)
  const startRef = useRef(start)

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    // `import.meta.env.SSR` tira o `import()` — e o three — do bundle do servidor.
    if (import.meta.env.SSR || !stage || !canvas) return
    // ponytail: decidido uma vez, ao montar. Quem alarga a janela depois fica
    // com o pôster até recarregar; ouvir a media query se isso incomodar.
    if (!window.matchMedia(LIVE_SCENE).matches) return

    let handle: SceneHandle | null = null
    let state: 'idle' | 'loading' | 'on' | 'off' = 'idle'
    let visible = false

    const sync = () => {
      if (visible && !document.hidden) handle?.resume()
      else handle?.pause()
    }
    const stop = () => {
      state = 'off'
      handle?.dispose()
      handle = null
      setLive(false)
    }
    const load = async () => {
      try {
        // A Anton tem de estar pronta: os letreiros são texturas de canvas.
        const [scenes] = await Promise.all([
          import('./onside-scenes'),
          document.fonts.load('700 74px Anton')
        ])
        if (state !== 'loading') return
        handle = startRef.current(scenes, canvas, (ok) =>
          ok ? setLive(true) : stop()
        )
        state = handle ? 'on' : 'off'
        sync()
      } catch {
        stop()
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting)
      if (visible && state === 'idle') {
        state = 'loading'
        // Depois do primeiro paint, quando o navegador estiver à toa.
        if (window.requestIdleCallback) window.requestIdleCallback(load)
        else window.setTimeout(load, 200)
      }
      sync()
    })
    observer.observe(stage)
    document.addEventListener('visibilitychange', sync)
    canvas.addEventListener('webglcontextlost', stop)

    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      canvas.removeEventListener('webglcontextlost', stop)
      state = 'off'
      handle?.dispose()
    }
  }, [stageRef, canvasRef])

  return live
}

function BarCard({ bar }: { bar: HeroBar }) {
  return (
    <div className={`onside-map-card is-${bar.tone}`}>
      <b>
        {bar.live ? <span /> : null}
        {bar.name}
      </b>
      <span>{bar.meta}</span>
    </div>
  )
}

/** Os seis tempos do ciclo do pôster: pulso no pino e card do bar da vez. */
function PosterSpots({ spots, frame }: { spots: Spot[]; frame: string }) {
  return (
    <div className={`onside-hero-spots is-${frame}`}>
      {spots.map((spot, slot) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa; o mesmo bar pode ocupar dois tempos
          key={slot}
          style={
            {
              '--spot-x': `${spot.x}%`,
              '--spot-y': `${spot.y}%`,
              '--pin-x': `${spot.pinX}%`,
              '--pin-y': `${spot.pinY}%`,
              '--pin-r': `${spot.pinR}%`
            } as CSSProperties
          }
        >
          <i />
          <BarCard bar={HERO_BARS[spot.bar] as HeroBar} />
        </div>
      ))}
    </div>
  )
}

export function OnsideHeroStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const live = useLiveScene(stageRef, canvasRef, (scenes, canvas, onWarm) =>
    scenes.mapa(canvas, { cards: cardRefs.current, onWarm })
  )

  return (
    <div
      ref={stageRef}
      className="onside-hero-stage"
      data-scene={live ? 'live' : 'poster'}
      aria-hidden="true"
      style={
        {
          '--poster-landscape': `${posters.landscape.width} / ${posters.landscape.height}`,
          '--poster-portrait': `${PORTRAIT.width} / ${PORTRAIT.height}`
        } as CSSProperties
      }
    >
      <div className="onside-hero-frame">
        <picture>
          <source
            media={PORTRAIT_MEDIA}
            srcSet={PORTRAIT.src}
            width={PORTRAIT.width}
            height={PORTRAIT.height}
          />
          <img
            src={posters.landscape.src}
            width={posters.landscape.width}
            height={posters.landscape.height}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </div>
      <canvas ref={canvasRef} />
      <div className="onside-hero-shade" />
      {/* Por cima do degradê, como os cards da cena viva. */}
      <div className="onside-hero-frame">
        <PosterSpots spots={posters.landscape.spots} frame="landscape" />
        <PosterSpots spots={PORTRAIT.spots} frame="portrait" />
      </div>
      <div className="onside-hero-live-cards">
        {HERO_BARS.map((bar, index) => (
          <div
            key={bar.name}
            ref={(element) => {
              cardRefs.current[index] = element
            }}
          >
            <BarCard bar={bar} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function OnsideFinalStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useLiveScene(stageRef, canvasRef, (scenes, canvas, onWarm) => {
    const scene = scenes.marca(canvas, { onWarm })
    const section = canvas.closest('section')
    if (!scene || !section) return scene
    // O bar gira com a rolagem: 0 quando a seção aponta por baixo da janela,
    // 1 quando some por cima.
    const onScroll = () => {
      const box = section.getBoundingClientRect()
      scene.setProgress(
        (window.innerHeight - box.top) / (window.innerHeight + box.height)
      )
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return {
      ...scene,
      dispose() {
        window.removeEventListener('scroll', onScroll)
        scene.dispose()
      }
    }
  })

  return (
    <div
      ref={stageRef}
      className="onside-final-stage"
      data-scene={live ? 'live' : 'poster'}
      data-motion="zoom"
      aria-hidden="true"
    >
      {/* biome-ignore lint/performance/noImgElement: imagem estática de `public/` */}
      <img
        src={posters.final.src}
        width={posters.final.width}
        height={posters.final.height}
        alt=""
        loading="lazy"
        decoding="async"
      />
      <canvas ref={canvasRef} />
    </div>
  )
}
