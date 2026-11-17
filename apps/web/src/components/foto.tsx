import { type ImgHTMLAttributes, type ReactNode, useState } from 'react'

/**
 * Foto que vem de fora (bar, galeria). Sem endereço, ou com a foto que não
 * carregou, mostra `fallback` no lugar do ícone quebrado do navegador.
 */
export function Foto({
  fallback = null,
  ...img
}: ImgHTMLAttributes<HTMLImageElement> & { fallback?: ReactNode }) {
  const [falhou, setFalhou] = useState<string | null>(null)
  if (!img.src || falhou === img.src) return fallback
  return (
    // biome-ignore lint/a11y/useAltText: o `alt` vem de quem usa, junto com o resto.
    <img
      {...img}
      /* Foto do HTML do servidor pode falhar antes de o React ligar o `onError`. */
      ref={(el) => {
        if (el?.complete && !el.naturalWidth) setFalhou(img.src ?? null)
      }}
      onError={() => setFalhou(img.src ?? null)}
    />
  )
}
