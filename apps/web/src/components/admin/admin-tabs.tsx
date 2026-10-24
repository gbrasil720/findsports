import { Activity, type ReactNode } from 'react'

/**
 * As abas antigas do `/admin` (por hash) e a rota do painel que cada uma
 * virou. O hash continua valendo: link salvo, e-mail antigo e os atalhos da
 * página do bar (`/admin#admin-espaco`) são levados à rota nova pelo
 * `routes/admin.tsx`. `label` nomeia a seção para leitor de tela.
 */
export const ADMIN_SECTIONS = [
  { id: 'admin-visao', label: 'Hoje', to: '/admin' },
  { id: 'admin-grade', label: 'Jogos', to: '/admin/jogos' },
  { id: 'admin-espaco', label: 'Meu espaço', to: '/admin/meu-espaco' },
  { id: 'admin-quem-vai', label: 'Quem vai', to: '/admin/quem-vai' },
  {
    id: 'admin-configuracoes',
    label: 'Configurações',
    to: '/admin/configuracoes'
  }
] as const

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id']
export type AdminSectionRoute = (typeof ADMIN_SECTIONS)[number]['to']

/** A rota nova de um hash de aba antiga; `null` para hash que não é de aba. */
export function getAdminRouteFromHash(hash: string): AdminSectionRoute | null {
  const sectionId = hash.replace(/^#/, '')
  return ADMIN_SECTIONS.find((section) => section.id === sectionId)?.to ?? null
}

/**
 * Seção de uma tela antiga do painel, com o `id` de antes (âncoras e testes
 * ainda o usam). `active` sobrou das abas: cada tela agora é uma rota e passa
 * `true`. As telas novas não precisam disto.
 */
export function AdminTabPanel({
  id,
  active,
  className,
  children
}: {
  id: AdminSectionId
  active: boolean
  className?: string
  children: ReactNode
}) {
  const label = ADMIN_SECTIONS.find((section) => section.id === id)?.label
  return (
    <Activity mode={active ? 'visible' : 'hidden'}>
      <section id={id} aria-label={label} className={className}>
        {children}
      </section>
    </Activity>
  )
}
