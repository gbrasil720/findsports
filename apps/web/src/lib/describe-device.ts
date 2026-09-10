/**
 * Nome legível para um acesso ativo, a partir do user agent.
 *
 * A lista de sessões chamava todo acesso que não fosse o atual de "Outro
 * acesso" e mostrava a string crua do user agent embaixo. Quem precisa
 * decidir se encerra uma sessão precisa reconhecê-la, e reconhecer uma sessão
 * por `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)…` não é possível.
 *
 * A detecção é deliberadamente rasa: user agent é declarado pelo cliente e
 * mente com frequência (todo navegador se diz "Mozilla"; Edge se diz Chrome
 * que se diz Safari). Serve para reconhecer, nunca para autorizar — a string
 * original continua visível ao lado.
 */

type Device = {
  /** "Chrome no macOS", "Safari no iPhone", ou o rótulo genérico. */
  label: string
  /** `false` quando nada foi reconhecido e o rótulo é o genérico. */
  recognized: boolean
}

const GENERIC = 'Acesso não identificado'

/** A ordem importa: Edge se anuncia como Chrome, Chrome como Safari. */
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg[A-Za-z]*\//, 'Edge'],
  [/\bOPR\/|\bOpera\//, 'Opera'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bSafari\//, 'Safari']
]

/** iPhone e iPad antes de "Mac": o iPad se declara Macintosh no modo desktop. */
const PLATFORMS: Array<[RegExp, string]> = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux']
]

function match(userAgent: string, table: Array<[RegExp, string]>) {
  for (const [pattern, name] of table) {
    if (pattern.test(userAgent)) return name
  }
  return null
}

export function describeDevice(userAgent: string | null | undefined): Device {
  if (!userAgent?.trim()) return { label: GENERIC, recognized: false }

  const browser = match(userAgent, BROWSERS)
  const platform = match(userAgent, PLATFORMS)

  if (browser && platform) {
    return { label: `${browser} no ${platform}`, recognized: true }
  }
  if (browser) return { label: browser, recognized: true }
  if (platform) return { label: platform, recognized: true }
  return { label: GENERIC, recognized: false }
}
