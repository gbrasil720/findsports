import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { useEffect, useId, useState } from 'react'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import { InternalShell } from '@/components/app/internal-shell'
import { getUser } from '@/functions/get-user'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/internal_/flags')({
  head: () => ({
    meta: [
      { title: 'Configuração — Onside Admin' },
      {
        name: 'description',
        content: 'Configuração da aplicação em tempo de execução.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  beforeLoad: async () => {
    const session = await getUser()
    return { session }
  },
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
    if (context.session.user.role !== 'admin') {
      throw redirect({ to: '/' })
    }
  },
  component: FlagsPage
})

/**
 * Derivado do router em vez de redigitado. Chave nova, campo novo ou campo
 * removido no servidor aparece aqui como erro de tipo — e não como uma tela
 * que continua compilando enquanto mostra o que não existe mais.
 */
type Entrada = inferRouterOutputs<AppRouter>['appConfig']['list'][number]

function formatarValor(valor: unknown) {
  return JSON.stringify(valor, null, 2)
}

/**
 * Campos booleanos de primeiro nível de um valor em objeto.
 *
 * Existe porque ligar um portão não pode exigir digitar JSON. `Ligar`/
 * `Desligar` já cobria a flag booleana solta; flag em objeto —
 * `{signup, signin}` — caía no textarea, que é onde um erro de vírgula às
 * três da manhã vira um portão no estado errado.
 *
 * Só o primeiro nível, e só booleano: número e objeto aninhado continuam no
 * JSON, onde um controle adivinhado erraria mais do que ajudaria.
 */
function camposBooleanos(valor: unknown): [string, boolean][] {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return []
  }
  return Object.entries(valor).filter(
    (entrada): entrada is [string, boolean] => typeof entrada[1] === 'boolean'
  )
}

/** Interruptor de um campo. O rótulo diz o estado, não a ação. */
function Interruptor({
  rotulo,
  ligado,
  desabilitado,
  onToggle
}: {
  rotulo: string
  ligado: boolean
  desabilitado: boolean
  onToggle: (proximo: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => onToggle(!ligado)}
      className={`flex min-h-11 items-center gap-3 border border-[var(--onside-ink)] px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 ${
        ligado
          ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
          : 'bg-[var(--onside-paper)] text-[var(--onside-muted)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid size-4 place-items-center border border-current text-[10px] leading-none`}
      >
        {ligado ? '✓' : ''}
      </span>
      <span className="font-mono">{rotulo}</span>
      <span className="onside-kicker text-[10px]">
        {ligado ? 'ligado' : 'desligado'}
      </span>
    </button>
  )
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Editor de uma chave.
 *
 * O campo é JSON puro de propósito: o registro do servidor é que decide qual
 * formato cada chave aceita, e uma tela com um controle por chave começaria a
 * divergir dele na primeira chave nova. O servidor valida antes de gravar, e
 * a mensagem de recusa aparece aqui — quem errar o formato descobre na hora.
 *
 * Chave booleana ganha dois botões por cima disso. É a forma mais comum e a
 * mais urgente: às três da manhã ninguém quer digitar `false` sem aspas.
 */
function CartaoFlag({
  entrada,
  onSalvar,
  onResetar,
  salvando,
  resetando
}: {
  entrada: Entrada
  onSalvar: (valor: unknown) => void
  onResetar: () => void
  salvando: boolean
  resetando: boolean
}) {
  const campoId = useId()
  const [rascunho, setRascunho] = useState(() => formatarValor(entrada.valor))
  const [erro, setErro] = useState<string | null>(null)

  // O valor do servidor manda: depois de salvar ou resetar, o campo volta a
  // refletir o que está gravado em vez de manter o texto que o usuário digitou.
  const valorServidor = formatarValor(entrada.valor)
  useEffect(() => {
    setRascunho(valorServidor)
    setErro(null)
  }, [valorServidor])

  const alterado = rascunho !== valorServidor
  const ehBooleano = typeof entrada.valor === 'boolean'
  const booleanos = camposBooleanos(entrada.valor)

  function salvarRascunho() {
    let analisado: unknown
    try {
      analisado = JSON.parse(rascunho)
    } catch {
      setErro('JSON inválido. Exemplos: true, false, ["São Paulo"].')
      return
    }
    setErro(null)
    onSalvar(analisado)
  }

  return (
    <article className="onside-panel onside-shadow flex flex-col gap-4 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-mono font-bold text-sm break-all">
            {entrada.key}
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--onside-muted)]">
            {entrada.descricao}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <span
            className={`onside-kicker border px-2 py-1 text-[10px] ${
              entrada.sobrescrito
                ? 'border-[var(--onside-ink)] bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                : 'border-[var(--onside-ink)] text-[var(--onside-muted)]'
            }`}
          >
            {entrada.sobrescrito ? 'Sobrescrito' : 'Padrão'}
          </span>
          <span className="onside-kicker border border-[var(--onside-ink)] px-2 py-1 text-[10px] text-[var(--onside-muted)]">
            {entrada.publico ? 'Público' : 'Interno'}
          </span>
        </div>
      </header>

      {ehBooleano ? (
        <Interruptor
          rotulo={entrada.key.split('.').pop() ?? entrada.key}
          ligado={entrada.valor === true}
          desabilitado={salvando}
          onToggle={onSalvar}
        />
      ) : null}

      {booleanos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {booleanos.map(([campo, ligado]) => (
            <Interruptor
              key={campo}
              rotulo={campo}
              ligado={ligado}
              desabilitado={salvando}
              onToggle={(proximo) =>
                onSalvar({
                  ...(entrada.valor as Record<string, unknown>),
                  [campo]: proximo
                })
              }
            />
          ))}
        </div>
      ) : null}

      <details>
        <summary className="onside-kicker cursor-pointer text-[var(--onside-muted)]">
          Editar como JSON
        </summary>
        <div className="mt-3">
          <label
            htmlFor={campoId}
            className="onside-kicker mb-2 block text-[var(--onside-ink)]"
          >
            Valor (JSON)
          </label>
          <textarea
            id={campoId}
            value={rascunho}
            onChange={(event) => setRascunho(event.target.value)}
            spellCheck={false}
            rows={Math.min(12, rascunho.split('\n').length + 1)}
            className="w-full resize-y border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-3 font-mono text-xs text-[var(--onside-ink)]"
          />
          <p className="mt-2 font-mono text-[11px] text-[var(--onside-muted)]">
            Padrão: {formatarValor(entrada.padrao)}
          </p>
        </div>
      </details>

      {erro ? (
        <p
          className="text-sm text-[var(--onside-live-text)]"
          role="alert"
          aria-live="assertive"
        >
          {erro}
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-[var(--onside-muted)]">
          {entrada.updatedAt
            ? `Alterado em ${formatarData(entrada.updatedAt)}${
                entrada.updatedBy ? ` por ${entrada.updatedBy}` : ''
              }`
            : 'Nunca alterado.'}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!entrada.sobrescrito || resetando}
            onClick={onResetar}
            className="onside-btn onside-btn-outline min-h-11 text-xs disabled:opacity-40"
          >
            Voltar ao padrão
          </button>
          <button
            type="button"
            disabled={!alterado || salvando}
            onClick={salvarRascunho}
            className="onside-btn onside-btn-ink min-h-11 text-xs disabled:opacity-40"
          >
            {salvando ? (
              <Loader
                size={14}
                color="currentColor"
                className="animate-spin"
                aria-hidden="true"
              />
            ) : null}
            Salvar
          </button>
        </div>
      </footer>
    </article>
  )
}

