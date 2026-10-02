import { useRouteContext } from '@tanstack/react-router'

import { authClient } from '@/lib/auth-client'

/*
 * Sessão para renderizar: enquanto `authClient.useSession()` ainda não
 * respondeu, vale a do servidor, que o `beforeLoad` da raiz põe no contexto
 * da rota. No SSR o hook do better-auth está sempre pendente; no cliente ele
 * às vezes já tem a sessão na hidratação. Ler só dele fazia o HTML do
 * servidor ("Carregando conta", diálogo de login) divergir do primeiro render
 * do cliente — "Hydration failed" (WEB-196).
 */
export function useSession() {
  const serverSession = useRouteContext({
    from: '__root__',
    select: (ctx) => ctx.session ?? null
  })
  const { data, isPending } = authClient.useSession()
  return isPending ? serverSession : data
}
