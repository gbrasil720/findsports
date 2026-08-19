import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@findsports_oficial/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@findsports_oficial/ui/components/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useId, useState } from 'react'
import Export from 'reicon-react/icons/Export'
import Fire from 'reicon-react/icons/Fire'
import Loader from 'reicon-react/icons/Loader'
import Search from 'reicon-react/icons/Search'
import Store from 'reicon-react/icons/Store'
import Users from 'reicon-react/icons/Users'
import { toast } from 'sonner'
import { InternalShell } from '@/components/app/internal-shell'
import { WaitlistAccessPanel } from '@/components/internal/waitlist-access-panel'
import { getUser } from '@/functions/get-user'
import { formatStoredPhone } from '@/utils/format-phone'
import { useTRPC, useTRPCClient } from '@/utils/trpc'

export const Route = createFileRoute('/internal_/waitlist')({
  head: () => ({
    meta: [
      { title: 'Lista de Espera — Onside Admin' },
      {
        name: 'description',
        content: 'Painel administrativo da lista de espera Onside.'
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
  component: AdminWaitlistPage
})

const ROLE_FILTER_ITEMS = {
  all: 'Todos',
  fan: 'Torcedor',
  pub: 'Bar / Pub'
} as const

function formatDate(date: Date | string) {
  const d = new Date(date)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  })
}

function entryLabel(s: {
  email: string
  role: string
  pubName: string | null
}) {
  if (s.role === 'pub' && s.pubName?.trim()) return s.pubName
  return s.email
}

function roleLabel(role: string) {
  return role === 'fan' ? 'Torcedor' : 'Bar / Pub'
}

function AdminWaitlistPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [exporting, setExporting] = useState(false)
  const searchId = useId()
  const roleFilterId = useId()

  const trpc = useTRPC()
  const trpcClient = useTRPCClient()
  const queryClient = useQueryClient()

  /**
   * ESC-19: a aprovação é da PESSOA, não da linha. O portão de entrada
   * consulta por e-mail, e a mesma pessoa pode ter várias inscrições
   * (torcedor e bar, ou cidades diferentes) — por isso a mutação recebe o
   * e-mail e marca todas as linhas dele de uma vez.
   */
  const aprovacao = useMutation(
    trpc.waitlist.setApproval.mutationOptions({
      onSuccess: async (resultado) => {
        toast.success(
          resultado.approved
            ? `${resultado.email} liberado.`
            : `Acesso de ${resultado.email} revogado.`
        )
        await queryClient.invalidateQueries({
          queryKey: trpc.waitlist.getAll.queryKey()
        })
      },
      onError: (erro) => toast.error(erro.message)
    })
  )
  const {
    data: subscribers = [],
    isLoading,
    isError,
    isFetching,
    refetch
  } = useQuery({
    queryKey: trpc.waitlist.getAll.queryKey(),
    // A resposta do servidor passou a ser paginada (ESC-09), mas a tela
    // filtra, conta e exporta sobre a lista inteira. Percorremos as páginas
    // aqui para preservar isso — o que muda é o tamanho de cada resposta,
    // não o que a tela enxerga.
    queryFn: async () => {
      const todos: Awaited<
        ReturnType<typeof trpcClient.waitlist.getAll.query>
      >['entries'] = []
      let cursor: string | undefined
      do {
        const pagina = await trpcClient.waitlist.getAll.query({ cursor })
        todos.push(...pagina.entries)
        cursor = pagina.nextCursor ?? undefined
      } while (cursor)
      return todos
    }
  })

  const filtered = subscribers.filter((s) => {
    const q = search.toLowerCase()
    const matchesSearch =
      s.email.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q) ||
      (s.pubName?.toLowerCase().includes(q) ?? false)
    const matchesRole = roleFilter === 'all' ? true : s.role === roleFilter
    return matchesSearch && matchesRole
  })

  const total = filtered.length
  const fanCount = filtered.filter((s) => s.role === 'fan').length
  const pubCount = filtered.filter((s) => s.role === 'pub').length

  // Contagem sobre a lista INTEIRA, não sobre o filtro da busca: o painel
  // decide se é seguro fechar a porta, e um filtro de texto na tela não pode
  // mudar essa resposta.
  const emailsLiberados = new Set(
    subscribers.filter((s) => s.approvedAt).map((s) => s.email)
  )
  const emailsPendentes = new Set(
    subscribers.filter((s) => !s.approvedAt).map((s) => s.email)
  )
  for (const email of emailsLiberados) emailsPendentes.delete(email)

  function escapeCsv(value: string) {
    return `"${value.replace(/"/g, '""')}"`
  }

  async function handleExportCSV() {
    setExporting(true)
    try {
      const header = [
        'ID',
        'Email',
        'Telefone',
        'Tipo',
        'Estabelecimento',
        'Cidade',
        'Data de inscrição'
      ]
      const rows = filtered.map((s) => [
        s.id,
        s.email,
        s.phone ?? '',
        s.role,
        s.pubName ?? '',
        s.city,
        formatDate(s.createdAt)
      ])
      const csv = [header, ...rows]
        .map((r) => r.map((v) => escapeCsv(String(v))).join(','))
        .join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `waitlist-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`${filtered.length} registros exportados.`)
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Erro ao exportar. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <InternalShell title="Lista de Espera">
      <WaitlistAccessPanel
        liberados={emailsLiberados.size}
        pendentes={emailsPendentes.size}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-xl text-sm text-[var(--onside-muted)]">
          Todos os inscritos na lista de espera — torcedores e bares.
        </p>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={isLoading || exporting || filtered.length === 0}
          className="onside-btn onside-btn-ink min-h-11 shrink-0 px-4 text-xs"
        >
          {exporting ? (
            <Loader
              size={14}
              color="currentColor"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Export size={14} color="currentColor" aria-hidden="true" />
          )}
          {exporting ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="onside-stat">
          <div className="mb-2 flex items-center gap-2">
            <Users size={16} color="currentColor" aria-hidden="true" />
            <span className="onside-stat-label">Total de inscritos</span>
          </div>
          <div className="onside-stat-value tabular-nums" aria-live="polite">
            {isLoading ? '…' : total}
          </div>
        </div>
        <div className="onside-stat">
          <div className="mb-2 flex items-center gap-2">
            <Fire size={16} color="currentColor" aria-hidden="true" />
            <span className="onside-stat-label">Torcedores</span>
          </div>
          <div className="onside-stat-value tabular-nums" aria-live="polite">
            {isLoading ? '…' : fanCount}
          </div>
        </div>
        <div className="onside-stat">
          <div className="mb-2 flex items-center gap-2">
            <Store size={16} color="currentColor" aria-hidden="true" />
            <span className="onside-stat-label">Bares / Pubs</span>
          </div>
          <div className="onside-stat-value tabular-nums" aria-live="polite">
            {isLoading ? '…' : pubCount}
          </div>
        </div>
      </div>

      <div className="onside-panel mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor={searchId} className="onside-label">
            Buscar inscritos
          </label>
          <div className="relative">
            <Search
              size={16}
              color="currentColor"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--onside-muted)]"
              aria-hidden="true"
            />
            <input
              id={searchId}
              name="waitlist-search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="E-mail, cidade ou estabelecimento…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="onside-input pl-10"
            />
          </div>
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor={roleFilterId} className="onside-label">
            Tipo
          </label>
          <Select
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v ?? 'all')}
            items={ROLE_FILTER_ITEMS}
          >
            <SelectTrigger
              id={roleFilterId}
              className="onside-select h-12 w-full min-h-12 border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] text-sm"
            >
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)]">
              <SelectGroup>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="fan">Torcedor</SelectItem>
                <SelectItem value="pub">Bar / Pub</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div
          className="onside-panel flex items-center justify-center gap-2 py-16 text-sm text-[var(--onside-muted)]"
          role="status"
          aria-live="polite"
        >
          <Loader
            size={18}
            color="currentColor"
            className="animate-spin"
            aria-hidden="true"
          />
          Carregando inscritos…
        </div>
      ) : isError ? (
        <div
          className="onside-callout onside-callout-danger"
          role="alert"
          aria-live="assertive"
        >
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm">Erro ao carregar dados</p>
            <p className="mt-1 text-sm text-[var(--onside-muted)]">
              Não foi possível carregar a lista de espera.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="onside-btn onside-btn-outline min-h-11 px-4 text-xs"
          >
            {isFetching ? (
              <Loader
                size={14}
                color="currentColor"
                className="animate-spin"
                aria-hidden="true"
              />
            ) : null}
            Tentar novamente
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="onside-panel py-16 text-center text-sm text-[var(--onside-muted)]">
          Nenhum inscrito encontrado.
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="mb-4 space-y-3 md:hidden" aria-label="Inscritos">
            {filtered.map((s) => {
              const label = entryLabel(s)
              return (
                <li key={s.id} className="onside-panel p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <div
                      className={`grid size-10 shrink-0 place-items-center border border-[var(--onside-ink)] font-bold text-xs ${
                        s.role === 'fan'
                          ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                          : 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
                      }`}
                      aria-hidden="true"
                    >
                      {label.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-all font-medium text-sm">{s.email}</p>
                      <span className="onside-badge onside-badge-stone mt-1">
                        {roleLabel(s.role)}
                      </span>
                    </div>
                  </div>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--onside-muted)]">Telefone</dt>
                      <dd className="text-right">
                        {s.phone ? formatStoredPhone(s.phone) : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--onside-muted)]">
                        Estabelecimento
                      </dt>
                      <dd className="max-w-[60%] truncate text-right">
                        {s.role === 'pub' && s.pubName?.trim()
                          ? s.pubName
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--onside-muted)]">Cidade</dt>
                      <dd className="text-right">
                        {s.city.trim() ? s.city : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--onside-muted)]">Inscrição</dt>
                      <dd className="text-right tabular-nums">
                        {formatDate(s.createdAt)}
                      </dd>
                    </div>
                  </dl>
                </li>
              )
            })}
          </ul>

          {/* Desktop table */}
          <div className="onside-panel hidden overflow-hidden md:block">
            <section
              className="overflow-x-auto"
              aria-label="Tabela de inscritos"
            >
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--onside-line)] border-b hover:bg-transparent">
                    <TableHead className="font-[family-name:var(--onside-mono)] font-semibold text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
                      E-mail
                    </TableHead>
                    <TableHead className="font-[family-name:var(--onside-mono)] font-semibold text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
                      Telefone
                    </TableHead>
                    <TableHead className="font-[family-name:var(--onside-mono)] font-semibold text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
                      Tipo
                    </TableHead>
                    <TableHead className="font-[family-name:var(--onside-mono)] font-semibold text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
                      Estabelecimento
                    </TableHead>
                    <TableHead className="font-[family-name:var(--onside-mono)] font-semibold text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
                      Cidade
                    </TableHead>
                    <TableHead className="font-[family-name:var(--onside-mono)] font-semibold text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
                      Data de inscrição
                    </TableHead>
                    <TableHead className="font-[family-name:var(--onside-mono)] font-semibold text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
                      Acesso
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const label = entryLabel(s)
                    return (
                      <TableRow
                        key={s.id}
                        className="border-[var(--onside-line)] border-b"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <div
                              className={`grid size-8 shrink-0 place-items-center border border-[var(--onside-ink)] font-bold text-xs ${
                                s.role === 'fan'
                                  ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                                  : 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
                              }`}
                              aria-hidden="true"
                            >
                              {label.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="break-all text-sm">{s.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-[var(--onside-muted)]">
                          {s.phone ? formatStoredPhone(s.phone) : '—'}
                        </TableCell>
                        <TableCell>
                          <span className="onside-badge onside-badge-stone">
                            {roleLabel(s.role)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.role === 'pub' ? (
                            <span className="font-medium">
                              {s.pubName?.trim() ? s.pubName : '—'}
                            </span>
                          ) : (
                            <span className="text-[var(--onside-muted)]">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-[var(--onside-muted)]">
                          {s.city.trim() ? s.city : '—'}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-[var(--onside-muted)]">
                          {formatDate(s.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                s.approvedAt
                                  ? 'onside-badge bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                                  : 'onside-badge onside-badge-stone'
                              }
                            >
                              {s.approvedAt ? 'Liberado' : 'Pendente'}
                            </span>
                            <button
                              type="button"
                              disabled={
                                aprovacao.isPending &&
                                aprovacao.variables?.email === s.email
                              }
                              onClick={() =>
                                aprovacao.mutate({
                                  email: s.email,
                                  approved: !s.approvedAt
                                })
                              }
                              className="onside-btn onside-btn-outline min-h-11 px-3 text-xs disabled:opacity-40"
                            >
                              {s.approvedAt ? 'Revogar' : 'Liberar'}
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </section>
            <div className="border-[var(--onside-line)] border-t px-4 py-3 font-[family-name:var(--onside-mono)] text-[11px] text-[var(--onside-muted)]">
              Exibindo {filtered.length} de {subscribers.length} registros
            </div>
          </div>

          <p className="mt-3 font-[family-name:var(--onside-mono)] text-[11px] text-[var(--onside-muted)] md:hidden">
            Exibindo {filtered.length} de {subscribers.length} registros
          </p>
        </>
      )}
    </InternalShell>
  )
}
