import { Link } from '@tanstack/react-router'
import AlertCircle from 'reicon-react/icons/AlertCircle'

/**
 * A camada que só o dono do bar enxerga.
 *
 * O perfil público é o único lugar onde o dono vê o próprio cadastro do jeito
 * que o torcedor vê — e portanto o único lugar onde a falta de foto, de
 * WhatsApp ou de agenda aparece como o buraco que é. O painel mostra campos
 * vazios; aqui ele vê o que esse vazio custa.
 *
 * Nada disso chega ao torcedor: um bar constrangido na frente do cliente
 * converte menos, não mais.
 */
type NudgeProps = {
  children: string
  action?: { label: string; to: string; hash?: string }
}

/** Aviso pontual, ancorado no buraco que ele descreve. */
export function OwnerNudge({ children, action }: NudgeProps) {
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2 border-[1.5px] border-[var(--onside-line)] border-dashed px-3 py-2"
      role="status"
    >
      <AlertCircle
        size={14}
        className="shrink-0 text-[var(--onside-muted)]"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 text-[var(--onside-muted)] text-xs">
        {children}
      </p>
      {action && (
        <Link
          to={action.to}
          hash={action.hash}
          className="onside-btn onside-btn-outline onside-btn-sm shrink-0"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
