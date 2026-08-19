/**
 * Link de rota até o bar.
 *
 * O botão "Abrir no Maps" existia sem destino: o `onClick` registrava o
 * evento comercial `directions_opened` e não navegava para lugar nenhum. A
 * ação que funciona para todo bar cadastrado — endereço é obrigatório,
 * telefone não — não fazia nada.
 */

export type MapsDestination = {
  latitude: string
  longitude: string
  /** Usado como rótulo do destino; cai para as coordenadas quando ausente. */
  name?: string
  address?: string
}

/**
 * Usa a Maps URLs API (`dir/?api=1`), que é o formato oficial e multiplataforma:
 * no celular abre o app instalado, no desktop abre o site. Coordenadas em vez
 * de texto porque o cadastro já geocodificou o endereço — mandar a string de
 * volta faria o Google adivinhar de novo, e às vezes adivinhar diferente.
 */
export function buildDirectionsUrl(
  destination: MapsDestination
): string | null {
  const lat = Number.parseFloat(destination.latitude)
  const lng = Number.parseFloat(destination.longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const fallback = [destination.name, destination.address]
      .filter(Boolean)
      .join(', ')

    if (!fallback) return null

    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fallback)}`
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}
