import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import Logout from 'reicon-react/icons/Logout'
import { OnsideBrand } from '@/components/brand/onside-brand'
import { useSignOut } from '@/hooks/use-sign-out'
import { ProductFrame } from './product-frame'

type Props = {
  title: string
  kicker?: string
  children: ReactNode
  backTo?: '/internal' | '/'
  backLabel?: string
}

export function InternalShell({
  title,
  kicker = 'Admin interno',
  children,
  backTo = '/internal',
  backLabel = 'Hall'
}: Props) {
  const signOut = useSignOut()

  return (
    <ProductFrame
      rootClassName="onside-app min-h-dvh"
      headerInnerClassName="onside-app-shell onside-app-header-inner flex-wrap gap-3 py-2 md:flex-nowrap md:py-0"
      header={
        <>
          <Link
            to="/"
            className="onside-brand-link shrink-0"
            aria-label="Onside — página inicial"
          >
            <OnsideBrand />
          </Link>

          <div className="hidden min-w-0 md:block">
            <p className="onside-kicker">{kicker}</p>
            <p className="truncate font-bold text-sm">{title}</p>
          </div>

          <nav
            className="ml-auto flex flex-wrap items-center gap-2"
            aria-label="Navegação interna"
          >
            {backTo === '/internal' ? (
              <Link
                to="/internal"
                className="onside-btn onside-btn-outline min-h-11 px-3 text-xs"
              >
                <ArrowLeft size={14} color="currentColor" aria-hidden="true" />
                {backLabel}
              </Link>
            ) : (
              <Link
                to="/"
                className="onside-btn onside-btn-outline min-h-11 px-3 text-xs"
              >
                <ArrowLeft size={14} color="currentColor" aria-hidden="true" />
                {backLabel}
              </Link>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="onside-btn onside-btn-ghost min-h-11 px-3 text-xs"
            >
              <Logout size={14} color="currentColor" aria-hidden="true" />
              Sair
            </button>
          </nav>
        </>
      }
    >
      <div className="mb-6 md:hidden">
        <p className="onside-kicker mb-1">{kicker}</p>
        <h1 className="onside-display text-3xl">{title}</h1>
      </div>
      {children}
    </ProductFrame>
  )
}
