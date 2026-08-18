import {
  Dialog,
  DialogContent,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { Link, useRouterState } from '@tanstack/react-router'
import Lock from 'reicon-react/icons/Lock'

type Props = {
  open: boolean
}

export function AuthRequiredDialog({ open }: Props) {
  // ESC-20: `window.location.href` aqui quebrava a renderização no servidor
  // com "window is not defined" — justamente na página que precisa ser
  // indexável. A rota atual vem do próprio router, que funciona nos dois lados.
  const callbackUrl = useRouterState({
    select: (state) => state.location.href
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        // Prevent closing — the dialog is mandatory
        if (!isOpen) return
      }}
    >
      <DialogContent className="onside-panel max-w-sm p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Autenticação obrigatória</DialogTitle>

        <div className="flex flex-col items-center text-center px-6 pt-8 pb-6">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--onside-stone)]">
            <Lock
              size={24}
              color="currentColor"
              className="text-[var(--onside-ink)]"
              aria-hidden="true"
            />
          </div>

          <h2 className="onside-display mb-2 text-2xl">Acesso exclusivo</h2>
          <p className="onside-text-muted-on-paper mb-6 max-w-[260px] text-sm leading-relaxed">
            Entre na sua conta ou crie uma para ver o perfil do bar, jogos e
            como chegar.
          </p>

          <div className="flex w-full flex-col gap-2">
            <Link
              to="/login"
              search={{ callbackUrl }}
              className="onside-btn onside-btn-acid inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm"
            >
              Entrar
            </Link>
            <Link
              to="/signup"
              search={{ callbackUrl }}
              className="onside-btn onside-btn-ghost inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm"
            >
              Criar conta grátis
            </Link>
          </div>

          <p className="mt-4 font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--onside-muted)]">
            Seu acesso ao bar é preservado após o login
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
