import { describe, expect, test } from 'bun:test'
import {
  createSupportRequestEmail,
  getSupportQueueUrl,
  SUPPORT_INBOX
} from './support-email'

describe('e-mail de abertura de suporte', () => {
  test('inclui plano, prioridade, contexto e descrição escapada', () => {
    const email = createSupportRequestEmail({
      id: 'request-1',
      barName: 'Bar <Centro>',
      barEmail: 'bar@example.com',
      plan: 'elite',
      priority: 'highest',
      category: 'billing',
      subject: 'Cobrança & acesso',
      description: '<script>não executar</script>',
      url: 'https://www.onside.sh/internal/support'
    })

    expect(SUPPORT_INBOX).toBe('contato@onside.sh')
    expect(email.subject).toContain('Elite')
    expect(email.html).toContain('Bar &lt;Centro&gt;')
    expect(email.html).toContain('&lt;script&gt;não executar&lt;/script&gt;')
    expect(email.text).toContain('request-1')
  })

  test('prefere a URL pública e mantém o fallback local', () => {
    expect(
      getSupportQueueUrl('https://www.onside.sh/', 'http://localhost:3001')
    ).toBe('https://www.onside.sh/internal/support')
    expect(getSupportQueueUrl('  ', 'http://localhost:3001')).toBe(
      'http://localhost:3001/internal/support'
    )
  })
})
