/*
 * Gera a taça, a mascote da busca com IA, a partir de `stage.ts` e das formas
 * em `shapes.json` (validadas pelo `open-bot-avatar` no modo estrito):
 *
 * - `assets/mascot/stage.html`: o palco num arquivo só, com o
 *   `open-bot-avatar` embutido, que a WebView abre sem rede;
 * - `components/ai/mascot-still.ts`: a taça parada em SVG, para os tamanhos
 *   pequenos (o ladrilho do cabeçalho), onde uma WebView pesaria;
 * - `apps/web/src/components/torcedor/taca-still.ts`: a mesma taça para o
 *   cartão "Me avise" do web (`AppChegando`), decorativa (sem título nem
 *   `role`, com `aria-hidden`).
 *
 *   bun apps/mobile/scripts/mascot/generate.ts
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderAvatarSvg, validateAvatar } from 'open-bot-avatar'
import SHAPES from './shapes.json'

const here = import.meta.dir
const app = join(here, '../..')

for (const [id, def] of Object.entries(SHAPES)) {
  const result = validateAvatar(def)
  if (!result.ok) throw new Error(`${id}: ${result.errors.join('; ')}`)
}

const built = await Bun.build({
  entrypoints: [join(here, 'stage.ts')],
  format: 'iife',
  minify: true,
  target: 'browser'
})
if (!built.success)
  throw new AggregateError(built.logs, 'stage.ts não compilou')
const script = await built.outputs[0].text()

const css = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:transparent;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
#stage{position:fixed;inset:0;--cy:60%}
#wrap{position:absolute;left:50%;top:var(--cy);width:var(--b);height:var(--b);margin:calc(var(--b) / -2) 0 0 calc(var(--b) / -2);will-change:transform;font-size:calc(var(--b) * .1)}
#bot{width:100%;height:100%}
#shadow{position:absolute;left:50%;top:calc(var(--cy) + var(--b) * .36);width:calc(var(--b) * .6);height:calc(var(--b) * .075);border-radius:50%;background:var(--floor-shadow);pointer-events:none}
#fx{position:absolute;inset:0;pointer-events:none;font-size:calc(var(--b) * .1)}
.glow{position:absolute;left:50%;top:var(--cy);width:calc(var(--b) * 1.9);height:calc(var(--b) * 1.9);margin:calc(var(--b) * -.95) 0 0 calc(var(--b) * -.95);border-radius:50%;background:radial-gradient(closest-side,rgba(201,241,53,.22),rgba(201,241,53,0));opacity:0;transition:opacity .35s;pointer-events:none}
.glow.on{opacity:1;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{50%{transform:scale(1.08);opacity:.7}}
.orbit{position:absolute;left:50%;top:var(--cy);width:calc(var(--b) * 1.3);height:calc(var(--b) * 1.3);margin:calc(var(--b) * -.65) 0 0 calc(var(--b) * -.65);container-type:inline-size;pointer-events:none;opacity:0;transform:scale(.35);transition:opacity .22s,transform .5s cubic-bezier(.3,1.5,.5,1)}
.orbit.on{opacity:1;transform:scale(1)}
.orbit b{position:absolute;left:50%;top:50%;width:calc(var(--b) * .044);height:calc(var(--b) * .044);margin:calc(var(--b) * -.022);border-radius:50%;background:var(--accent);scale:.7;opacity:.5}
.orbit.on b{animation:chase 1.2s linear infinite}
@keyframes chase{0%,34%,100%{scale:.7;opacity:.5}9%{scale:1.9;opacity:1}}
.live{position:absolute;left:49%;top:20%;display:flex;align-items:center;gap:.25em;font:600 .54em ui-monospace,Menlo,monospace;letter-spacing:.04em;color:var(--on-body);opacity:0;transform:scale(.6);transition:opacity .18s,transform .28s cubic-bezier(.3,1.6,.5,1);white-space:nowrap}
.live.on{opacity:1;transform:scale(1)}
.live i{width:.62em;height:.62em;border-radius:50%;background:#e8320c;animation:blink 1s steps(2,jump-none) infinite}
@keyframes blink{50%{opacity:.25}}
.stamp{position:absolute;left:72.5%;top:63.5%;width:29%;aspect-ratio:1;border-radius:50%;border:.16em solid #e8320c;color:#e8320c;display:grid;place-items:center;font:900 1em Impact,'Arial Narrow',sans-serif;letter-spacing:.04em;transform:translate(-50%,-50%) rotate(-14deg) scale(2.6);opacity:0}
.pin{position:absolute;top:calc(var(--cy) + var(--b) * .36);width:calc(var(--b) * .15);aspect-ratio:1;border-radius:50% 50% 50% 0;background:var(--fg);transform-origin:0 100%;transition:scale .3s cubic-bezier(.3,1.6,.5,1),background .3s}
.pin::after{content:'';position:absolute;inset:30%;border-radius:50%;background:var(--bg-dot,#12120f)}
.pin.best{scale:1.5;background:var(--accent)}
.ripple{position:absolute;top:calc(var(--cy) + var(--b) * .36);width:calc(var(--b) * .5);height:calc(var(--b) * .11);border-radius:50%;border:2px solid var(--accent)}
.wave{position:absolute;width:calc(var(--b) * .2);aspect-ratio:1;border-radius:50%;border:3px solid transparent;border-right-color:var(--accent)}
.bit{position:absolute}
.txt{position:absolute;font:600 1em ui-monospace,Menlo,monospace;color:var(--fg);line-height:1}
.txt.big{font:900 2.1em Impact,'Arial Narrow',sans-serif;color:var(--accent);transform:translate(-50%,-50%)}
.card{position:absolute;width:calc(var(--b) * .17);aspect-ratio:5/7;border-radius:14%;background:#e8320c;box-shadow:3px 3px 0 rgba(0,0,0,.45)}
.chip{position:absolute;padding:.3em .7em;border-radius:999px;background:var(--fg);color:var(--chip-text,#12120f);font:600 .56em ui-monospace,Menlo,monospace;white-space:nowrap}
.sig{position:absolute;width:calc(var(--b) * .34);aspect-ratio:1.25;display:flex;align-items:flex-end;justify-content:center;gap:12%}
.sig b{width:18%;border-radius:3px;background:var(--fg);transition:opacity .2s}
.sig b:nth-child(1){height:34%}.sig b:nth-child(2){height:64%}.sig b:nth-child(3){height:96%}
.sig u{position:absolute;left:-8%;right:-8%;top:50%;height:3px;border-radius:2px;background:#e8320c;transform:rotate(-45deg) scaleX(0);transition:transform .22s cubic-bezier(.3,1.5,.5,1)}
.dizzy{position:absolute;width:calc(var(--b) * .6);aspect-ratio:3}
.dizzy i{position:absolute;left:50%;top:50%;width:9%;aspect-ratio:1;margin:-4.5%;border-radius:50%;background:var(--fg);animation:dz 1.1s linear infinite}
.dizzy i:nth-child(2){animation-delay:-.37s}.dizzy i:nth-child(3){animation-delay:-.73s}
html.reduce .orbit.on b,html.reduce .glow.on,html.reduce .live i,html.reduce .dizzy i{animation:none}
html.reduce .orbit,html.reduce .live,html.reduce .sig u,html.reduce .pin{transition:none}
@keyframes dz{0%{transform:translate(340%,0) scale(1.1)}25%{transform:translate(0,110%) scale(1.3)}50%{transform:translate(-340%,0) scale(1.1)}75%{transform:translate(0,-110%) scale(.7)}100%{transform:translate(340%,0) scale(1.1)}}
`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>${css}</style></head><body>
<div id="stage"><div class="glow" id="glow"></div><div class="orbit" id="orbit"></div><div id="shadow"></div><div id="fx"></div><div id="wrap"><div id="bot"></div><div class="live" id="live"><i></i>AO VIVO</div><div class="stamp" id="stamp">VOU</div></div></div>
<script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`
await writeFile(join(app, 'assets/mascot/stage.html'), html)

// O ladrilho do cabeçalho é sempre escuro: taça acid, olhos tinta.
const still = renderAvatarSvg(SHAPES.taca as never, {
  color: '#c9f135',
  eyeColor: '#12120f'
})
await writeFile(
  join(app, 'components/ai/mascot-still.ts'),
  `// Gerado por scripts/mascot/generate.ts: não edite à mão.\nexport const TACA_SVG = ${JSON.stringify(still)}\n`
)
const webStill = join(app, '../web/src/components/torcedor/taca-still.ts')
const decorative = still
  .replace(' role="img" aria-label="Taça"', ' aria-hidden="true"')
  .replace('<title>Taça</title>', '')
await writeFile(
  webStill,
  `// Gerado por apps/mobile/scripts/mascot/generate.ts (a taça parada do app,\n// \`apps/mobile/components/ai/mascot-still.ts\`): não edite à mão.\nexport const TACA_SVG = ${JSON.stringify(decorative)}\n`
)
// No formato do Biome, para o arquivo gerado não mudar a cada `bun run check`.
Bun.spawnSync([
  'bunx',
  'biome',
  'format',
  '--write',
  join(app, 'components/ai/mascot-still.ts'),
  webStill
])
console.log(
  `stage.html ${Math.round(html.length / 1024)} KB, mascot-still.ts ${Math.round(still.length / 1024)} KB`
)
