import type { ReactNode } from 'react'

/**
 * A rota de cada aba do painel antigo (WEB-501): os links `/admin#admin-espaco`
 * de e-mails e favoritos vão para ela.
 */
export const ADMIN_SECTION_ROUTES = {
  'admin-visao': '/admin',
  'admin-grade': '/admin/jogos',
  'admin-espaco': '/admin/meu-espaco',
  'admin-quem-vai': '/admin/quem-vai',
  'admin-configuracoes': '/admin/configuracoes'
} as const

export type AdminSectionId = keyof typeof ADMIN_SECTION_ROUTES

export function getAdminSectionFromHash(hash: string): AdminSectionId | null {
  const id = hash.replace(/^#/, '')
  return Object.hasOwn(ADMIN_SECTION_ROUTES, id) ? (id as AdminSectionId) : null
}

/**
 * Uma seção do painel antigo dentro da rota dela (fase 1). O `id` continua o
 * da aba: âncoras e testes apontam para ele.
 */
export function AdminTabPanel({
  id,
  className,
  children
}: {
  id: AdminSectionId
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={className}>
      {children}
    </section>
  )
}
