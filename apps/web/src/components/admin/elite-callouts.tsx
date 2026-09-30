import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'

/** Falha ao ler a assinatura: sem plano conhecido, o card não decide nada. */
export function PlanCheckError({ retry }: { retry: () => void }) {
  return (
    <div className="onside-callout onside-callout-danger" role="alert">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">
          Não foi possível conferir o seu plano.
        </p>
      </div>
      <button
        type="button"
        onClick={retry}
        className="onside-btn onside-btn-ink min-h-11 shrink-0 px-4 text-xs"
      >
        Tentar de novo
      </button>
    </div>
  )
}

/** Recurso Elite sem plano vigente: diz o que ganha e aponta para os planos. */
export function EliteLockedCallout({ children }: { children: ReactNode }) {
  return (
    <div className="onside-callout onside-callout-stone">
      <CircleInfo
        size={20}
        color="currentColor"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 font-semibold text-sm">
          Disponível no plano Elite
        </p>
        {children}
      </div>
      <Link
        to="/plan"
        search={{ origin: 'admin' }}
        className="onside-btn onside-btn-ink min-h-11 shrink-0 px-4 text-xs"
      >
        Ver planos
        <ArrowRight size={13} color="currentColor" aria-hidden="true" />
      </Link>
    </div>
  )
}
