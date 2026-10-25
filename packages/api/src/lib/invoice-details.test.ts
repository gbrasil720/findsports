import { describe, expect, test } from 'bun:test'
import { invoiceFieldProblem, normalizeInvoiceField } from './invoice-details'

describe('normalizeInvoiceField', () => {
  test('vazio ou só espaço vira null: apaga o campo', () => {
    expect(normalizeInvoiceField('legalName', '   ')).toBeNull()
    expect(normalizeInvoiceField('cnpj', '')).toBeNull()
    expect(normalizeInvoiceField('invoiceEmail', null)).toBeNull()
  })

  test('CNPJ é gravado sem pontuação e em maiúsculas', () => {
    expect(normalizeInvoiceField('cnpj', ' 12.abc.345/01de-35 ')).toBe(
      '12ABC34501DE35'
    )
  })

  test('razão social e e-mail só perdem o espaço das pontas', () => {
    expect(normalizeInvoiceField('legalName', '  Zé Ltda. ')).toBe('Zé Ltda.')
    expect(normalizeInvoiceField('invoiceEmail', ' nf@bar.com ')).toBe(
      'nf@bar.com'
    )
  })
})

describe('invoiceFieldProblem', () => {
  test('vazio vale em todos os campos', () => {
    expect(invoiceFieldProblem('legalName', null)).toBeNull()
    expect(invoiceFieldProblem('cnpj', null)).toBeNull()
    expect(invoiceFieldProblem('invoiceEmail', null)).toBeNull()
  })

  test('CNPJ com dígito errado é recusado', () => {
    expect(invoiceFieldProblem('cnpj', '11222333000181')).toBeNull()
    expect(invoiceFieldProblem('cnpj', '11222333000182')).toBe(
      'CNPJ inválido. Confira os números.'
    )
  })

  test('e-mail precisa ter cara de e-mail', () => {
    expect(invoiceFieldProblem('invoiceEmail', 'nf@bar.com.br')).toBeNull()
    expect(invoiceFieldProblem('invoiceEmail', 'nf@')).toBe(
      'Informe um e-mail válido.'
    )
    expect(invoiceFieldProblem('invoiceEmail', `${'a'.repeat(250)}@b.co`)).toBe(
      'Informe um e-mail válido.'
    )
  })

  test('razão social tem o teto do Stripe', () => {
    expect(invoiceFieldProblem('legalName', 'a'.repeat(150))).toBeNull()
    expect(invoiceFieldProblem('legalName', 'a'.repeat(151))).toBe(
      'A razão social aceita até 150 caracteres.'
    )
  })
})
