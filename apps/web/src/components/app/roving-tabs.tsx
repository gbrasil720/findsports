import { type KeyboardEvent, useRef } from 'react'

/**
 * A faixa de abas do produto, uma só.
 *
 * O perfil do torcedor e o painel do bar tinham duas implementações
 * diferentes da mesma coisa: o painel com roving tabindex, setas, Home/End e
 * `aria-controls`; o perfil com três buttons crus, todos na sequência de Tab
 * e sem relação declarada com o painel que abrem. Quem usa teclado aprendia
 * uma navegação numa tela e reaprendia outra na seguinte.
 *
 * O roving tabindex é o ponto: uma faixa de abas ocupa **uma** parada de Tab,
 * e a escolha dentro dela é feita com as setas. Sem isso, cada aba nova
 * acrescenta uma parada entre o conteúdo anterior e o painel.
 */

export type RovingTab<Id extends string> = {
  id: Id
  label: string
}

/**
 * Próxima aba para uma tecla, ou `null` quando a tecla não é de navegação —
 * devolver `null` é o que impede a faixa de sequestrar Tab, Enter e espaço.
 *
 * Puro de propósito: a regra de dar a volta nas pontas é testável sem DOM.
 */
export function getNextTabId<Id extends string>(
  ids: readonly Id[],
  current: Id,
  key: string
): Id | null {
  const currentIndex = ids.indexOf(current)
  if (currentIndex === -1) return null
  const lastIndex = ids.length - 1

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return ids[currentIndex === lastIndex ? 0 : currentIndex + 1]
    case 'ArrowLeft':
    case 'ArrowUp':
      return ids[currentIndex === 0 ? lastIndex : currentIndex - 1]
    case 'Home':
      return ids[0]
    case 'End':
      return ids[lastIndex]
    default:
      return null
  }
}

type Props<Id extends string> = {
  tabs: readonly RovingTab<Id>[]
  activeId: Id
  onChange: (id: Id) => void
  /** Rótulo do conjunto, lido antes das abas. */
  label: string
  /** Id do próprio botão de aba — o painel aponta para ele por `aria-labelledby`. */
  tabId: (id: Id) => string
  /** Id do painel que a aba controla, quando existe um. */
  panelId?: (id: Id) => string
  className?: string
}

export function RovingTabs<Id extends string>({
  tabs,
  activeId,
  onChange,
  label,
  tabId,
  panelId,
  className
}: Props<Id>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const ids = tabs.map((tab) => tab.id)

  const selectByKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const nextId = getNextTabId(ids, ids[index], event.key)
    if (!nextId) return

    event.preventDefault()
    onChange(nextId)
    tabRefs.current[ids.indexOf(nextId)]?.focus()
  }

  return (
    <div
      className={className ?? 'onside-tablist'}
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId
        return (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId?.(tab.id)}
            tabIndex={isActive ? 0 : -1}
            className={isActive ? 'is-active' : undefined}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => selectByKeyboard(event, index)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
