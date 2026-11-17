import { useSyncExternalStore } from 'react'

/*
 * Tema das telas do redesign (WEB-501): landing, termos, privacidade, guia e
 * entrada. A escolha é "system", "light" ou "dark", guardada no aparelho; sem
 * escolha, o claro (decisão do dono, 06/11/2026). O
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
export const THEME_HEAD_SCRIPT = `(function(){var r=document.documentElement,q=matchMedia('(prefers-color-scheme: dark)');function c(){try{var v=localStorage.getItem(${JSON.stringify(THEME_KEY)});return v==='system'||v==='dark'?v:'light'}catch(e){return 'light'}}function s(){var v=c();r.setAttribute('data-theme',v==='system'?(q.matches?'dark':'light'):v)}s();q.addEventListener('change',s)})()`

/**
 * Cor da barra de status e do navegador no celular: a do topo da página em
 * cada tema (papel e tinta).
 */
export const THEME_COLOR = { light: '#F1EEE6', dark: '#12120F' } as const

/**
 * A meta `theme-color` marcada com `data-tema` acompanha o tema: `site` pelo
 * `data-theme` do `<html>` (a escolha da pessoa), `sistema` pelo
 * `prefers-color-scheme` (Houdini). Sem a marca, a cor é fixa da página. Uma
 * meta só: o TanStack junta as metas pelo `name` e fica com a última, então o
 * par com `media` não sobrevive, e o `media` não sabe da escolha do site.
 */
export function syncThemeColor() {
  document.getElementById('tema-boot')?.remove()
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][data-tema]'
  )
  if (!meta) return
  const dark =
    meta.dataset.tema === 'sistema'
      ? matchMedia('(prefers-color-scheme: dark)').matches
      : document.documentElement.dataset.theme === 'dark'
  const color = dark ? THEME_COLOR.dark : THEME_COLOR.light
  if (meta.content !== color) meta.content = color
}

/**
 * Antes da hidratação a meta do React não pode mudar (o React a duplica): o
 * script inline põe uma meta própria antes dela, que o navegador lê primeiro,
 * e `syncThemeColor` a tira depois de acertar a do React.
 */
export const THEME_COLOR_SCRIPT = `(function(){var m=document.querySelector('meta[name="theme-color"][data-tema]');if(!m)return;var d=m.getAttribute('data-tema')==='sistema'?matchMedia('(prefers-color-scheme: dark)').matches:document.documentElement.getAttribute('data-theme')==='dark';var c=d?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)};if(c===m.getAttribute('content'))return;var b=document.createElement('meta');b.id='tema-boot';b.name='theme-color';b.content=c;m.parentNode.insertBefore(b,m)})()`

const listeners = new Set<() => void>()

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'system' || value === 'dark' ? value : 'light'
  } catch {
    return 'light'
  }
}

function resolve(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Grava a escolha e aplica no `<html>`. */
export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'light') localStorage.removeItem(THEME_KEY)
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

/** A escolha atual. No servidor e na hidratação, o claro. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    readChoice,
    () => 'light'
  )
}
