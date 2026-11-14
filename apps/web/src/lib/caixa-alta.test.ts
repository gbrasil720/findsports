import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

// WEB-135: caixa alta é `--caixa: "ss20"` (ou a classe `caixa-alta`), nunca
// `text-transform`, que entrega o texto em maiúsculas ao leitor de tela.
// Regra e motivo no fim de `src/index.css`.
const SRC = new URL('..', import.meta.url).pathname

const PROIBIDO: Array<[string, RegExp]> = [
  ['**/*.css', /text-transform\s*:/],
  ['**/*.tsx', /textTransform\s*:|["'`\s]uppercase["'`\s]/]
]

describe('caixa alta pela fonte', () => {
  for (const [pattern, regex] of PROIBIDO) {
    test(`nenhum ${pattern} usa text-transform`, async () => {
      const achados: string[] = []
      for await (const file of new Glob(pattern).scan(SRC)) {
        const lines = (await Bun.file(SRC + file).text()).split('\n')
        lines.forEach((line, i) => {
          const comentario = /^\s*(\/\/|\/\*|\*)/.test(line)
          if (!comentario && regex.test(line))
            achados.push(`${file}:${i + 1}: ${line.trim()}`)
        })
      }
      expect(achados).toEqual([])
    })
  }
})
