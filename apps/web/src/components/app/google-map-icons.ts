const COLORS = {
  live: '#E8320C',
  acid: '#C9F135',
  ink: '#12120F'
} as const

export type MapAccent = keyof typeof COLORS

function pinSvg(color: string, large: boolean): string {
  const scale = large ? 1.15 : 1
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${36 * scale}" height="${46 * scale}" viewBox="0 0 36 46">
  <defs><filter id="s" x="-20%" y="-10%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-opacity="0.35"/></filter></defs>
  <path filter="url(#s)" d="M18 1c8.8 0 16 7.1 16 15.9 0 11.4-14.2 26.4-15 27.2a1.4 1.4 0 0 1-2 0C16.2 43.3 2 28.3 2 16.9 2 8.1 9.2 1 18 1z" fill="${color}" stroke="#12120F" stroke-width="2"/>
  <circle cx="18" cy="17" r="6.5" fill="#F1EEE6"/>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function createPinIcon(
  maps: typeof google.maps,
  accent: MapAccent,
  large: boolean
): google.maps.Icon {
  const width = large ? 42 : 36
  const height = large ? 53 : 46
  return {
    url: pinSvg(COLORS[accent], large),
    scaledSize: new maps.Size(width, height),
    anchor: new maps.Point(width / 2, height)
  }
}

export function createUserDotIcon(maps: typeof google.maps): google.maps.Icon {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <circle cx="11" cy="11" r="10" fill="rgba(201,241,53,0.28)"/>
  <circle cx="11" cy="11" r="5" fill="#12120F" stroke="#C9F135" stroke-width="2"/>
</svg>`
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(22, 22),
    anchor: new maps.Point(11, 11)
  }
}
