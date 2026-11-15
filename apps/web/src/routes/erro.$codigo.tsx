import { createFileRoute, notFound } from '@tanstack/react-router'
import { ERROS, PaginaErro, type TipoErro } from '@/components/erro/pagina-erro'
import { env } from '@/lib/env'

/**
 * Vitrine das páginas de erro (WEB-554), para conferir cada uma sem provocar
 * a falha: `/erro/403`, `/erro/off`... Só no `vite dev` e no build do E2E;
 * em produção é 404.
 */
export const Route = createFileRoute('/erro/$codigo')({
  beforeLoad: ({ params }) => {
    const aberta = import.meta.env.DEV || Boolean(env.VITE_E2E_NO_DEVTOOLS)
    if (!aberta || !(params.codigo in ERROS)) throw notFound()
  },
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  component: Vitrine
})

function Vitrine() {
  const { codigo } = Route.useParams()
  const tipo = codigo as TipoErro
  return (
    <PaginaErro
      tipo={tipo}
      referencia={tipo === '500' ? 'A1B2C3D4' : undefined}
    />
  )
}
