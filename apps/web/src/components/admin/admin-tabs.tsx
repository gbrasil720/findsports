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
