// Faces da medalha em canvas 2D, iguais às do `o3d.js` do design (seção 09).
// Roda no Chromium do gerador; o app recebe o resultado em PNG.

const METAL = {
  gold: '#e2ac45',
  silver: '#d4d7dc',
  bronze: '#c47d48',
  locked: '#3e3e39'
}

function arcText(ctx, text, cx, cy, r, bottom, spacing) {
  const ch = [...text]
  const w = ch.map((c) => ctx.measureText(c).width)
  const tot = w.reduce((a, b) => a + b, 0) + spacing * (ch.length - 1)
  let a =
    (bottom ? Math.PI / 2 : -Math.PI / 2) + ((bottom ? 1 : -1) * tot) / 2 / r
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ch.forEach((c, i) => {
    const s = bottom ? -1 : 1
    a += (s * w[i]) / 2 / r
    ctx.save()
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.rotate(a + (bottom ? -Math.PI / 2 : Math.PI / 2))
    ctx.fillText(c, 0, 0)
    ctx.restore()
    a += (s * (w[i] / 2 + spacing)) / r
  })
}

function star(ctx, x, y, r) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

// PROTÓTIPO (medalha do Jules): a boca da taça em cima (0..800), o pé embaixo.
// Variações da B com detalhe de joalheria: fio de ouro por dentro, friso no alto,
// olhos com aro de ouro e o nome em relevo no pé. b2 sorri, b3 pisca.
function julesJewel(ctx, s, mask) {
  const metal = mask ? '#fff' : METAL[s.metal]
  const inkc = mask ? '#000' : '#12120f'
  ctx.fillStyle = mask ? '#000' : s.enamel
  ctx.fillRect(0, 0, 1024, 1024)
  ctx.strokeStyle = metal
  ctx.fillStyle = metal
  ctx.lineCap = 'round'
  // O fio de ouro acompanha o bojo (a caixa do bojo é 48 x 48 unidades em 800 px).
  const U = 800 / 48
  const X = (x) => 512 + (x - 50) * U * 0.86
  const Y = (y) => 367 + (y - 36) * U * 0.86
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(X(26), Y(14))
  ctx.lineTo(X(74), Y(14))
  ctx.lineTo(X(74), Y(38))
  ctx.bezierCurveTo(X(74), Y(51), X(66), Y(60), X(56), Y(62))
  ctx.lineTo(X(44), Y(62))
  ctx.bezierCurveTo(X(34), Y(60), X(26), Y(51), X(26), Y(38))
  ctx.closePath()
  ctx.stroke()
  // Friso no alto, como o das outras medalhas.
  for (let i = 0; i <= 28; i++) {
    const x = X(28) + ((X(72) - X(28)) * i) / 28
    ctx.lineWidth = i % 4 ? 4 : 7
    ctx.beginPath()
    ctx.moveTo(x, Y(14) + 16)
    ctx.lineTo(x, Y(14) + (i % 4 ? 34 : 46))
    ctx.stroke()
  }
  const open = (x) => {
    ctx.fillStyle = metal
    ctx.beginPath()
    ctx.roundRect(x - 64, 232, 128, 290, 64)
    ctx.fill()
    ctx.fillStyle = inkc
    ctx.beginPath()
    ctx.roundRect(x - 54, 242, 108, 270, 54)
    ctx.fill()
  }
  const smile = (x) => {
    for (const [w, c] of [[86, metal], [66, inkc]]) {
      ctx.strokeStyle = c
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.arc(x, 430, 78, Math.PI * 1.08, Math.PI * 1.92)
      ctx.stroke()
    }
  }
  if (s.variant === 'b2') { smile(362); smile(662) }
  else if (s.variant === 'b3') { open(362); smile(662) }
  else { open(362); open(662) }
  if (s.variant === 'b3') { ctx.fillStyle = metal; star(ctx, 800, 250, 34) }
  // O pé: esmalte com o nome em relevo de ouro.
  ctx.fillStyle = metal
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '104px Anton'
  ctx.fillText(s.top, 512, 956)
  if (!mask) {
    const g = ctx.createRadialGradient(312, 140, 20, 512, 512, 620)
    g.addColorStop(0, 'rgba(255,255,255,.05)')
    g.addColorStop(1, 'rgba(0,0,0,.16)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1024, 1024)
  }
}

function julesFront(ctx, s, locked, mask) {
  // a: rosto limpo no esmalte, nome no pé · b: o Jules inteiro em acid · c: ouro maciço
  if (!locked && /^b\d/.test(s.variant ?? '')) return julesJewel(ctx, s, mask)
  const v = (s.variant ?? 'a')[0]
  const metal = mask ? '#fff' : locked ? (s.lockedMetal ?? METAL.locked) : METAL[s.metal]
  const enamel = mask ? '#000' : locked ? (s.lockedEnamel ?? '#24241f') : s.enamel
  ctx.fillStyle = v === 'c' ? metal : enamel
  ctx.fillRect(0, 0, 1024, 1024)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  if (locked) {
    ctx.fillStyle = metal
    ctx.font = '420px Anton'
    ctx.fillText('?', 512, 560)
  } else {
    // Os olhos dele: tinta sobre o esmalte, ou rebaixados no ouro.
    ctx.fillStyle = mask ? '#000' : v === 'c' ? 'rgba(0,0,0,.55)' : '#12120f'
    for (const x of [512 - 150, 512 + 150]) {
      ctx.beginPath()
      ctx.roundRect(x - 54, 200, 108, 270, 54)
      ctx.fill()
    }
  }
  // O pé: metal gravado (a, c) ou esmalte liso (b).
  if (v !== 'b') {
    ctx.fillStyle = metal
    ctx.fillRect(0, 806, 1024, 218)
    ctx.fillStyle = mask ? '#000' : 'rgba(0,0,0,.42)'
    ctx.font = '100px Anton'
    ctx.fillText(locked ? '?  ?  ?' : s.top, 512, 954)
  }
  if (!mask && !locked && v !== 'c') {
    const g = ctx.createRadialGradient(312, 140, 20, 512, 512, 620)
    g.addColorStop(0, 'rgba(255,255,255,.05)')
    g.addColorStop(1, 'rgba(0,0,0,.16)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1024, v === 'b' ? 1024 : 806)
  }
}
function julesBack(ctx, s, locked, bump) {
  ctx.fillStyle = bump ? '#fff' : locked ? (s.lockedMetal ?? METAL.locked) : METAL[s.metal]
  ctx.fillRect(0, 0, 1024, 1024)
  ctx.fillStyle = bump ? '#000' : 'rgba(0,0,0,.28)'
  ctx.strokeStyle = ctx.fillStyle
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineWidth = 34
  ctx.beginPath()
  ctx.arc(512, 190, 70, 0, 7)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(564, 242, 24, 0, 7)
  ctx.fill()
  ctx.font = '104px Anton'
  ctx.fillText(locked ? '? ? ?' : 'ACHOU O JULES', 512, 420)
  ctx.font = '600 44px "Geist Mono"'
  ctx.fillText((!locked && s.date) || 'CONQUISTA SECRETA', 512, 500)
  ctx.font = '96px Anton'
  ctx.fillText('ONSIDE', 512, 952)
}

export function drawFront(ctx, s, locked, mask) {
  if (s.shape === 'jules') return julesFront(ctx, s, locked, mask)
  const S = 1024
  const c = 512
  // Bloqueada: o metal escuro do design, ou o claro do tema claro
  // (`lockedMetal`, `lockedEnamel`).
  const fg = mask
    ? '#fff'
    : locked
      ? (s.lockedMetal ?? METAL.locked)
      : METAL[s.metal]
  const bg = mask ? '#000' : locked ? (s.lockedEnamel ?? '#24241f') : s.enamel
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = fg
  ctx.strokeStyle = fg
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2
    const r1 = i % 5 ? 478 : 462
    ctx.lineWidth = i % 5 ? 5 : 8
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1)
    ctx.lineTo(c + Math.cos(a) * 500, c + Math.sin(a) * 500)
    ctx.stroke()
  }
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(c, c, 448, 0, 7)
  ctx.stroke()
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(c, c, 330, 0, 7)
  ctx.stroke()
  ctx.font = '62px Anton'
  arcText(ctx, s.top, c, c, 390, false, 7)
  arcText(ctx, 'ONSIDE · 2026', c, c, 390, true, 9)
  star(ctx, c - 390, c, 20)
  star(ctx, c + 390, c, 20)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  if (locked) {
    ctx.font = '300px Anton'
    ctx.fillText('?', c, c + 105)
  } else {
    ctx.font = `${s.num.length > 1 ? 270 : 320}px Anton`
    ctx.fillText(s.num, c, c + 92)
    ctx.font = '58px Anton'
    ctx.fillText(s.unit, c, c + 190)
  }
  if (!mask && !locked) {
    const g = ctx.createRadialGradient(c - 200, c - 260, 20, c, c, 560)
    g.addColorStop(0, 'rgba(255,255,255,.16)')
    g.addColorStop(1, 'rgba(0,0,0,.12)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
  }
}

// Nome de bar vai a 100 caracteres: a linha encolhe até caber na placa e,
// no tamanho mínimo, termina em reticências.
function fitText(ctx, text, x, y, size, min, width) {
  let px = size
  ctx.font = `600 ${px}px "Geist Mono"`
  while (px > min && ctx.measureText(text).width > width) {
    px -= 1
    ctx.font = `600 ${px}px "Geist Mono"`
  }
  let line = text
  while (line.length > 1 && ctx.measureText(line).width > width)
    line = `${line.slice(0, -2).trimEnd()}…`
  ctx.fillText(line, x, y)
}

// O verso gravado: o nome, a data em que saiu e onde. Na bloqueada (ou na
// miniatura, que não tem data), "EM PROGRESSO".
export function drawBack(ctx, s, locked, bump) {
  if (s.shape === 'jules') return julesBack(ctx, s, locked, bump)
  const S = 1024
  const c = 512
  ctx.fillStyle = bump
    ? '#fff'
    : locked
      ? (s.lockedMetal ?? METAL.locked)
      : METAL[s.metal]
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = bump ? '#000' : 'rgba(0,0,0,.28)'
  ctx.strokeStyle = ctx.fillStyle
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(c, c, 448, 0, 7)
  ctx.stroke()
  ctx.lineWidth = 34
  ctx.beginPath()
  ctx.arc(c, 300, 70, 0, 7)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(c + 52, 352, 24, 0, 7)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '96px Anton'
  ctx.fillText(s.name.toUpperCase(), c, 520)
  ctx.font = '600 40px "Geist Mono"'
  ctx.fillText((!locked && s.date) || 'EM PROGRESSO', c, 600)
  fitText(ctx, (!locked && s.where?.toUpperCase()) || '', c, 660, 34, 20, 640)
  ctx.font = '54px Anton'
  arcText(ctx, 'ONSIDE · CONQUISTA', c, c, 392, true, 10)
}
