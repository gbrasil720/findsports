import { Label } from '@findsports_oficial/ui/components/label'
import {
  RadioGroup,
  RadioGroupItem
} from '@findsports_oficial/ui/components/radio-group'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import { toast } from 'sonner'
import { getTeamMessage } from '@/domain/code-confirmation'

type Props = {
  /** Gravado no bar: `true` confirma pela comanda. */
  later: boolean
  /** A oferta gravada, para o recado à equipe. */
  offer: string | null
  isSaving: boolean
  saveError: string | null
  onChange: (later: boolean) => void
}

const OPTIONS = [
  {
    value: 'now',
    title: 'Na hora',
    hint: 'Quem atende digita o código no celular, em Validar código.'
  },
  {
    value: 'later',
    title: 'Depois do jogo, pela comanda',
    hint: 'O garçom anota o código na comanda e você lança até 48 h depois do jogo. Para bar sem celular no balcão.'
  }
] as const

/**
 * Como o bar confere o código do torcedor (WEB-412), dentro do card da oferta
 * da casa: é o código que dá a oferta. "Na hora" é o padrão; "pela comanda" é
 * para o bar que só tem papel no balcão. Trocar grava na hora, sem botão.
 */
export function CodeConfirmationMode({
  later,
  offer,
  isSaving,
  saveError,
  onChange
}: Props) {
  const titleId = useId()
  const message = getTeamMessage(offer)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      toast.success('Recado copiado. Cole no grupo da equipe.')
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie.')
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="mt-6 border-[var(--onside-line)] border-t pt-5"
    >
      <h3 id={titleId} className="onside-label">
        Como o código é conferido
      </h3>
      <RadioGroup
        aria-labelledby={titleId}
        value={later ? 'later' : 'now'}
        onValueChange={(value) => {
          if (!isSaving) onChange(value === 'later')
        }}
        className="mt-2 gap-3"
      >
        {OPTIONS.map((option) => (
          <Label
            key={option.value}
            className="onside-choice-row items-start border-[1.5px] border-[var(--onside-line)] p-3 has-[[data-checked]]:border-[var(--onside-ink)]"
          >
            <RadioGroupItem value={option.value} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block font-semibold">{option.title}</span>
              <span className="mt-0.5 block text-[var(--onside-muted)] text-xs">
                {option.hint}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>

      {saveError ? (
        <p className="onside-field-error" role="alert">
          {saveError}
        </p>
      ) : null}
      <p className="sr-only" role="status">
        {isSaving ? 'Salvando…' : ''}
      </p>

      {later ? (
        <div className="mt-4 space-y-3">
          <p className="onside-kicker">Recado para a equipe</p>
          <p className="whitespace-pre-line border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] p-3 text-sm [overflow-wrap:anywhere]">
            {message}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="onside-btn onside-btn-ink"
            >
              Copiar recado
            </button>
            <button
              type="button"
              onClick={() => printTeamSheet(message)}
              className="onside-btn onside-btn-outline"
            >
              Imprimir meia folha
            </button>
            <Link to="/admin/validate" className="onside-btn onside-btn-ghost">
              Lançar códigos da comanda
              <ArrowRight size={13} color="currentColor" aria-hidden="true" />
            </Link>
          </div>
          <p className="text-[var(--onside-muted)] text-xs">
            A Onside não confere se o cliente estava no bar: o código anotado
            vale como visita, e o combinado com a equipe é seu.
          </p>
        </div>
      ) : null}
    </section>
  )
}

/**
 * Meia folha para colar no balcão. Janela própria, montada com `textContent`
 * (a oferta é texto do dono), para imprimir só o recado.
 */
function printTeamSheet(message: string) {
  const sheet = window.open('', '_blank', 'width=640,height=820')
  if (!sheet) {
    toast.error(
      'O navegador bloqueou a janela. Libere pop-ups e tente de novo.'
    )
    return
  }
  const doc = sheet.document
  doc.title = 'Recado para a equipe — Onside'
  const style = doc.createElement('style')
  style.textContent =
    '@page{size:A5;margin:14mm}body{font-family:system-ui,sans-serif;color:#111}h1{font-size:28px;margin:0 0 16px}p{font-size:20px;line-height:1.4;margin:0 0 12px}small{font-size:12px;color:#555}'
  doc.head.append(style)
  const title = doc.createElement('h1')
  title.textContent = 'Código da Onside? Anote na comanda.'
  doc.body.append(title)
  for (const line of message.split('\n')) {
    const paragraph = doc.createElement('p')
    paragraph.textContent = line
    doc.body.append(paragraph)
  }
  const footer = doc.createElement('small')
  footer.textContent = 'onside.sh'
  doc.body.append(footer)
  sheet.focus()
  sheet.print()
}
