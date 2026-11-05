/*
 * Comportamentos da landing v3 (WEB-501), portados do protótipo
 * `docs/design/redesign-2026-11/landing`. Tudo preso ao `root`; devolve a
 * limpeza. Sem movimento reduzido, nada fica escondido esperando observer.
 */

type Cleanup = () => void

const STEP_TIMES = ['18:00', '18:40', '19:10', '19:30', '21:30'] as const

function digits(time: string) {
  return `<span>${time[0]}</span><span>${time[1]}</span><span class="c">:</span><span>${time[3]}</span><span>${time[4]}</span>`
}

export function startEffects(root: HTMLElement): Cleanup {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const canObserve = 'IntersectionObserver' in window && !reduce
  const cleanups: Cleanup[] = []
  const $ = <T extends Element = HTMLElement>(sel: string) =>
    root.querySelector<T>(sel)
  const $$ = <T extends Element = HTMLElement>(sel: string) => [
    ...root.querySelectorAll<T>(sel)
  ]
  const on = <K extends keyof WindowEventMap>(
    target: Window | HTMLElement,
    type: K | string,
    fn: EventListener,
    opts?: AddEventListenerOptions
  ) => {
    target.addEventListener(type, fn, opts)
    cleanups.push(() => target.removeEventListener(type, fn, opts))
  }

  /* Cabeçalho: papel sobre papel, tinta sobre tinta. */
  const nav = $('#lp3-nav')
  const inks = $$('.hero,.how,.ver,.final,.foot')
  const navTone = () => {
    if (!nav) return
    const y = nav.getBoundingClientRect().bottom - 10
    const ink = inks.some((s) => {
      const r = s.getBoundingClientRect()
      return r.top <= y && r.bottom >= y
    })
    nav.classList.toggle('on-paper', !ink)
  }
  on(window, 'scroll', navTone, { passive: true })
  navTone()

  /* Entradas: só o que está abaixo da dobra ao abrir. */
  if (canObserve) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.remove('pre')
          io.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    )
    $$('.rv').forEach((el, i) => {
      if (el.getBoundingClientRect().top <= window.innerHeight) return
      el.classList.add('pre')
      el.style.transitionDelay = `${(i % 3) * 0.08}s`
      io.observe(el)
    })
    cleanups.push(() => io.disconnect())
  }

  /* Conversa do grupo, mensagem a mensagem. */
  const box = $('#lp3-msgs')
  const msgs = $$('#lp3-msgs .m')
  let timers: number[] = []
  const playChat = () => {
    if (!box) return
    for (const t of timers) clearTimeout(t)
    timers = []
    for (const m of msgs) {
      m.hidden = true
      m.classList.remove('pop')
    }
    box.querySelector('.typing')?.remove()
    let t = 300
    for (const m of msgs) {
      const mine = m.classList.contains('card')
      timers.push(
        window.setTimeout(() => {
          const typing = document.createElement('div')
          typing.className = `m typing${mine ? ' me' : ''}`
          typing.innerHTML = '<i></i><i></i><i></i>'
          typing.style.alignSelf = mine ? 'flex-end' : 'flex-start'
          box.appendChild(typing)
        }, t)
      )
      t += mine ? 1100 : 750
      timers.push(
        window.setTimeout(() => {
          box.querySelector('.typing')?.remove()
          m.hidden = false
          m.classList.add('pop')
          box.appendChild(m)
        }, t)
      )
      t += 350
    }
  }
  const chat = $('#lp3-chat')
  if (canObserve && chat) {
    let done = false
    const io = new IntersectionObserver(
      (entries) => {
        if (done || !entries.some((e) => e.isIntersecting)) return
        done = true
        playChat()
      },
      { threshold: 0.35 }
    )
    io.observe(chat)
    cleanups.push(() => io.disconnect())
  }
  const replay = $('#lp3-replay')
  if (replay) on(replay, 'click', playChat)
  cleanups.push(() => {
    for (const t of timers) clearTimeout(t)
  })

  /* A noite do jogo: o passo aceso é o de título mais perto do meio da tela. */
  const steps = $$('.step')
  const heads = steps.map((s) => s.querySelector('h3'))
  const screens = $$('#lp3-screens img')
  const prog = $$('#lp3-prog i')
  const dig = $('#lp3-digits')
  let current = -1
  const setStep = (i: number) => {
    steps.forEach((s, j) => {
      s.classList.toggle('on', j === i)
    })
    screens.forEach((s, j) => {
      s.classList.toggle('on', j === i)
    })
    prog.forEach((s, j) => {
      s.classList.toggle('on', j <= i)
    })
    if (dig) dig.innerHTML = digits(STEP_TIMES[i] ?? '18:00')
  }
  let ticking = false
  const pick = () => {
    ticking = false
    const mid = window.innerHeight / 2
    let best = 0
    let bestDist = Number.POSITIVE_INFINITY
    heads.forEach((h, j) => {
      if (!h) return
      const r = h.getBoundingClientRect()
      const d = Math.abs(r.top + r.height / 2 - mid)
      if (d < bestDist) {
        bestDist = d
        best = j
      }
    })
    if (best !== current) {
      current = best
      setStep(best)
    }
  }
  on(
    window,
    'scroll',
    () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(pick)
    },
    { passive: true }
  )
  on(window, 'resize', pick)
  pick()

  /* No celular os passos viram carrossel; o relógio acompanha o card. */
  const stepsEl = $('#lp3-steps')
  const mdig = $('#lp3-mdigits')
  const mprog = $$('#lp3-mprog i')
  let mcur = -1
  const mpick = () => {
    if (!stepsEl || getComputedStyle(stepsEl).flexDirection !== 'row') return
    const c = stepsEl.scrollLeft + stepsEl.clientWidth / 2
    let best = 0
    let bestDist = Number.POSITIVE_INFINITY
    steps.forEach((s, j) => {
      const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - c)
      if (d < bestDist) {
        bestDist = d
        best = j
      }
    })
    if (best === mcur) return
    mcur = best
    if (mdig) mdig.innerHTML = digits(STEP_TIMES[best] ?? '18:00')
    mprog.forEach((s, j) => {
      s.classList.toggle('on', j <= best)
    })
  }
  if (stepsEl) {
    on(stepsEl, 'scroll', () => requestAnimationFrame(mpick), { passive: true })
    mpick()
  }

  /* O bar anotado: linhas das notas até o ponto na tela. */
  const anno = $('#lp3-anno')
  const lines = $<SVGSVGElement>('#lp3-lines')
  const phone = $('#lp3-annophone')
  const drawLines = () => {
    if (!anno || !lines || !phone) return
    if (getComputedStyle(lines).display === 'none') return
    const targets = [...phone.querySelectorAll('.target')]
    const box2 = anno.getBoundingClientRect()
    let svg = ''
    for (const note of anno.querySelectorAll<HTMLElement>('.note')) {
      const target = targets[Number(note.dataset.to)]
      if (!target) continue
      const tr = target.getBoundingClientRect()
      const nr = note.getBoundingClientRect()
      const left = note.parentElement?.classList.contains('l')
      const x1 = (left ? nr.right : nr.left) - box2.left
      const y1 = nr.top + nr.height / 2 - box2.top
      const x2 = tr.left + tr.width / 2 - box2.left
      const y2 = tr.top + tr.height / 2 - box2.top
      const mx = x1 + (left ? 28 : -28)
      svg += `<path d="M${x1} ${y1} L${mx} ${y1} L${x2} ${y2}"/><circle cx="${x1}" cy="${y1}" r="4.5"/>`
    }
    lines.innerHTML = svg
  }
  on(window, 'resize', drawLines)
  const lineTimer = window.setTimeout(drawLines, 300)
  cleanups.push(() => clearTimeout(lineTimer))
  if (anno && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setTimeout(drawLines, 950)
    })
    io.observe(anno)
    cleanups.push(() => io.disconnect())
  }

  /* Barras da nota enchem, o painel se endireita. */
  const bars = $('#lp3-bars5')
  const browser = $('#lp3-browser')
  if (canObserve) {
    const once = (
      el: HTMLElement | null,
      fn: () => void,
      threshold: number
    ) => {
      if (!el) return
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return
          fn()
          io.disconnect()
        },
        { threshold }
      )
      io.observe(el)
      cleanups.push(() => io.disconnect())
    }
    once(bars, () => bars?.classList.remove('pre'), 0.4)
    once(browser, () => browser?.classList.add('flat'), 0.25)
  } else {
    bars?.classList.remove('pre')
    browser?.classList.add('flat')
  }

  /* Confete em volta da medalha. */
  const confetti = $('#lp3-confetti')
  if (confetti && !reduce) {
    const colors = ['#c9f135', '#e8320c', '#12120f', '#c9f135', '#f1eee6']
    for (let c = 0; c < 16; c++) {
      const piece = document.createElement('i')
      const size = `${6 + Math.random() * 8}px`
      piece.style.left = `${Math.random() * 100}%`
      piece.style.top = `${Math.random() * 60}%`
      piece.style.background = colors[c % 5] as string
      piece.style.animationDelay = `${-Math.random() * 7}s`
      piece.style.width = size
      piece.style.height = size
      confetti.appendChild(piece)
    }
    cleanups.push(() => {
      confetti.innerHTML = ''
    })
  }

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
