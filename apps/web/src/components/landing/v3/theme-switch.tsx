import type { ChangeEvent } from 'react'
import {
  resolvedTheme,
  setThemeChoice,
  type ThemeChoice,
  useThemeChoice
} from '@/lib/theme'

/*
 * Troca de tema do rodapé, a opção A ("Placar") do design (artifact
 * THqMSzcno6ewHkDFkVLR8N): três posições, a pílula verde-limão corre até a
 * escolhida, e o tema novo abre num círculo a partir do botão (View
 * Transitions; sem suporte ou com movimento reduzido, troca na hora).
 */

const OPTIONS: { value: ThemeChoice; label: string; icon: React.ReactNode }[] =
  [
    {
      value: 'system',
      label: 'Auto',
      icon: (
        <>
          <circle
            cx="12"
            cy="12"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
        </>
      )
    },
    {
      value: 'light',
      label: 'Claro',
      icon: (
        <>
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <path
            d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </>
      )
    },
    {
      value: 'dark',
      label: 'Escuro',
      icon: (
        <path
          d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"
          fill="currentColor"
        />
      )
    }
  ]

function change(next: ThemeChoice, current: ThemeChoice, from: HTMLElement) {
  if (next === current) return
  const root = document.documentElement
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (
    reduce ||
    !document.startViewTransition ||
    resolvedTheme(next) === resolvedTheme(current)
  ) {
    setThemeChoice(next)
    return
  }
  const box = from.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  const r = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  )
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  root.style.setProperty('--vt-r', `${r}px`)
  root.classList.add('vt-theme')
  const transition = document.startViewTransition(() => setThemeChoice(next))
  transition.finished.finally(() => root.classList.remove('vt-theme'))
}

export function ThemeSwitch() {
  const choice = useThemeChoice()
  const index = OPTIONS.findIndex((o) => o.value === choice)

  // Rádios nativos: setas, Tab e leitor de tela já vêm de graça.
  return (
    <fieldset className="theme-switch">
      <legend className="sr-only">Tema</legend>
      <span
        className="thumb"
        aria-hidden="true"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map((option) => (
        <label key={option.value} data-on={option.value === choice}>
          <input
            type="radio"
            name="onside-tema"
            value={option.value}
            checked={option.value === choice}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const label = event.currentTarget.parentElement
              if (label) change(option.value, choice, label)
            }}
          />
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {option.icon}
          </svg>
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
