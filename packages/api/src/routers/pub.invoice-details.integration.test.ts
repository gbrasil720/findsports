import { afterEach, expect, spyOn, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, seedBar } from './integration-seed'

// "Dados da nota" (WEB-444): razão social, CNPJ e e-mail para notas, no bar e
// no cliente do Stripe.

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const spies: { mockRestore(): void }[] = []
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore()
})

/** O cliente do Stripe como dublê: guarda as chamadas; `fail` recusa a gravação. */
async function stubCustomer(fail?: () => Promise<never>) {
  const { stripeClient } = await import(
    '@findsports_oficial/auth/stripe-client'
  )
  const customers = stripeClient.customers
  const calls: unknown[][] = []
  const record =
    (kind: string) =>
    (...args: unknown[]) => {
      calls.push([kind, ...args.slice(0, 2)])
      return fail ? fail() : Promise.resolve({})
    }
  spies.push(
    spyOn(customers, 'update').mockImplementation(
      record('update') as unknown as typeof customers.update
    ),
    spyOn(customers, 'listTaxIds').mockImplementation((() =>
      Promise.resolve({
        data: [
          { id: 'txi_velho', type: 'br_cnpj', value: '11.444.777/0001-61' }
        ]
      })) as unknown as typeof customers.listTaxIds),
    spyOn(customers, 'deleteTaxId').mockImplementation(
      record('deleteTaxId') as unknown as typeof customers.deleteTaxId
    ),
    spyOn(customers, 'createTaxId').mockImplementation(
      record('createTaxId') as unknown as typeof customers.createTaxId
    )
  )
  return calls
}

async function invoiceColumns(
  seeded: Awaited<ReturnType<typeof seedBar>>,
  barId = seeded.barId
) {
  const [row] = await seeded.db
    .select({
      legalName: bar.legalName,
      cnpj: bar.cnpj,
      invoiceEmail: bar.invoiceEmail
    })
    .from(bar)
    .where(eq(bar.id, barId))
  return row
}

const empty = { legalName: null, cnpj: null, invoiceEmail: null }

integrationTest(
  'sem cliente no Stripe: grava no bar do dono, normalizado, e só nele',
  async () => {
    const t = await seedBar('elite', 'trialing', inAMonth())
    const other = await seedBar('elite', 'trialing', inAMonth())
    try {
      await t.owner.pub.updateInvoiceDetails({
        legalName: '  Bar do Zé Comércio de Bebidas Ltda. '
      })
      await t.owner.pub.updateInvoiceDetails({ cnpj: '11.222.333/0001-81' })
      expect(
        await t.owner.pub.updateInvoiceDetails({
          invoiceEmail: 'financeiro@bardoze.com.br'
        })
      ).toEqual({
        legalName: 'Bar do Zé Comércio de Bebidas Ltda.',
        cnpj: '11222333000181',
        invoiceEmail: 'financeiro@bardoze.com.br'
      })

      const me = await t.owner.pub.getMe()
      expect({
        legalName: me.legalName,
        cnpj: me.cnpj,
        invoiceEmail: me.invoiceEmail
      }).toEqual({
        legalName: 'Bar do Zé Comércio de Bebidas Ltda.',
        cnpj: '11222333000181',
        invoiceEmail: 'financeiro@bardoze.com.br'
      })
      expect(await invoiceColumns(other)).toEqual(empty)

      // Vazio apaga só o campo mandado.
      await t.owner.pub.updateInvoiceDetails({ cnpj: '' })
      expect((await invoiceColumns(t))?.cnpj).toBeNull()
      expect((await invoiceColumns(t))?.legalName).toBe(
        'Bar do Zé Comércio de Bebidas Ltda.'
      )
    } finally {
      await t.cleanup()
      await other.cleanup()
    }
  }
)

integrationTest(
  'recusa CNPJ com dígito errado, e-mail inválido e torcedor',
  async () => {
    const t = await seedBar('elite', 'trialing', inAMonth())
    try {
      await expect(
        t.owner.pub.updateInvoiceDetails({ cnpj: '11.222.333/0001-82' })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'CNPJ inválido. Confira os números.'
      })
      await expect(
        t.owner.pub.updateInvoiceDetails({ invoiceEmail: 'financeiro@' })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Informe um e-mail válido.'
      })
      await expect(
        t.fan.pub.updateInvoiceDetails({ legalName: 'Outro Ltda.' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(await invoiceColumns(t)).toEqual(empty)
    } finally {
      await t.cleanup()
    }
  }
)

integrationTest(
  'com cliente no Stripe: manda razão social, e-mail e CNPJ antes de gravar',
  async () => {
    const t = await seedBar('elite', 'active', inAMonth())
    try {
      await t.db
        .update(user)
        .set({ stripeCustomerId: `cus_${t.ownerId}` })
        .where(eq(user.id, t.ownerId))
      const calls = await stubCustomer()

      await t.owner.pub.updateInvoiceDetails({ cnpj: '11222333000181' })

      expect(calls).toEqual([
        [
          'update',
          `cus_${t.ownerId}`,
          {
            name: 'Dono de integração',
            individual_name: 'Dono de integração',
            business_name: 'Bar de integração',
            // Sem e-mail para notas, as faturas vão para o de acesso.
            email: `${t.ownerId}@integration.invalid`
          }
        ],
        ['deleteTaxId', `cus_${t.ownerId}`, 'txi_velho'],
        [
          'createTaxId',
          `cus_${t.ownerId}`,
          { type: 'br_cnpj', value: '11.222.333/0001-81' }
        ]
      ])
      expect((await invoiceColumns(t))?.cnpj).toBe('11222333000181')
    } finally {
      await t.cleanup()
    }
  }
)

integrationTest(
  'Stripe recusando ou fora do ar: nada é gravado, e a frase diz o que fazer',
  async () => {
    const t = await seedBar('elite', 'active', inAMonth())
    const error = spyOn(console, 'error').mockImplementation(() => {})
    spies.push(error)
    try {
      await t.db
        .update(user)
        .set({ stripeCustomerId: `cus_${t.ownerId}` })
        .where(eq(user.id, t.ownerId))

      await stubCustomer(() =>
        Promise.reject(
          Object.assign(new Error('Invalid value for br_cnpj'), {
            type: 'StripeInvalidRequestError'
          })
        )
      )
      await expect(
        t.owner.pub.updateInvoiceDetails({ cnpj: '11222333000181' })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'O Stripe não aceitou estes dados. Confira e tente de novo.'
      })
      for (const spy of spies.splice(1)) spy.mockRestore()

      await stubCustomer(() => Promise.reject(new Error('Request timed out')))
      await expect(
        t.owner.pub.updateInvoiceDetails({ legalName: 'Zé Ltda.' })
      ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

      expect(await invoiceColumns(t)).toEqual(empty)
    } finally {
      await t.cleanup()
    }
  }
)
