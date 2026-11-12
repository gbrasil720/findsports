/**
 * Divide os arquivos de teste entre os shards do CI pelo tempo medido, e não
 * pela contagem de testes do `--shard` do Playwright, que deixava um shard
 * 35% mais lento que a média (e o PR espera o mais lento).
 *
 *   bun shard.ts 3 8                 # arquivos do shard 3 de 8
 *   bun shard.ts --record report.json  # regrava durations.json
 *
 * Arquivo sem medida entra com a mediana. Para medir de novo:
 * `PLAYWRIGHT_JSON_OUTPUT_NAME=report.json bunx playwright test
 * --project=desktop --project=mobile --reporter=json` e o `--record`.
 */
import { Glob } from 'bun'

type Durations = Record<string, number>
const DURATIONS = new URL('./durations.json', import.meta.url)

/** Maior primeiro, cada um no shard mais vazio. */
export function split(files: string[], total: number, known: Durations) {
  const sorted = Object.values(known).sort((a, b) => a - b)
  const median = sorted[sorted.length >> 1] ?? 1
  const cost = (file: string) => known[file] ?? median
  const bins = Array.from({ length: total }, () => ({
    seconds: 0,
    files: [] as string[]
  }))
  const queue = [...files].sort(
    (a, b) => cost(b) - cost(a) || a.localeCompare(b)
  )
  for (const file of queue) {
    const bin = bins.reduce((min, b) => (b.seconds < min.seconds ? b : min))
    bin.files.push(file)
    bin.seconds += cost(file)
  }
  return bins
}

type Suite = {
  file?: string
  suites?: Suite[]
  specs?: { file: string; tests: { results: { duration: number }[] }[] }[]
}

/** Segundos por arquivo num relatório JSON do Playwright. */
export function record(suites: Suite[], into: Durations = {}) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests)
        for (const result of test.results)
          into[`tests/${spec.file}`] =
            (into[`tests/${spec.file}`] ?? 0) + result.duration / 1000
    record(suite.suites ?? [], into)
  }
  return into
}

if (import.meta.main) {
  const [a, b] = process.argv.slice(2)
  if (a === '--record' && b) {
    const measured = record((await Bun.file(b).json()).suites)
    const rounded = Object.fromEntries(
      Object.entries(measured)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([file, seconds]) => [file, Math.round(seconds)])
    )
    await Bun.write(DURATIONS, `${JSON.stringify(rounded, null, 2)}\n`)
  } else {
    const files = [
      ...new Glob('tests/**/*.e2e.ts').scanSync(import.meta.dir)
    ].filter((file) => !file.endsWith('.serial.e2e.ts'))
    const bin = split(files, Number(b), await Bun.file(DURATIONS).json())[
      Number(a) - 1
    ]
    // Sem arquivo o Playwright rodaria a suíte inteira.
    if (!bin?.files.length) throw new Error(`shard ${a}/${b} vazio`)
    console.log(bin.files.join(' '))
  }
}