function FlagsPage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const listaQuery = useQuery(trpc.appConfig.list.queryOptions())

  async function recarregar() {
    await queryClient.invalidateQueries({
      queryKey: trpc.appConfig.list.queryKey()
    })
  }

  const salvar = useMutation(
    trpc.appConfig.set.mutationOptions({
      onSuccess: async (resultado) => {
        toast.success(`${resultado.key} salvo.`)
        await recarregar()
      },
      onError: (erro) => toast.error(erro.message)
    })
  )

  const resetar = useMutation(
    trpc.appConfig.reset.mutationOptions({
      onSuccess: async (resultado) => {
        toast.success(`${resultado.key} voltou ao padrão.`)
        await recarregar()
      },
      onError: (erro) => toast.error(erro.message)
    })
  )

  const entradas = listaQuery.data ?? []

  return (
    <InternalShell title="Configuração" backTo="/internal" backLabel="Hall">
      <div className="onside-callout onside-callout-stone mb-8 max-w-3xl">
        <CircleInfo
          size={20}
          color="currentColor"
          className="shrink-0"
          aria-hidden="true"
        />
        <p className="text-sm">
          Salvar grava na hora, mas as instâncias já em execução só enxergam o
          valor novo <strong>em até 60 segundos</strong> — é o tempo do cache
          que evita uma consulta por requisição. Chave sem valor gravado usa o
          padrão do código.
        </p>
      </div>

      {listaQuery.isLoading ? (
        <div
          className="flex items-center gap-2 text-sm text-[var(--onside-muted)]"
          aria-live="polite"
        >
          <Loader
            size={18}
            color="currentColor"
            className="animate-spin"
            aria-hidden="true"
          />
          Carregando configuração…
        </div>
      ) : null}

      {listaQuery.isError ? (
        <div className="onside-callout onside-callout-danger max-w-3xl">
          <p className="text-sm">Não foi possível carregar a configuração.</p>
          <button
            type="button"
            onClick={() => listaQuery.refetch()}
            className="onside-btn onside-btn-outline min-h-11"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      <div className="grid max-w-3xl gap-5">
        {entradas.map((entrada) => (
          <CartaoFlag
            key={entrada.key}
            entrada={entrada}
            // `variables` é a entrada da mutação em andamento: o react-query
            // já sabe qual chave está gravando, então não há estado nosso
            // para manter em sincronia com isso.
            salvando={salvar.isPending && salvar.variables?.key === entrada.key}
            resetando={
              resetar.isPending && resetar.variables?.key === entrada.key
            }
            onSalvar={(valor) =>
              salvar.mutate({ key: entrada.key, value: valor })
            }
            onResetar={() => resetar.mutate({ key: entrada.key })}
          />
        ))}
      </div>
    </InternalShell>
  )
}
