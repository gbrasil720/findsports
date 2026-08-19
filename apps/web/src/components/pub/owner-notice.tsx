import { Link } from '@tanstack/react-router'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import Edit from 'reicon-react/icons/Edit'
import Eye from 'reicon-react/icons/Eye'

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
export function OwnerPreviewBanner() {
  return (
    <div className="onside-callout onside-callout-stone" role="status">
      <Eye
        size={18}
        color="currentColor"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">
          Você está vendo seu perfil como o torcedor vê
        </p>
        <p className="text-sm opacity-90">
          Os avisos desta página aparecem só para você.
        </p>
      </div>
      <Link
        to="/admin"
        className="onside-btn onside-btn-ink min-h-11 shrink-0 px-4 text-xs"
      >
        <Edit size={14} color="currentColor" aria-hidden="true" />
        <span className="ml-1.5">Editar</span>
      </Link>
    </div>
  )
}

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
        color="currentColor"
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
          className="onside-btn onside-btn-outline min-h-9 shrink-0 px-3 text-[11px]"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
