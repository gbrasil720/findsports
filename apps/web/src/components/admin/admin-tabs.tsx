import { Link } from '@tanstack/react-router'
import { type KeyboardEvent, useRef } from 'react'

export const ADMIN_SECTIONS = [
  { id: 'admin-visao', label: 'Visão geral' },
  { id: 'admin-grade', label: 'Minha grade' },
  { id: 'admin-espaco', label: 'Meu espaço' },
  { id: 'admin-configuracoes', label: 'Configurações' }
] as const

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id']

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
  const currentIndex = ADMIN_SECTIONS.findIndex(
    (section) => section.id === currentSection
  )
  const lastIndex = ADMIN_SECTIONS.length - 1

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return ADMIN_SECTIONS[currentIndex === lastIndex ? 0 : currentIndex + 1]
        .id
    case 'ArrowLeft':
    case 'ArrowUp':
      return ADMIN_SECTIONS[currentIndex === 0 ? lastIndex : currentIndex - 1]
        .id
    case 'Home':
      return ADMIN_SECTIONS[0].id
    case 'End':
      return ADMIN_SECTIONS[lastIndex].id
    default:
      return null
  }
}

export function AdminTabs({ activeSection, onChange }: Props) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectByKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    const nextSection = getNextAdminSection(
      ADMIN_SECTIONS[currentIndex].id,
      event.key
    )
    if (!nextSection) return

    event.preventDefault()
    onChange(nextSection)
    const nextIndex = ADMIN_SECTIONS.findIndex(
      (section) => section.id === nextSection
    )
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <nav className="onside-admin-nav" aria-label="Navegação do painel">
      <div
        className="onside-admin-tablist"
        role="tablist"
        aria-label="Seções do painel"
      >
        {ADMIN_SECTIONS.map((section, index) => {
          const isActive = activeSection === section.id
          return (
            <button
              key={section.id}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              id={tabId(section.id)}
              type="button"
              role="tab"
              aria-controls={section.id}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={isActive ? 'is-active' : undefined}
              onClick={() => onChange(section.id)}
              onKeyDown={(event) => selectByKeyboard(event, index)}
            >
              {section.label}
            </button>
          )
        })}
      </div>

      <Link to="/admin/billing" className="onside-admin-billing-link">
        Assinatura e pagamentos
      </Link>
    </nav>
  )
}

export function getAdminTabId(section: AdminSectionId): string {
  return tabId(section)
}
