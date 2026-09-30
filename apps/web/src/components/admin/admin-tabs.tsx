import { Link } from '@tanstack/react-router'
import { Activity, type ReactNode } from 'react'
import { getNextTabId, RovingTabs } from '@/components/app/roving-tabs'

export const ADMIN_SECTIONS = [
  { id: 'admin-visao', label: 'Visão geral' },
  { id: 'admin-grade', label: 'Minha grade' },
  { id: 'admin-espaco', label: 'Meu espaço' },
  { id: 'admin-reservas', label: 'Reservas' },
  { id: 'admin-configuracoes', label: 'Configurações' }
] as const

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id']
type AdminSection = (typeof ADMIN_SECTIONS)[number]

/**
 * A fila de reservas (WEB-125) só existe para bar que recebe reservas: Elite
 * vigente e interruptor ligado. Para o resto, a aba não aparece.
 */
export function getAdminSections(
  receivesReservations: boolean
): readonly AdminSection[] {
  return receivesReservations
    ? ADMIN_SECTIONS
    : ADMIN_SECTIONS.filter((section) => section.id !== 'admin-reservas')
}

const ADMIN_SECTION_IDS = ADMIN_SECTIONS.map(
  (section) => section.id
) as AdminSectionId[]

type Props = {
  sections: readonly AdminSection[]
  activeSection: AdminSectionId
  onChange: (section: AdminSectionId) => void
}

function tabId(section: AdminSectionId): string {
  return `${section}-tab`
}

export function getAdminSectionFromHash(hash: string): AdminSectionId | null {
  const sectionId = hash.replace(/^#/, '')
  return ADMIN_SECTIONS.find((section) => section.id === sectionId)?.id ?? null
}

export function getNextAdminSection(
  currentSection: AdminSectionId,
  key: string
): AdminSectionId | null {
  return getNextTabId(ADMIN_SECTION_IDS, currentSection, key)
}

export function AdminTabs({ sections, activeSection, onChange }: Props) {
  return (
    <nav className="onside-admin-nav" aria-label="Navegação do painel">
      <RovingTabs
        tabs={sections}
        activeId={activeSection}
        onChange={onChange}
        label="Seções do painel"
        tabId={tabId}
        panelId={(section) => section}
        className="onside-admin-tablist"
      />

      <Link to="/admin/validate">Validar código</Link>
      <Link to="/admin/billing">Assinatura e pagamentos</Link>
    </nav>
  )
}

/**
 * Painel de uma aba. Fica montado quando a aba está escondida: `Activity`
 * preserva o que o dono digitou ao trocar de aba (WEB-140). As queries moram
 * no componente da aba, fora do `Activity`, então continuam assinadas e
 * buscando mesmo com a aba escondida.
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
  return (
    <Activity mode={active ? 'visible' : 'hidden'}>
      <section
        id={id}
        role="tabpanel"
        aria-labelledby={tabId(id)}
        className={className}
      >
        {children}
      </section>
    </Activity>
  )
}
