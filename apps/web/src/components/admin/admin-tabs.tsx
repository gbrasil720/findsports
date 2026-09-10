import { Link } from '@tanstack/react-router'
import { getNextTabId, RovingTabs } from '@/components/app/roving-tabs'

export const ADMIN_SECTIONS = [
  { id: 'admin-visao', label: 'Visão geral' },
  { id: 'admin-grade', label: 'Minha grade' },
  { id: 'admin-espaco', label: 'Meu espaço' },
  { id: 'admin-configuracoes', label: 'Configurações' }
] as const

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id']

const ADMIN_SECTION_IDS = ADMIN_SECTIONS.map(
  (section) => section.id
) as AdminSectionId[]

type Props = {
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

export function AdminTabs({ activeSection, onChange }: Props) {
  return (
    <nav className="onside-admin-nav" aria-label="Navegação do painel">
      <RovingTabs
        tabs={ADMIN_SECTIONS}
        activeId={activeSection}
        onChange={onChange}
        label="Seções do painel"
        tabId={tabId}
        panelId={(section) => section}
        className="onside-admin-tablist"
      />

      <Link to="/admin/billing">Assinatura e pagamentos</Link>
    </nav>
  )
}

export function getAdminTabId(section: AdminSectionId): string {
  return tabId(section)
}
