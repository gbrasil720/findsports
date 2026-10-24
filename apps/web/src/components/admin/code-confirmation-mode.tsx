import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { toast } from 'sonner'
import { Botao, IconeBotao, propsBotao } from '@/components/painel/pecas'
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
 * para o bar que só tem papel no balcão. Trocar grava na hora, sem esperar o
 * "Salvar alterações" do espaço.
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
      className="mt-5 flex flex-col gap-3 border-[var(--painel-line)] border-t pt-4"
    >
      <h3 id={titleId} className="font-semibold text-[13px]">
        Como o código é conferido
      </h3>
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="flex flex-col gap-2"
      >
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer flex-col items-start gap-0.5 rounded-[6px] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--painel-line2)] has-checked:shadow-[inset_0_0_0_1.5px_var(--painel-fg)] has-focus-visible:outline-2 has-focus-visible:outline-[var(--painel-acid)] has-disabled:opacity-60"
          >
            <input
              type="radio"
              name={titleId}
              value={option.value}
              checked={(option.value === 'later') === later}
              disabled={isSaving}
              onChange={() => onChange(option.value === 'later')}
              className="sr-only"
            />
            <span className="font-bold text-[13.5px]">{option.title}</span>
            <span className="text-[12.5px] text-[var(--painel-muted)] leading-snug">
              {option.hint}
            </span>
          </label>
        ))}
      </div>

      {saveError ? (
        <p className="text-[13px] text-[var(--painel-live)]" role="alert">
          {saveError}
        </p>
      ) : null}
      <p className="sr-only" role="status">
        {isSaving ? 'Salvando…' : ''}
      </p>

      {later ? (
        <div className="flex flex-col gap-3">
          <p className="font-semibold text-[13px]">Recado para a equipe</p>
          <p className="whitespace-pre-line rounded-[6px] bg-[var(--painel-sub)] p-3 text-[13.5px] [overflow-wrap:anywhere]">
            {message}
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao variante="ink" altura={38} onClick={() => void copy()}>
              Copiar recado
            </Botao>
            <Botao altura={38} onClick={() => printTeamSheet(message)}>
              Imprimir meia folha
            </Botao>
            <Link to="/admin/quem-vai" {...propsBotao({ altura: 38 })}>
              Lançar códigos da comanda
              <IconeBotao nome="right" />
            </Link>
          </div>
          <p className="text-[12.5px] text-[var(--painel-muted)] leading-snug">
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
