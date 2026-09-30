import { describe, expect, test } from 'bun:test'
import {
  AVERAGE_SPEND_MAX_CENTS,
  averageSpendCentsError,
  averageSpendInputValue,
  formatAverageSpend,
  MENU_URL_MAX_LENGTH,
  menuUrlHost,
  parseAverageSpendInput,
  parseMenuUrl
} from './bar-menu'

describe('parseMenuUrl', () => {
  test.each([
    null,
    undefined,
    '',
    '   '
  ])('trata %p como link removido', (input) => {
    expect(parseMenuUrl(input)).toEqual({ ok: true, url: null })
  })

  test('aceita http e https e grava a forma normalizada', () => {
    expect(parseMenuUrl(' https://Bar.com.br/Cardapio ')).toEqual({
      ok: true,
      url: 'https://bar.com.br/Cardapio'
    })
    expect(parseMenuUrl('http://bar.com.br')).toEqual({
      ok: true,
      url: 'http://bar.com.br/'
    })
  })

  test('`://` depois do domínio não conta como esquema', () => {
    expect(
      parseMenuUrl('drive.google.com/viewer?url=https://bar.com/menu.pdf')
    ).toEqual({
      ok: true,
      url: 'https://drive.google.com/viewer?url=https://bar.com/menu.pdf'
    })
  })

  test('arroba no início pede o endereço completo do perfil', () => {
    const result = parseMenuUrl('@boteco.rio')
    expect(!result.ok && result.error).toContain('instagram.com/seubar')
  })

  test('link sem esquema ganha https', () => {
    expect(parseMenuUrl('instagram.com/meubar')).toEqual({
      ok: true,
      url: 'https://instagram.com/meubar'
    })
  })

  test.each([
    'javascript:alert(1)',
    'javascript://%0aalert(1)',
    'JAVASCRIPT://x.com/%0aalert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'mailto:dono@bar.com',
    'ftp://bar.com/cardapio.pdf',
    'file:///etc/passwd',
    'https://banco.com.br@golpe.site',
    'https://localhost/cardapio',
    'cardapio',
    'https://',
    'http://exa mple.com',
    'bar doze.com.br/cardapio',
    '@boteco.rio',
    'https://@boteco.rio',
    'localhost.',
    '192.168.0.1',
    'https://0x7f.1/',
    'bar..com.br',
    'https://.com',
    'bardoze.com.br.',
    'www.'
  ])('recusa %p', (input) => {
    expect(parseMenuUrl(input).ok).toBe(false)
  })

  test('limite vale sobre a URL gravada', () => {
    const base = 'https://bar.com/'
    const cabe = base + 'a'.repeat(MENU_URL_MAX_LENGTH - base.length)
    expect(parseMenuUrl(cabe).ok).toBe(true)
    expect(parseMenuUrl(`${cabe}a`).ok).toBe(false)
  })
})

describe('menuUrlHost', () => {
  test('valor que não é URL vira vazio em vez de derrubar a página', () => {
    expect(menuUrlHost('https://')).toBe('')
  })

  test('mostra o domínio sem www', () => {
    expect(menuUrlHost('https://www.instagram.com/meubar')).toBe(
      'instagram.com'
    )
  })
})

describe('parseAverageSpendInput', () => {
  test.each([
    ['45', 4500],
    ['45,5', 4550],
    ['45,50', 4550],
    ['45.50', 4550],
    ['0,01', 1],
    ['R$ 45,90', 4590],
    ['r$45', 4500],
    ['1.000', 100_000],
    ['1.000,00', 100_000],
    ['1000,00', 100_000]
  ])('lê %p como %p centavos', (input, cents) => {
    expect(parseAverageSpendInput(input)).toEqual({ ok: true, cents })
  })

  test.each(['', '   ', 'R$ '])('trata %p como valor removido', (input) => {
    expect(parseAverageSpendInput(input)).toEqual({ ok: true, cents: null })
  })

  test.each([
    '0',
    '0,00',
    '-10',
    '45,505',
    '45.505,1',
    'NaN',
    'abc',
    '1e3',
    '45,',
    ',50',
    '1.000,01',
    '99999999999999999999',
    '0.500',
    '00.100',
    '0.990,00'
  ])('recusa %p com mensagem', (input) => {
    const result = parseAverageSpendInput(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })
})

test('número enorme recebe a mensagem de teto, não a de zero', () => {
  const result = parseAverageSpendInput('9'.repeat(400))
  expect(!result.ok && result.error).toContain('até')
})

describe('averageSpendCentsError', () => {
  test('aceita nulo e inteiros dentro do limite', () => {
    expect(averageSpendCentsError(null)).toBeNull()
    expect(averageSpendCentsError(1)).toBeNull()
    expect(averageSpendCentsError(AVERAGE_SPEND_MAX_CENTS)).toBeNull()
  })

  test.each([
    0,
    -100,
    45.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    AVERAGE_SPEND_MAX_CENTS + 1
  ])('recusa %p', (cents) => {
    expect(averageSpendCentsError(cents)).not.toBeNull()
  })
})

describe('formatação', () => {
  test('formata em BRL', () => {
    expect(formatAverageSpend(4550).replace(/\s/g, ' ')).toBe('R$ 45,50')
    expect(formatAverageSpend(100_000).replace(/\s/g, ' ')).toBe('R$ 1.000,00')
  })

  test('valor do campo volta a ser lido igual', () => {
    expect(averageSpendInputValue(null)).toBe('')
    expect(averageSpendInputValue(4550)).toBe('45,50')
    expect(parseAverageSpendInput(averageSpendInputValue(100_000))).toEqual({
      ok: true,
      cents: 100_000
    })
  })
})
