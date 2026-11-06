import { useSyncExternalStore } from 'react'

/*
 * Tema das telas do redesign (WEB-501): landing, termos, privacidade, guia e
 * entrada. A escolha é "system", "light" ou "dark", guardada no aparelho; o
 * `<html>` sempre leva o tema resolvido em `data-theme`, e o CSS escuro
 * (`landing/v3/theme-dark.css`) pende só desse atributo.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_KEY = 'onside-tema'

/**
 * Vai inline no `<head>` e roda antes do primeiro paint: lê a escolha e põe o
 * tema resolvido no `<html>`, sem piscar o claro para quem usa o escuro. No
 * "system", segue o sistema enquanto a página está aberta.
 */
export const THEME_HEAD_SCRIPT = `(function(){var r=document.documentElement,q=matchMedia('(prefers-color-scheme: dark)');function c(){try{var v=localStorage.getItem(${JSON.stringify(THEME_KEY)});return v==='light'||v==='dark'?v:'system'}catch(e){return 'system'}}function s(){var v=c();r.setAttribute('data-theme',v==='system'?(q.matches?'dark':'light'):v)}s();q.addEventListener('change',s)})()`

const listeners = new Set<() => void>()

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function resolve(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Grava a escolha e aplica no `<html>`. */
export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): vale só nesta página.
  }
  document.documentElement.setAttribute('data-theme', resolve(choice))
  for (const listener of listeners) listener()
}

export function resolvedTheme(choice: ThemeChoice) {
  return resolve(choice)
}

/** A escolha atual. No servidor e na hidratação, "system". */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    readChoice,
    () => 'system'
  )
}
