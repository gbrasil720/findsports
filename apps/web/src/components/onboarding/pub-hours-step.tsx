import type {
  DayHours,
  OpeningHours
} from '@findsports_oficial/api/lib/opening-hours'
import { DIA_PADRAO } from '@/components/painel/espaco-rascunho'

/** Segunda primeiro, como se lê a semana de um bar; o índice é o do servidor. */
const SEMANA = [
  [1, 'SEG', 'Segunda'],
  [2, 'TER', 'Terça'],
  [3, 'QUA', 'Quarta'],
  [4, 'QUI', 'Quinta'],
  [5, 'SEX', 'Sexta'],
  [6, 'SÁB', 'Sábado'],
  [0, 'DOM', 'Domingo']
] as const

const faixa = (opens: string, closes: string) => ({ opens, closes })

/** Os atalhos do desenho; a semana vai de domingo (0) a sábado. */
const ATALHOS: [string, (atual: OpeningHours) => OpeningHours][] = [
  [
    'Todo dia igual',
    (atual) => Array(7).fill(atual[1] ?? atual.find(Boolean) ?? DIA_PADRAO)
  ],
  [
    'Fim de semana diferente',
    () => [
      faixa('12:00', '22:00'),
      faixa('17:00', '00:00'),
      faixa('17:00', '00:00'),
      faixa('17:00', '00:00'),
      faixa('17:00', '00:00'),
      faixa('17:00', '02:00'),
      faixa('12:00', '02:00')
    ]
  ],
  ['Só à noite, 18:00 às 02:00', () => Array(7).fill(faixa('18:00', '02:00'))]
]

const mesma = (a: OpeningHours, b: OpeningHours) =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * "Horário" do cadastro do bar: a mesma semana de Meu espaço
 * (`pub.updateOpeningHours`), com atalhos para não digitar sete dias. A
 * validação é a do painel (`horario` em `espaco-rascunho.ts`).
 */
export function PubHoursStep({
  hours,
  onChange
}: {
  hours: OpeningHours
  onChange: (hours: OpeningHours) => void
}) {
  const mudar = (dia: number, nova: DayHours) =>
    onChange(hours.map((d, i) => (i === dia ? nova : d)))
  return (
    <>
      <fieldset className="ob-cg ob-quick">
        <legend className="sr-only">Atalhos</legend>
        <div className="ob-chips">
          {ATALHOS.map(([rotulo, montar]) => {
            const semana = montar(hours)
            return (
              <button
                key={rotulo}
                type="button"
                className="ob-tchip"
                aria-pressed={hours.some(Boolean) && mesma(semana, hours)}
                onClick={() => onChange(semana)}
              >
                {rotulo}
              </button>
            )
          })}
        </div>
      </fieldset>
      <ul className="ob-hrs">
        {SEMANA.map(([dia, curto, nome]) => {
          const d = hours[dia] ?? null
          return (
            <li key={dia} className={d ? undefined : 'off'}>
              <span className="d">{curto}</span>
              <button
                type="button"
                role="switch"
                className="ob-tg"
                aria-checked={Boolean(d)}
                aria-label={`Aberto ${dia === 6 || dia === 0 ? 'no' : 'na'} ${nome.toLowerCase()}`}
                onClick={() =>
                  // Religado, volta à faixa do primeiro dia aberto.
                  mudar(dia, d ? null : (hours.find(Boolean) ?? DIA_PADRAO))
                }
              />
              {d ? (
                <span className="tt">
                  <input
                    type="time"
                    value={d.opens}
                    aria-label={`${nome} abre`}
                    onChange={(e) =>
                      mudar(dia, { ...d, opens: e.target.value })
                    }
                  />
                  –
                  <input
                    type="time"
                    value={d.closes}
                    aria-label={`${nome} fecha`}
                    onChange={(e) =>
                      mudar(dia, { ...d, closes: e.target.value })
                    }
                  />
                </span>
              ) : (
                <span className="closed">fechado</span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="ob-note">
        Fecha depois da meia-noite? Use a hora do dia seguinte, como 17:00 às
        02:00.
      </p>
    </>
  )
}
