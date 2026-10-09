import { useId, useState } from 'react'

/**
 * Data e hora com máscara `dd/mm/aaaa hh:mm` (WEB-306).
 *
 * O `datetime-local` nativo mostra o formato do idioma do navegador: num Chrome
 * em inglês o bar via mm/dd/yyyy e "09:30 PM". Aqui o formato é o mesmo para
 * todo mundo, e o valor que sai continua sendo o do campo nativo
 * (`aaaa-mm-ddThh:mm`, hora local).
 */
const DIGITS = 12 // ddmmaaaahhmm
export const DATE_TIME_PLACEHOLDER = 'dd/mm/aaaa hh:mm'

/** Posições em que começam dia, mês e hora: os trechos de dois dígitos. */
const TWO_DIGIT_STARTS = [0, 2, 8]

/**
 * Aplica a máscara ao que foi digitado ou colado. Os separadores entram
 * sozinhos e só depois do dígito seguinte, então apagar nunca trava num "/".
 *
 * `closeLone` completa com zero o trecho de um dígito seguido de separador
 * ("8/10/2026" → "08/10/2026"). Só vale para o que chega pelo fim do campo —
 * colar e digitar. No meio do texto, apagar um dígito do dia deixa "0/10/2026"
 * e completar ali trocaria o dia por "00".
 */
export function maskDateTime(raw: string, closeLone = true): string {
  const parts = raw.split(/\D+/)
  let digits = ''
  parts.forEach((part, index) => {
    const lone =
      closeLone &&
      part.length === 1 &&
      index < parts.length - 1 &&
      TWO_DIGIT_STARTS.includes(digits.length)
    digits += lone ? `0${part}` : part
  })
  digits = digits.slice(0, DIGITS)

  let masked = digits.slice(0, 2)
  if (digits.length > 2) masked += `/${digits.slice(2, 4)}`
  if (digits.length > 4) masked += `/${digits.slice(4, 8)}`
  if (digits.length > 8) masked += ` ${digits.slice(8, 10)}`
  if (digits.length > 10) masked += `:${digits.slice(10, 12)}`
  return masked
}

export type DateTimeProblem = 'incomplete' | 'date' | 'time'

/**
 * Texto do campo → valor de `datetime-local` (`aaaa-mm-ddThh:mm`). Vazio é
 * `{ value: '' }`. O problema aparece assim que dá para saber: a data é
 * conferida ao fechar os oito dígitos, a hora ao fechar os dois dela.
 */
export function parseDateTime(
  text: string
):
  | { value: string; problem?: undefined }
  | { value?: undefined; problem: DateTimeProblem } {
  const digits = text.replace(/\D/g, '')
  if (!digits) return { value: '' }

  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  const hour = digits.slice(8, 10)
  const minute = digits.slice(10, 12)

  if (year.length === 4) {
    // `Date` rola 31/02 para março; se voltou outra data, ela não existe.
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    const exists =
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day)
    if (!exists) return { problem: 'date' }
  }
  if (hour.length === 2 && Number(hour) > 23) return { problem: 'time' }
  if (minute.length === 2 && Number(minute) > 59) return { problem: 'time' }
  if (digits.length < DIGITS) return { problem: 'incomplete' }

  return { value: `${year}-${month}-${day}T${hour}:${minute}` }
}

/** Valor de `datetime-local` → texto do campo. Vazio continua vazio. */
export function formatDateTime(datetimeLocal: string): string {
  const [date = '', time = ''] = datetimeLocal.split('T')
  const [year = '', month = '', day = ''] = date.split('-')
  return maskDateTime(`${day}${month}${year}${time.slice(0, 5)}`, false)
}

const PROBLEM_MESSAGE: Record<DateTimeProblem, string> = {
  incomplete: `Complete a data e o horário: ${DATE_TIME_PLACEHOLDER}.`,
  date: 'Essa data não existe. Confira o dia e o mês.',
  time: 'O horário vai de 00:00 a 23:59.'
}

type Props = {
  label: string
  /** Texto com máscara, como está no campo — não o valor convertido. */
  value: string
  onChange: (text: string) => void
  required?: boolean
  /** Erro que só o formulário conhece (ex.: término antes do início). */
  error?: string
}

export function DateTimeInput({
  label,
  value,
  onChange,
  required,
  error
}: Props) {
  const ids = useId()
  const hintId = `${ids}-hint`
  const errorId = `${ids}-error`
  // "Incompleto" só vira erro ao sair do campo: antes disso é só digitação.
  const [left, setLeft] = useState(false)

  const { problem } = parseDateTime(value)
  const message =
    problem && (problem !== 'incomplete' || left)
      ? PROBLEM_MESSAGE[problem]
      : error

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const caret = input.selectionStart ?? input.value.length
    const atEnd = caret === input.value.length
    const next = maskDateTime(input.value, atEnd)

    if (!atEnd) {
      // Edição no meio do texto: o cursor fica depois do mesmo dígito, em vez
      // de pular para o fim quando a máscara reescreve o valor.
      // ponytail: a máscara reencaixa os dígitos em sequência, sem editar por
      // trecho — inserir um dígito no meio de um campo cheio empurra o resto.
      // Se isso incomodar, o próximo passo é um campo por trecho.
      let digitsLeft = input.value.slice(0, caret).replace(/\D/g, '').length
      let position = 0
      while (digitsLeft > 0 && position < next.length) {
        if (/\d/.test(next.charAt(position))) digitsLeft--
        position++
      }
      input.value = next
      input.setSelectionRange(position, position)
    }
    onChange(next)
  }

  return (
    <div>
      <label className="block">
        <span className="onside-label mb-1.5 block">{label}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={handleChange}
          onBlur={() => setLeft(true)}
          className="onside-input font-semibold"
          placeholder={DATE_TIME_PLACEHOLDER}
          required={required}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${hintId} ${errorId}` : hintId}
        />
      </label>
      <p id={hintId} className="mt-1 text-[10px] text-[var(--onside-muted)]">
        Dia, mês, ano e horário de 24 h: {DATE_TIME_PLACEHOLDER}.
      </p>
      {message ? (
        <p id={errorId} className="onside-field-error" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  )
}
