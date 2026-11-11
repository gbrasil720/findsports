/**
 * robots.txt antes de ler uma página (WEB-433, vindo do protótipo): grupo
 * `User-agent: *` (o Browser Rendering não tem nome próprio), curingas `*`, a
 * regra mais longa vence, e o `Content-Signal: ai-input=no` da Cloudflare
 * (pôr a página num modelo) pula.
 */

type Rule = { allow: boolean; re: RegExp; len: number }
export function parseRobots(txt: string) {
  const rules: Rule[] = []
  let aiInputNo = false
  let agents: string[] = []
  let inRules = false
  for (const raw of txt.split('\n')) {
    const line = (raw.split('#')[0] ?? '').trim()
    const i = line.indexOf(':')
    if (i < 0) continue
    const key = line.slice(0, i).trim().toLowerCase()
    const value = line.slice(i + 1).trim()
    if (key === 'user-agent') {
      if (inRules) agents = []
      inRules = false
      agents.push(value)
      continue
    }
    inRules = true
    if (!agents.includes('*')) continue
    if (key === 'content-signal' && /ai-input\s*=\s*no/i.test(value))
      aiInputNo = true
    if ((key === 'allow' || key === 'disallow') && value) {
      const pattern = value
        .replace(/[.+?^{}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
      rules.push({
        allow: key === 'allow',
        re: new RegExp(`^${pattern}`),
        len: value.length
      })
    }
  }
  return { rules, aiInputNo }
}
export function robotsAllows(
  robots: ReturnType<typeof parseRobots>,
  path: string
) {
  if (robots.aiInputNo) return false
  const hit = robots.rules
    .filter((r) => r.re.test(path))
    .sort((a, b) => b.len - a.len || Number(b.allow) - Number(a.allow))[0]
  return hit ? hit.allow : true
}
