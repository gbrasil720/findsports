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

export function drawFront(ctx, s, locked, mask) {
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
