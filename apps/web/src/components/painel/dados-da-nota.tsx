import {
  INVOICE_FIELDS,
  type InvoiceField,
  invoiceFieldProblem,
  LEGAL_NAME_MAX_LENGTH,
  normalizeInvoiceField
} from '@findsports_oficial/api/lib/invoice-details'
import { formatCnpj, isValidCnpj } from '@findsports_oficial/db/cnpj'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type InputHTMLAttributes, useRef, useState } from 'react'
import { useMyBar } from '@/components/admin/admin-queries'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

/*
 * Dados da nota (WEB-444; protótipo `plano`, 3o): razão social, CNPJ e e-mail
 * para notas, cada um com o seu "Editar", que troca a linha pelo campo, como
 * em Configurações. O servidor manda os três ao cliente do Stripe antes de
 * gravar: recusa do Stripe não grava nada.
 */

const NOTA = {
  legalName: {
    titulo: 'Razão social',
    vazio: 'Não informado · vai o nome do bar',
    campo: { autoComplete: 'organization', maxLength: LEGAL_NAME_MAX_LENGTH }
  },
  cnpj: {
    titulo: 'CNPJ',
    vazio: 'Não informado',
    campo: {
      autoComplete: 'off',
      autoCapitalize: 'characters',
      spellCheck: false,
      maxLength: 18,
      placeholder: '00.000.000/0000-00'
    }
  },
  invoiceEmail: {
    titulo: 'E-mail para notas',
    vazio: 'Não informado · usa o de acesso',
    campo: {
      type: 'email',
      autoComplete: 'email',
      spellCheck: false,
      maxLength: 254
    }
  }
} satisfies Record<
  InvoiceField,
  {
    titulo: string
    vazio: string
    campo: InputHTMLAttributes<HTMLInputElement>
  }
>

const visivel = (campo: InvoiceField, valor: string) =>
  campo === 'cnpj' ? formatCnpj(valor) : valor

export function DadosDaNota() {
  const bar = useMyBar().data
  const [editando, setEditando] = useState<InvoiceField | null>(null)
  // Fechado o campo, o foco volta ao "Editar" da mesma linha.
  const voltarFoco = useRef<InvoiceField | null>(null)
  const fechar = () => {
    voltarFoco.current = editando
    setEditando(null)
  }
  return (
    <section className="pn-card" aria-labelledby="pn-nota">
      <div className="pn-chd">
        <h3 id="pn-nota">Dados da nota</h3>
        <small>vão para o Stripe e para a nota</small>
      </div>
      <div className="pn-lines">
        {INVOICE_FIELDS.map((campo) => {
          const { titulo, vazio } = NOTA[campo]
          const valor = bar?.[campo] ?? null
          return editando === campo ? (
            <EditarNota
              key={campo}
              campo={campo}
              inicial={valor ? visivel(campo, valor) : ''}
              onFechar={fechar}
            />
          ) : (
            <div key={campo} className="pn-ln">
              <span>
                <b>{titulo}</b>
                <span>
                  {bar ? (valor ? visivel(campo, valor) : vazio) : '…'}
                </span>
              </span>
              <button
                type="button"
                className="pn-btn pn-ghost pn-sm"
                ref={(el) => {
                  if (el && voltarFoco.current === campo) {
                    voltarFoco.current = null
                    el.focus()
                  }
                }}
                disabled={!bar}
                aria-label={`Editar ${titulo}`}
                onClick={() => setEditando(campo)}
              >
                Editar
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function EditarNota({
  campo,
  inicial,
  onFechar
}: {
  campo: InvoiceField
  inicial: string
  onFechar: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [valor, setValor] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const salvar = useMutation(
    trpc.pub.updateInvoiceDetails.mutationOptions({
      onSuccess: (dados) => {
        queryClient.setQueryData(trpc.pub.getMe.queryKey(), (bar) =>
          bar ? { ...bar, ...dados } : bar
        )
        onFechar()
      },
      // Recusa da API (CNPJ que o Stripe não aceitou) vem com a frase dela.
      onError: (error) =>
        setErro(
          error.data?.httpStatus === 400
            ? error.message
            : getUserFacingMessage(error, 'Não foi possível salvar.')
        )
    })
  )
  const { titulo, campo: props } = NOTA[campo]
  const id = `pn-nota-${campo}`

  return (
    <form
      method="post"
      noValidate
      className="pn-ln pn-ln-ed"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !salvar.isPending) onFechar()
      }}
      onSubmit={(e) => {
        e.preventDefault()
        const normalizado = normalizeInvoiceField(campo, valor)
        const problema = invoiceFieldProblem(campo, normalizado)
        setErro(problema)
        if (!problema) salvar.mutate({ [campo]: normalizado })
      }}
    >
      <div className="pn-fl">
        <label className="pn-fl-l" htmlFor={id}>
          {titulo}
        </label>
        <input
          {...props}
          id={id}
          className="pn-inp"
          value={valor}
          aria-invalid={erro ? true : undefined}
          aria-describedby={`${id}-msg`}
          // biome-ignore lint/a11y/noAutofocus: abriu para editar este campo.
          autoFocus
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => {
            if (campo === 'cnpj' && isValidCnpj(valor))
              setValor(formatCnpj(valor))
          }}
        />
        {erro ? (
          <span id={`${id}-msg`} className="pn-ferr" role="alert">
            {erro}
          </span>
        ) : campo === 'invoiceEmail' ? (
          <span id={`${id}-msg`} className="pn-hint">
            Sem ele, as faturas vão para o e-mail de acesso.
          </span>
        ) : null}
      </div>
      <span className="pn-acts">
        <button
          type="button"
          className="pn-btn pn-ghost pn-sm"
          disabled={salvar.isPending}
          onClick={onFechar}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="pn-btn pn-acid pn-sm"
          disabled={salvar.isPending}
        >
          {salvar.isPending
            ? 'Salvando…'
            : salvar.isError && isRetryableError(salvar.error)
              ? 'Tentar de novo'
              : 'Salvar'}
        </button>
      </span>
    </form>
  )
}
