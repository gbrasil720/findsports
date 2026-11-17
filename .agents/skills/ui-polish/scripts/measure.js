/*
 * Mede a tela renderizada e devolve os defeitos de acabamento que o olho e a
 * leitura do código não pegam. É uma expressão: cole no console, passe a
 * `page.evaluate` ou a qualquer ferramenta de navegador. `shoot.ts` a roda em
 * 1280 e 390, claro e escuro.
 *
 * `window.__polishEdge = 'bottom'` antes de rodar: só confere o que ficou
 * atrás de barra fixa no fim da rolagem.
 */
;(() => {
  const vw = innerWidth
  const vh = innerHeight
  const phone = vw <= 480
  const edge = window.__polishEdge || 'top'
  const groups = new Map()

  const cls = (el) =>
    el.tagName.toLowerCase() +
    [...el.classList]
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join('')
  const sig = (el) => {
    const parts = [cls(el)]
    let p = el.parentElement
    while (p && p !== document.body && parts.length < 3) {
      if (p.classList.length) parts.unshift(cls(p))
      p = p.parentElement
    }
    return parts.join(' > ')
  }
  const say = (el) =>
    (el.innerText || el.getAttribute('aria-label') || el.value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 60)
  const add = (rule, sev, el, msg) => {
    const where = el ? sig(el) : ''
    const key = `${rule}|${where}`
    const g = groups.get(key)
    if (g) return void g.n++
    const r = el?.getBoundingClientRect()
    groups.set(key, {
      rule,
      sev,
      n: 1,
      where,
      msg,
      text: el ? say(el) : '',
      at: r ? [Math.round(r.left), Math.round(r.top + scrollY)] : undefined
    })
  }

  const px = (v) => Number.parseFloat(v) || 0
  const shown = (el) => {
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))
      return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const ownText = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  const fixedHost = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const pos = getComputedStyle(p).position
      if (pos === 'fixed' || pos === 'sticky') return p
    }
    return null
  }

  /* Fora da conta: ferramentas de desenvolvimento e os controles do mapa. */
  const SKIP =
    'svg, iframe, [data-polish-skip], .TanStackRouterDevtools, [class*="tsqd-"], .maplibregl-ctrl'
  const all = [...document.body.querySelectorAll('*')]
    .filter((el) => !el.closest(SKIP) && shown(el))
    .slice(0, 8000)
  const css = new Map(all.map((el) => [el, getComputedStyle(el)]))
  /* Link de pular fica fora da tela até o foco: não é alvo nem botão à vista. */
  const onPage = (el) => {
    const r = el.getBoundingClientRect()
    return r.right > 0 && r.left < vw && r.bottom + scrollY > 0
  }
  const interactive = all.filter(
    (el) =>
      onPage(el) &&
      el.matches(
        'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=link], [role=menuitem]'
      )
  )
  const plated = (el) => {
    const s = css.get(el)
    const bg = s.backgroundColor
    const filled = bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
    return filled || px(s.borderTopWidth) > 0 || s.backgroundImage !== 'none'
  }
  const controls = interactive.filter((el) => {
    const h = el.getBoundingClientRect().height
    return (
      h >= 24 &&
      h <= 72 &&
      !el.matches('input[type=checkbox], input[type=radio], textarea') &&
      plated(el)
    )
  })
  const buttons = controls.filter((el) => !el.matches('input, select'))

  /* Fora da caixa de um pai que rola (coluna de tabela larga): está escondido pela rolagem, não por uma barra. */
  const clipped = (el, x, y) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = css.get(p) ?? getComputedStyle(p)
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
      const r = p.getBoundingClientRect()
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return true
    }
    return false
  }

  /* Atrás de barra fixa: no topo ou no fim da rolagem não há como trazer à vista. */
  const covered = (els, sev, what) => {
    for (const el of els) {
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      if (x < 0 || x > vw || y < 0 || y > vh) continue
      if (edge === 'bottom' ? y < vh / 2 : y > vh / 2) continue
      if (clipped(el, x, y)) continue
      const top = document.elementFromPoint(x, y)
      if (!top || el.contains(top) || top.contains(el)) continue
      const host = fixedHost(top)
      if (!host || host.contains(el) || host.closest(SKIP)) continue
      add('coberto', sev, el, `${what} atrás de ${sig(host)}`)
    }
  }
  const atEdge =
    edge === 'bottom'
      ? scrollY + vh >= document.documentElement.scrollHeight - 2
      : scrollY <= 1
  if (atEdge) {
    covered(interactive, 'erro', 'controle')
    covered(all.filter(ownText), 'aviso', 'texto')
  }
  if (edge === 'bottom') return finish()

  /* Rolagem lateral da página. */
  const de = document.documentElement
  if (de.scrollWidth > de.clientWidth + 1) {
    const clipped = (el) => {
      for (let p = el.parentElement; p && p !== de; p = p.parentElement)
        if (css.get(p) && css.get(p).overflowX !== 'visible') return true
      return false
    }
    const off = all.filter((el) => {
      const r = el.getBoundingClientRect()
      return (r.right > de.clientWidth + 1 || r.left < -1) && !clipped(el)
    })
    const set = new Set(off)
    for (const el of off)
      if (!set.has(el.parentElement))
        add(
          'rolagem-lateral',
          'erro',
          el,
          `passa da tela em ${Math.round(el.getBoundingClientRect().right - de.clientWidth)} px`
        )
    if (!off.length)
      add(
        'rolagem-lateral',
        'erro',
        null,
        `a página rola ${de.scrollWidth - de.clientWidth} px de lado`
      )
  }

  const canvas = document.createElement('canvas').getContext('2d', {
    willReadFrequently: true
  })
  const rgbaCache = new Map()
  const rgba = (color) => {
    if (rgbaCache.has(color)) return rgbaCache.get(color)
    canvas.clearRect(0, 0, 1, 1)
    canvas.fillStyle = '#000'
    canvas.fillStyle = color
    canvas.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data
    const out = [r, g, b, a / 255]
    rgbaCache.set(color, out)
    return out
  }
  const over = (top, under) => {
    const a = top[3]
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1)
  }
  const lum = (c) => {
    const f = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
  }
  /* Fundo de verdade: sobe compondo as cores. Imagem ou opacidade no caminho: sem conta. */
  const backdrop = (el) => {
    const layers = []
    for (let p = el; p; p = p.parentElement) {
      const s = css.get(p) || getComputedStyle(p)
      if (s.backgroundImage !== 'none' || px(s.opacity) < 1) return null
      if (s.position === 'absolute' || s.position === 'fixed') {
        if (rgba(s.backgroundColor)[3] < 1) return null
      }
      const c = rgba(s.backgroundColor)
      if (c[3] > 0) layers.push(c)
      if (c[3] >= 1) break
    }
    return layers.reduceRight((under, c) => over(c, under), [255, 255, 255, 1])
  }

  const lines = (el) => {
    const range = document.createRange()
    const tops = new Set()
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) tops.add(Math.round(r.top))
    }
    return tops.size
  }

  for (const el of all) {
    const s = css.get(el)
    const r = el.getBoundingClientRect()
    if (el.matches('img')) {
      if (el.complete && !el.naturalWidth)
        add('imagem', 'erro', el, 'imagem quebrada')
      else if (el.naturalWidth) {
        const drawn = r.width / r.height
        const real = el.naturalWidth / el.naturalHeight
        if (s.objectFit === 'fill' && Math.abs(drawn / real - 1) > 0.03)
          add(
            'imagem',
            'erro',
            el,
            `esticada: ${real.toFixed(2)} desenhada em ${drawn.toFixed(2)}`
          )
        if (
          !el.getAttribute('width') &&
          s.aspectRatio === 'auto' &&
          s.position === 'static'
        )
          add(
            'imagem',
            'aviso',
            el,
            'sem width/height nem aspect-ratio: o layout pula ao carregar'
          )
      }
    }
    if (!ownText(el) || el.matches('input, textarea, select, option')) continue
    if (r.width <= 2 || r.height <= 2) continue

    const cutX =
      s.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1
    const cutY =
      s.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 2
    const scrolls = /auto|scroll/.test(s.overflowX + s.overflowY)
    if ((cutX || cutY) && !scrolls) {
      const meant =
        s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none'
      add(
        meant ? 'reticências' : 'texto-cortado',
        meant ? 'aviso' : 'erro',
        el,
        meant
          ? 'texto cortado com "…": o inteiro aparece em algum lugar?'
          : 'texto cortado sem aviso'
      )
    }

    for (
      let p = el.parentElement;
      p && p !== document.body;
      p = p.parentElement
    ) {
      const ps = css.get(p)
      if (!ps || (ps.overflowX === 'visible' && ps.overflowY === 'visible'))
        continue
      const b = p.getBoundingClientRect()
      const cutV =
        p.scrollHeight <= p.clientHeight + 1 &&
        (r.top < b.top - 1.5 || r.bottom > b.bottom + 1.5)
      const cutH =
        p.scrollWidth <= p.clientWidth + 1 &&
        (r.left < b.left - 1.5 || r.right > b.right + 1.5)
      /* Letreiro que corre: o recorte é o efeito. */
      let runs = false
      for (let m = el; m && m !== p; m = m.parentElement)
        if (getComputedStyle(m).animationName !== 'none') runs = true
      if (
        !runs &&
        (cutV || cutH) &&
        r.bottom > b.top &&
        r.top < b.bottom &&
        r.right > b.left &&
        r.left < b.right
      )
        add('texto-cortado', 'erro', el, `cortado por ${sig(p)}`)
      break
    }

    const size = px(s.fontSize)
    if (size < 11) add('letra-miúda', 'aviso', el, `${size} px`)

    const n = lines(el)
    if (n >= 3 && r.width < 90)
      add(
        'quebra-palavra',
        'aviso',
        el,
        `${n} linhas em ${Math.round(r.width)} px de largura`
      )

    const bg = backdrop(el)
    if (bg) {
      const fg = over(rgba(s.color), bg)
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
      const ratio = (hi + 0.05) / (lo + 0.05)
      const big = size >= 24 || (size >= 18.66 && px(s.fontWeight) >= 700)
      /* Letra só de contorno, ou peça solta (o polegar de um seletor) por baixo do texto: sem conta. */
      const loose = () =>
        [
          ...(
            el.parentElement?.parentElement || el.parentElement
          ).querySelectorAll('*')
        ].some((o) => {
          if (
            o.contains(el) ||
            !/absolute|fixed/.test(getComputedStyle(o).position)
          )
            return false
          const b = o.getBoundingClientRect()
          return (
            b.left < r.left + r.width / 2 &&
            b.right > r.left + r.width / 2 &&
            b.top < r.top + r.height / 2 &&
            b.bottom > r.top + r.height / 2
          )
        })
      if (ratio < (big ? 3 : 4.5) && !px(s.webkitTextStrokeWidth) && !loose())
        add(
          'contraste',
          ratio < 3 ? 'erro' : 'aviso',
          el,
          `${ratio.toFixed(2)}:1 (pede ${big ? 3 : 4.5})`
        )
    }
  }

  /* Alvo de toque e nome acessível. */
  for (const el of interactive) {
    const named =
      say(el) ||
      el.getAttribute('aria-labelledby') ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      el.querySelector('img[alt]:not([alt=""]), svg title') ||
      (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
      el.closest('label')
    if (!named)
      add('sem-nome', 'erro', el, 'controle sem nome para o leitor de tela')

    if (!phone || el.matches('input[type=range], input[type=file]')) continue
    const s = css.get(el)
    if (s.display === 'inline' && ownText(el.parentElement)) continue
    /* Campo: a placa é o rótulo ou a caixa em volta dele. */
    const field = el.matches('input, select, textarea')
    const around = field && (el.closest('label') || el.parentElement)
    const box =
      around &&
      (around.getBoundingClientRect().height <= 72 ||
        /* Rádio escondido dentro do cartão que é o rótulo: o alvo é o cartão. */
        (el.getBoundingClientRect().width <= 2 && el.closest('label')))
        ? around
        : el
    const r = box.getBoundingClientRect()
    /*
     * Campo que passa da caixa em volta (margem negativa): vale o maior dos dois,
     * sem a parte que um pai com overflow corta (ali o toque não chega).
     */
    const own = el.getBoundingClientRect()
    let [left, top, right, bottom] = [own.left, own.top, own.right, own.bottom]
    for (
      let p = el.parentElement;
      p && p !== document.body;
      p = p.parentElement
    ) {
      const o = getComputedStyle(p)
      if (o.overflowX === 'visible' && o.overflowY === 'visible') continue
      const b = p.getBoundingClientRect()
      left = Math.max(left, b.left)
      top = Math.max(top, b.top)
      right = Math.min(right, b.right)
      bottom = Math.min(bottom, b.bottom)
    }
    let w = Math.max(r.width, right - left)
    let h = Math.max(r.height, bottom - top)
    for (const pseudo of ['::before', '::after']) {
      const p = getComputedStyle(el, pseudo)
      if (p.content === 'none' || p.position !== 'absolute') continue
      w = Math.max(w, r.width - px(p.left) - px(p.right))
      h = Math.max(h, r.height - px(p.top) - px(p.bottom))
    }
    /* Só ícone pede 44 nos dois lados. Com palavras, a pílula de 36 do DESIGN.md é o piso. */
    const want = say(box) ? 36 : 44
    const small = say(box) ? h : Math.min(w, h)
    if (small < want - 0.5)
      add(
        'alvo-de-toque',
        small < 24 ? 'erro' : 'aviso',
        el,
        `${Math.round(w)} × ${Math.round(h)} (pede ${want})`
      )
  }

  /* Controles lado a lado com alturas diferentes. */
  const byParent = new Map()
  for (const el of controls) {
    const list = byParent.get(el.parentElement) || []
    list.push(el)
    byParent.set(el.parentElement, list)
  }
  for (const list of byParent.values()) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1].getBoundingClientRect()
      const b = list[i].getBoundingClientRect()
      const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      const diff = Math.abs(a.height - b.height)
      if (overlap > Math.min(a.height, b.height) / 2 && diff >= 2 && diff <= 16)
        add(
          'alturas',
          'aviso',
          list[i],
          `${Math.round(a.height)} e ${Math.round(b.height)} lado a lado`
        )
    }
  }

  const range = document.createRange()
  for (const el of buttons) {
    const s = css.get(el)
    const r = el.getBoundingClientRect()
    if (
      [...el.children].some((c) =>
        /absolute|fixed/.test(getComputedStyle(c).position)
      )
    )
      continue

    if (lines(el) > 1 || [...el.children].some((c) => lines(c) > 1))
      add('rótulo-quebra', 'aviso', el, 'o rótulo do botão quebra de linha')

    range.selectNodeContents(el)
    const c = range.getBoundingClientRect()
    if (c.height) {
      const above = c.top - r.top - px(s.borderTopWidth)
      const below = r.bottom - px(s.borderBottomWidth) - c.bottom
      if (Math.abs(above - below) > 2.5 && above >= 0 && below >= 0)
        add(
          'respiro',
          'aviso',
          el,
          `${above.toFixed(1)} em cima e ${below.toFixed(1)} embaixo`
        )
    }
  }

  /* Canto dentro de canto: raio de dentro = raio de fora menos a folga. */
  for (const el of all) {
    const s = css.get(el)
    const parent = el.parentElement
    const ps = css.get(parent)
    if (!ps) continue
    const r = el.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    /* Raio em % (a moldura do celular) vale sobre a largura da própria caixa. */
    const radius = (v, box) =>
      v.includes('%') ? (Number.parseFloat(v) / 100) * box.width : px(v)
    const inner = radius(s.borderTopLeftRadius, r)
    const outer = radius(ps.borderTopLeftRadius, pr)
    /* Quem recorta arredonda o filho junto: sem conta. */
    if (!inner || ps.overflowX !== 'visible') continue
    const pill = (v, box) => v >= Math.min(box.width, box.height) / 2 - 0.5
    if (!outer || pill(inner, r) || pill(outer, pr)) continue
    const gap = Math.max(r.left - pr.left, r.top - pr.top)
    if (
      gap < 0 ||
      gap >= outer ||
      gap > 12 ||
      Math.min(r.left - pr.left, r.top - pr.top) < 0
    )
      continue
    const want = outer - gap
    if (Math.abs(inner - want) > 3)
      add(
        'raio-aninhado',
        'aviso',
        el,
        `raio ${Math.round(inner)} dentro de ${Math.round(outer)} com folga ${Math.round(gap)}: pede ${Math.round(want)}`
      )
  }

  /* Sombra sólida cortada por quem recorta. */
  for (const el of all) {
    const shadow = css.get(el).boxShadow
    if (shadow === 'none') continue
    let drop = 0
    for (const layer of shadow.split(/,(?![^(]*\))/)) {
      if (layer.includes('inset')) continue
      const [, y, blur, spread] = (
        layer
          .replace(/rgba?\([^)]*\)|color\([^)]*\)/g, '')
          .match(/-?[\d.]+px/g) || []
      ).map(px)
      if (blur === 0) drop = Math.max(drop, y + (spread || 0))
    }
    if (drop <= 0) continue
    const r = el.getBoundingClientRect()
    for (
      let p = el.parentElement;
      p && p !== document.body;
      p = p.parentElement
    ) {
      const ps = css.get(p)
      if (!ps || ps.overflowY === 'visible') continue
      if (p.scrollHeight > p.clientHeight + 1) break
      const floor = p.getBoundingClientRect().bottom - px(ps.borderBottomWidth)
      if (r.bottom <= floor + 0.5 && r.bottom + drop > floor + 0.5)
        add(
          'sombra-cortada',
          'aviso',
          el,
          `sombra de ${drop} px cortada por ${sig(p)}`
        )
      break
    }
  }

  /* Folhas de estilo: :hover solto, e botão sem :active. */
  const bare = []
  const pressed = []
  const walk = (rules, hoverOk, parent = '') => {
    for (const rule of rules) {
      const ok = hoverOk || /hover:\s*hover/.test(rule.conditionText || '')
      const own = rule.selectorText
      const sel =
        own && parent
          ? own.includes('&')
            ? own.replaceAll('&', `:is(${parent})`)
            : `:is(${parent}) ${own}`
          : own
      if (sel) {
        /* Regra só com filhos (o `&:hover { @media (hover: hover) {…} }` do Tailwind) não pinta nada. */
        if (sel.includes(':hover') && !ok && rule.style?.length) bare.push(sel)
        if (sel.includes(':active')) pressed.push(sel.replace(/:active/g, ''))
      }
      if (rule.cssRules?.length) walk(rule.cssRules, ok, sel || parent)
    }
  }
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules, false)
    } catch {}
  }
  const hits = (sel, el) => {
    try {
      return el ? el.matches(sel) : document.querySelector(sel)
    } catch {
      return false
    }
  }
  if (phone) {
    const live = bare.filter(
      (sel) =>
        !/\.go\d{6,}|maplibregl/.test(sel) && hits(sel.replace(/:hover/g, ''))
    )
    if (live.length)
      add(
        'hover-solto',
        'aviso',
        null,
        `${live.length} regras :hover fora de @media (hover: hover) pegam esta tela (no toque o hover gruda): ${live.slice(0, 6).join(' | ')}`
      )
  }
  for (const el of buttons)
    if (!el.disabled && !pressed.some((sel) => hits(sel, el)))
      add(
        'sem-pressionado',
        'aviso',
        el,
        'botão sem :active (a peça não desce ao toque)'
      )

  /* Foco: por último, porque mexe na página. */
  /* Sem transição: com ela o estilo lido logo depois do foco ainda é o de antes. */
  const still = document.head.appendChild(document.createElement('style'))
  still.textContent = '*, *::before, *::after { transition: none !important; }'
  const before = document.activeElement
  const ring = (s) =>
    `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}|${s.borderColor}|${s.backgroundColor}|${s.textDecorationLine}`
  const tried = new Set()
  for (const el of interactive) {
    const key = sig(el)
    if (tried.has(key) || tried.size > 150 || el.disabled || el.tabIndex < 0)
      continue
    tried.add(key)
    /* O anel pode estar na caixa em volta do campo (:focus-within). */
    const around = [
      el,
      el.parentElement,
      el.parentElement?.parentElement
    ].filter(Boolean)
    const look = () => around.map((a) => ring(getComputedStyle(a))).join()
    const off = look()
    el.focus({ preventScroll: true })
    if (document.activeElement !== el) continue
    const on = look()
    if (on === off) add('sem-foco', 'erro', el, 'nada muda no foco do teclado')
  }
  if (before?.focus) before.focus({ preventScroll: true })
  else document.activeElement?.blur()
  still.remove()

  return finish()

  function finish() {
    const order = { erro: 0, aviso: 1 }
    return {
      url: location.pathname + location.search,
      width: vw,
      theme: document.documentElement.getAttribute('data-theme') || 'light',
      edge,
      findings: [...groups.values()].sort(
        (a, b) => order[a.sev] - order[b.sev] || b.n - a.n
      )
    }
  }
})()
