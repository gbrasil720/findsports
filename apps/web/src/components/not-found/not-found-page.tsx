import { PaginaErro } from '@/components/erro/pagina-erro'

/**
 * A 404 (WEB-554): a página de erro do Jules, "Bola fora.". Continua
 * respondendo 404 e sem indexar (`not-found-head.ts`, `docs/seo.md`).
 */
export function NotFoundPage() {
  return <PaginaErro tipo="404" />
}
