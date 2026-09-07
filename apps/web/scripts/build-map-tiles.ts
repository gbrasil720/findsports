/**
 * Reconstrói e publica o basemap (WEB-73).
 *
 *     bun apps/web/scripts/build-map-tiles.ts [--build AAAAMMDD] [--dry-run]
 *
 * Não é um serviço: é um arquivo que envelhece devagar. Rode quando o mapa
 * estiver desatualizado o suficiente para incomodar — na prática, uma vez por
 * trimestre — ou quando alguém reclamar de rua nova que não aparece.
 *
 * ## O que ele faz
 *
 * 1. Corta o planeta do Protomaps na bbox do Brasil, sem baixar o planeta: o
 *    `pmtiles extract` usa HTTP Range e traz só as faixas de bytes da região.
 * 2. Sobe o `.pmtiles` para o Vercel Blob, com o nome carregando a data do
 *    build.
 * 3. Imprime a URL. **Trocar `VITE_MAP_TILES_URL` é passo manual**, na Vercel e
 *    no `.env` local.
 *
 * O nome versionado é de propósito: o arquivo vai com `max-age` de um ano, e
 * um build novo tem que virar uma URL nova em vez de tentar invalidar cache de
 * CDN. O arquivo antigo pode ser apagado depois que o deploy com a URL nova
 * estiver no ar.
 *
 * ## O que NÃO muda junto
 *
 * Abrir cidade nova (`launch.pub_cities`) não exige rebuild: a bbox cobre o
 * Brasil inteiro, e ela governa onde o **torcedor** abre o app, não onde o
 * **bar** se cadastra. As duas coisas não têm relação.
 *
 * ## Requisitos
 *
 * - `pmtiles` no PATH (`brew install pmtiles`), só para rodar este script.
 * - `BLOB_READ_WRITE_TOKEN` no ambiente (está em `apps/web/.env`).
 */

import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { put } from '@vercel/blob'

/**
 * Brasil inteiro, com folga de alguns décimos de grau nas bordas.
 *
 * A bbox cobre onde um **torcedor** pode abrir o app, e não onde um bar pode
 * se cadastrar. Recortar na região de operação economizaria uns centavos de
 * armazenamento e devolveria tile em branco para quem abrisse o `/dashboard`
 * em Salvador ou em Brasília — regressão em relação ao Google, que servia o
 * planeta.
 *
 * `min_lon,min_lat,max_lon,max_lat`.
 */
const BBOX = '-74.1,-33.9,-34.7,5.4'

/**
 * O zoom máximo que a UI alcança sai de `getRadiusZoom` (`domain/discovery`):
 * 15 no raio de 1 km. Acima disso o MapLibre repete o tile de z15 esticado, em
 * vez de pedir um que não existe.
 */
const MAXZOOM = 15

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const buildArg = process.argv.find((a) => a.startsWith('--build='))
/** Builds do Protomaps são diários, nomeados `AAAAMMDD.pmtiles`. */
const build =
  buildArg?.split('=')[1] ??
  new Date().toISOString().slice(0, 10).replace(/-/g, '')

const origem = `https://build.protomaps.com/${build}.pmtiles`
const destino = path.join(process.cwd(), `onside-br-${build}.pmtiles`)
const nomeNoBucket = `maps/onside-br-${build}.pmtiles`

console.log(`origem   ${origem}`)
console.log(`bbox     ${BBOX} (maxzoom ${MAXZOOM})`)
console.log(`destino  ${destino}`)

const extrair = spawnSync(
  'pmtiles',
  [
    'extract',
    origem,
    destino,
    `--bbox=${BBOX}`,
    `--maxzoom=${MAXZOOM}`,
    '--download-threads=8',
    ...(dryRun ? ['--dry-run'] : [])
  ],
  { stdio: 'inherit' }
)

if (extrair.status !== 0) {
  console.error(
    '\npmtiles extract falhou. `brew install pmtiles` se o comando não existe;' +
      ' confira a data do build se foi 404 — eles são diários e os antigos saem do ar.'
  )
  process.exit(1)
}

if (dryRun) {
  console.log('\n--dry-run: nada foi baixado nem publicado.')
  process.exit(0)
}

if (!existsSync(destino)) {
  console.error(`\n${destino} não foi criado.`)
  process.exit(1)
}

const { size } = statSync(destino)
console.log(`\nsubindo ${(size / 1e9).toFixed(2)} GB para ${nomeNoBucket}…`)

const { url } = await put(nomeNoBucket, createReadStream(destino), {
  access: 'public',
  contentType: 'application/vnd.pmtiles',
  addRandomSuffix: false,
  allowOverwrite: true,
  multipart: true,
  // Imutável: o nome carrega a data do build.
  cacheControlMaxAge: 31_536_000
})

console.log(`\npronto.\n\nVITE_MAP_TILES_URL="${url}"`)
console.log(
  '\nTroque a variável na Vercel e no .env local, faça o deploy, confirme o' +
    ' mapa no ar e só então apague o arquivo antigo do bucket.'
)
