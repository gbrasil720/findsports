import {
  ROUTINE_STEPS,
  type Routine,
  WANTS,
  type Want
} from '@findsports_oficial/api/lib/pub-routine'
import { Check } from '@/components/landing/v3/icons'

const QUESTIONS = {
  games: {
    title: 'Quantos jogos você passa por mês?',
    hint: 'Some tudo: Brasileirão, Champions, Libertadores, NBA…',
    unit: 'jogos por mês',
    show: (v: number) => String(v)
  },
  spend: {
    title: 'Quanto cada cliente gasta numa noite de jogo?',
    hint: 'Comida e bebida, em média por pessoa',
    unit: 'reais por pessoa',
    show: (v: number) => `R$ ${v}`
  }
} as const

function Stepper({
  kind,
  value,
  onChange
}: {
  kind: keyof typeof QUESTIONS
  value: number
  onChange: (value: number) => void
}) {
  const q = QUESTIONS[kind]
  const { step, min, max } = ROUTINE_STEPS[kind]
  return (
    <div className="ob-sw">
      <span>
        <b>{q.title}</b>
        <small>{q.hint}</small>
      </span>
      <span className="ob-stepper">
        <button
          type="button"
          aria-label={`Menos: ${q.unit}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </button>
        <output aria-live="polite">{q.show(value)}</output>
        <button
          type="button"
          aria-label={`Mais: ${q.unit}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </button>
      </span>
    </div>
  )
}

/**
 * "Sua rotina" do cadastro do bar (WEB-501): dois números e o que o dono
 * espera da Onside. Só recomenda o plano do passo seguinte; nada disso é
 * gravado.
 */
export function PubRoutineStep({
  routine,
  onChange
}: {
  routine: Routine
  onChange: (routine: Routine) => void
}) {
  const toggle = (want: Want) =>
    onChange({
      ...routine,
      wants: routine.wants.includes(want)
        ? routine.wants.filter((w) => w !== want)
        : [...routine.wants, want]
    })
  return (
    <>
      <div className="ob-calc">
        <Stepper
          kind="games"
          value={routine.games}
          onChange={(games) => onChange({ ...routine, games })}
        />
        <Stepper
          kind="spend"
          value={routine.spend}
          onChange={(spend) => onChange({ ...routine, spend })}
        />
      </div>
      <fieldset className="ob-cg">
        <legend>O que você espera da Onside? · marque quantos quiser</legend>
        <div className="ob-chips">
          {WANTS.map((want) => {
            const on = routine.wants.includes(want.id)
            return (
              <button
                key={want.id}
                type="button"
                className="ob-tchip"
                aria-pressed={on}
                onClick={() => toggle(want.id)}
              >
                {on ? <Check size={15} /> : null}
                {want.label}
              </button>
            )
          })}
        </div>
      </fieldset>
    </>
  )
}
