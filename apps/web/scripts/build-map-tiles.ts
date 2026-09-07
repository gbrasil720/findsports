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
 * 2. Sobe o `.pmtiles` para o Cloudflare R2, com o nome carregando a data do
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
 * - `CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET`
 *   no ambiente (estão em `apps/web/.env`). São credenciais de escrita, e não
 *   viajam para o navegador: quem serve os tiles é a URL pública do bucket.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

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
 * O zoom máximo que a UI alcança. A câmera enquadra pela caixa do raio
 * (`limitesDoRaio`) e para em 15, que é o teto declarado em `onside-map.tsx` —
 * o mais perto que ela chega é no raio de 1 km num quadro pequeno. Acima disso
 * o MapLibre repetiria o tile de z15 esticado, em vez de pedir um que não
 * existe.
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

const faltando = [
  'CF_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET'
].filter((nome) => !process.env[nome])
if (faltando.length > 0) {
  console.error(`\nFaltam variáveis de ambiente: ${faltando.join(', ')}`)
  process.exit(1)
}

const { size } = statSync(destino)
console.log(`\nsubindo ${(size / 1e9).toFixed(2)} GB para ${nomeNoBucket}…`)

const r2 = new Bun.S3Client({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
})

await r2.write(nomeNoBucket, Bun.file(destino), {
  type: 'application/vnd.pmtiles',
  // Imutável: o nome carrega a data do build, então um rebuild vira outra URL
  // em vez de precisar invalidar cache.
  acl: undefined,
  partSize: 64 * 1024 * 1024,
  queueSize: 4,
  retry: 3
})

const enviado = await r2.file(nomeNoBucket).stat()
if (enviado.size !== size) {
  console.error(
    `\nO arquivo no bucket tem ${enviado.size} bytes e o local tem ${size}. Refaça o envio.`
  )
  process.exit(1)
}

console.log(`\npronto — ${enviado.size} bytes conferidos no bucket.`)
console.log(`\nVITE_MAP_TILES_URL="<url-pública-do-bucket>/${nomeNoBucket}"`)
console.log(
  '\nTroque a variável na Vercel e no .env local, faça o deploy, confirme o' +
    ' mapa no ar e só então apague o arquivo antigo do bucket.'
)
