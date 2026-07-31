import { useEffect } from 'react'

const NAV_OFFSET = 80
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function useSmoothScroll() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as Element).closest("a[href^='#']")
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return
      const id = href.slice(1)
      const target = id ? document.getElementById(id) : document.documentElement
      if (!target) return
      e.preventDefault()
      const top = id
        ? target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET
        : 0
      const behavior = window.matchMedia(REDUCED_MOTION_QUERY).matches
        ? 'auto'
        : 'smooth'

      window.scrollTo({ top, behavior })
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])
}
