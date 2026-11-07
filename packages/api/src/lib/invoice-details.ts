import { isValidCnpj, normalizeCnpj } from '@findsports_oficial/db/cnpj'
import { z } from 'zod'

/*
 * "Dados da nota" do bar (WEB-444): razão social, CNPJ e e-mail para notas.
 * Puro: o painel confere antes de mandar, com as mesmas frases, e a API
 * recusa o que passar por fora dele (`pub.updateInvoiceDetails`).
 */

export const INVOICE_FIELDS = ['legalName', 'cnpj', 'invoiceEmail'] as const
export type InvoiceField = (typeof INVOICE_FIELDS)[number]

/** O teto do Stripe para o nome da empresa (`business_name`). */
export const LEGAL_NAME_MAX_LENGTH = 150

/** Como o valor é gravado: sem espaço nas pontas, CNPJ só com letras e números, vazio é `null`. */
export function normalizeInvoiceField(
  field: InvoiceField,
  value: string | null
): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  return field === 'cnpj' ? normalizeCnpj(trimmed) : trimmed
}

/** O que está errado no valor já normalizado, ou `null`. Vazio vale: apaga o campo. */
export function invoiceFieldProblem(
  field: InvoiceField,
  value: string | null
): string | null {
  if (value === null) return null
  switch (field) {
    case 'legalName':
      return value.length > LEGAL_NAME_MAX_LENGTH
        ? `A razão social aceita até ${LEGAL_NAME_MAX_LENGTH} caracteres.`
        : null
    case 'cnpj':
      return isValidCnpj(value) ? null : 'CNPJ inválido. Confira os números.'
    case 'invoiceEmail':
      return z.email().max(254).safeParse(value).success
        ? null
        : 'Informe um e-mail válido.'
  }
}
