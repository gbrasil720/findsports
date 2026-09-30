/**
 * Refaz o geocoding dos bares com as regras atuais (`countrycodes=br`,
 * `ruaConfere`, cidade conferida — WEB-73 e WEB-115).
 *
 * Bar cadastrado antes delas pode ter a coordenada de uma rua homônima em
 * outro bairro, cidade ou país, e nada no app avisa: o pino só aparece longe.
 * O geocoding roda de novo apenas quando o dono edita o endereço.
 *
 * Uso (em `packages/api`):
 *
 *   NODE_ENV=development bun run bars:regeocode            # só lista
 *   NODE_ENV=development bun run bars:regeocode -- --apply # grava
 *
 * Sem `--apply` não escreve nada. Idempotente: depois de aplicado, o bar
 * passa a bater com o geocoding e some da lista. O banco vem do
 * `db-resolver` — em `development`, sempre o Docker local.
 *
 * Endereço que o geocoding atual recusa aparece listado e fica como está:
 * apagar a coordenada tiraria o bar do mapa, e corrigir o endereço é com o
 * dono. Falha do provedor (chave, rede) interrompe — rodar de novo retoma.
 */

import { db, eq } from '@findsports_oficial/db'
import { bar } from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'

import { type Coordenadas, geocodeAddress } from '../src/lib/geocode-address'

/** Abaixo disto é o mesmo ponto: arredondamento ou ajuste fino da base. */
const TOLERANCIA_METROS = 25
/** O tier grátis da LocationIQ aceita 2 consultas por segundo. */
const PAUSA_ENTRE_BARES_MS = 600

export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const rad = (grau: string) => (Number(grau) * Math.PI) / 180
  const dLat = rad(b.latitude) - rad(a.latitude)
  const dLon = rad(b.longitude) - rad(a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

async function main(aplicar: boolean) {
  const apiKey = process.env.LOCATIONIQ_API_KEY
  if (!apiKey) throw new Error('LOCATIONIQ_API_KEY ausente.')

  const bares = await db
    .select({
      id: bar.id,
      name: bar.name,
      address: bar.address,
      neighborhood: bar.neighborhood,
      city: bar.city,
      latitude: bar.latitude,
      longitude: bar.longitude
    })
    .from(bar)
    .orderBy(bar.createdAt)

  let divergentes = 0
  let recusados = 0

  for (const [i, b] of bares.entries()) {
    if (i > 0) await Bun.sleep(PAUSA_ENTRE_BARES_MS)
    const rotulo = `${b.id} "${b.name}" — ${b.address}, ${b.neighborhood}, ${b.city}`

    let atual: Coordenadas
    try {
      atual = await geocodeAddress(
        { street: b.address, city: b.city, neighborhood: b.neighborhood },
        apiKey
      )
    } catch (err) {
      if (err instanceof TRPCError && err.code === 'UNPROCESSABLE_CONTENT') {
        recusados++
        console.log(`RECUSADO  ${rotulo}\n          ${err.message}`)
        continue
      }
      throw err
    }

    const metros = distanciaMetros(b, atual)
    if (metros <= TOLERANCIA_METROS) continue

    divergentes++
    console.log(
      `${aplicar ? 'ATUALIZADO' : 'DIVERGE'}  ${rotulo}\n          ${b.latitude},${b.longitude} -> ${atual.latitude},${atual.longitude} (${Math.round(metros)} m)`
    )
    if (aplicar) {
      await db
        .update(bar)
        .set({ latitude: atual.latitude, longitude: atual.longitude })
        .where(eq(bar.id, b.id))
    }
  }

  console.log(
    `\n${bares.length} bares; ${divergentes} ${aplicar ? 'atualizados' : 'divergem'}; ${recusados} recusados pelo geocoding atual.`
  )
  if (!aplicar && divergentes > 0) console.log('Rode com --apply para gravar.')
}

if (import.meta.main) {
  await main(process.argv.includes('--apply'))
  process.exit(0)
}
