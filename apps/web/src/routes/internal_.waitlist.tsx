import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@findsports_oficial/ui/components/select'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
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
import { useEffect, useId, useState } from 'react'
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
import { analytics } from '@/lib/analytics'
import { roleLabel, rolePluralLabel } from '@/lib/roles'
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
  fan: roleLabel('fan'),
  pub: roleLabel('pub')
} as const
type RoleFilter = keyof typeof ROLE_FILTER_ITEMS

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return isMobile
}

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

function AdminWaitlistPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [pageCursor, setPageCursor] = useState<string>()
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const searchId = useId()
  const roleFilterId = useId()
  const isMobile = useIsMobile()

  const trpc = useTRPC()
  const trpcClient = useTRPCClient()
  const queryClient = useQueryClient()

  const queryInput = {
    cursor: pageCursor,
    search: search.trim() || undefined,
    role: roleFilter === 'all' ? undefined : roleFilter,
    limit: 50
  }

  /**
   * ESC-19: a aprovação é da PESSOA, não da linha. O portão de entrada
   * consulta por e-mail, e a mesma pessoa pode ter várias inscrições
   * (torcedor e bar, ou cidades diferentes) — por isso a mutação recebe o
   * e-mail e marca todas as linhas dele de uma vez.
   */
  const aprovacao = useMutation(
    trpc.waitlist.setApproval.mutationOptions({
      onSuccess: async (resultado) => {
        if (resultado.approved) analytics.waitlistInviteSent()
        toast.success(
          resultado.approved
            ? `${resultado.email} liberado.`
            : `Acesso de ${resultado.email} revogado.`
        )
        await queryClient.invalidateQueries({
          queryKey: trpc.waitlist.getAll.queryKey()
        })
      },
      onError: async (erro) => {
        toast.error(erro.message)
        await queryClient.invalidateQueries({
          queryKey: trpc.waitlist.getAll.queryKey()
        })
      }
    })
  )
  const { data, isLoading, isError, isFetching, refetch } = useQuery(
    trpc.waitlist.getAll.queryOptions(queryInput)
  )

  const subscribers = data?.entries ?? []
  const total = data?.total ?? 0
  const fanCount = data?.fanCount ?? 0
  const pubCount = data?.pubCount ?? 0
  const access = data?.access ?? {
    liberados: 0,
    pendentes: 0,
    convitesAtivos: 0,
    convitesExpirados: 0,
    ativados: 0
  }

  function resetPagination() {
    setPageCursor(undefined)
    setCursorHistory([])
  }

  function nextPage() {
    if (!data?.nextCursor) return
    setCursorHistory((history) => [...history, pageCursor ?? ''])
    setPageCursor(data.nextCursor)
  }

  function previousPage() {
    const previousCursor = cursorHistory.at(-1)
    if (previousCursor === undefined) return
    setCursorHistory(cursorHistory.slice(0, -1))
    setPageCursor(previousCursor || undefined)
  }

  function escapeCsv(value: string) {
    return `"${value.replace(/"/g, '""')}"`
  }

  async function handleExportCSV() {
    setExporting(true)
    try {
      const entries: Awaited<
        ReturnType<typeof trpcClient.waitlist.getAll.query>
      >['entries'] = []
      let cursor: string | undefined
      do {
        const page = await trpcClient.waitlist.getAll.query({
          cursor,
          search: search.trim() || undefined,
          role: roleFilter === 'all' ? undefined : roleFilter,
          limit: 500
        })
        entries.push(...page.entries)
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      const header = [
        'ID',
        'Email',
        'Telefone',
        'Tipo',
        'Estabelecimento',
        'Cidade',
        'Data de inscrição'
      ]
      const rows = entries.map((s) => [
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
      toast.success(`${entries.length} registros exportados.`)
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
        liberados={access.liberados}
        pendentes={access.pendentes}
        convitesAtivos={access.convitesAtivos}
        convitesExpirados={access.convitesExpirados}
        ativados={access.ativados}
        loading={isLoading}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-xl text-sm text-[var(--onside-muted)]">
          Todos os inscritos na lista de espera — torcedores e bares.
        </p>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={isLoading || exporting || total === 0}
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

      <div
        className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
        aria-busy={isLoading || undefined}
      >
        <div className="onside-stat">
          <div className="mb-2 flex items-center gap-2">
            <Users size={16} color="currentColor" aria-hidden="true" />
            <span className="onside-stat-label">Total de inscritos</span>
          </div>
          <div className="onside-stat-value tabular-nums" aria-live="polite">
            {isLoading ? <Skeleton className="h-8 w-14" /> : total}
          </div>
        </div>
        <div className="onside-stat">
          <div className="mb-2 flex items-center gap-2">
            <Fire size={16} color="currentColor" aria-hidden="true" />
            <span className="onside-stat-label">{rolePluralLabel('fan')}</span>
          </div>
          <div className="onside-stat-value tabular-nums" aria-live="polite">
            {isLoading ? <Skeleton className="h-8 w-14" /> : fanCount}
          </div>
        </div>
        <div className="onside-stat">
          <div className="mb-2 flex items-center gap-2">
            <Store size={16} color="currentColor" aria-hidden="true" />
            <span className="onside-stat-label">{rolePluralLabel('pub')}</span>
          </div>
          <div className="onside-stat-value tabular-nums" aria-live="polite">
            {isLoading ? <Skeleton className="h-8 w-14" /> : pubCount}
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
              onChange={(e) => {
                setSearch(e.target.value)
                resetPagination()
              }}
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
            onValueChange={(v) => {
              setRoleFilter(v === 'fan' || v === 'pub' ? v : 'all')
              resetPagination()
            }}
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
                <SelectItem value="fan">{roleLabel('fan')}</SelectItem>
                <SelectItem value="pub">{roleLabel('pub')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div
          className="grid gap-3"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Carregando inscritos…</span>
          {isMobile ? (
            <ul className="space-y-3" aria-hidden="true">
              {['mobile-1', 'mobile-2', 'mobile-3', 'mobile-4'].map((key) => (
                <li key={key} className="onside-panel space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="size-10 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-44 max-w-full" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="onside-panel overflow-x-auto" aria-hidden="true">
              <Table className="min-w-[68rem]">
                <TableHeader>
                  <TableRow className="border-[var(--onside-line)] border-b hover:bg-transparent">
                    <TableHead>E-mail</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estabelecimento</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Data de inscrição</TableHead>
                    <TableHead>Acesso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    'desktop-1',
                    'desktop-2',
                    'desktop-3',
                    'desktop-4',
                    'desktop-5',
                    'desktop-6'
                  ].map((key) => (
                    <TableRow
                      key={key}
                      className="border-[var(--onside-line)] border-b"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-8 shrink-0" />
                          <Skeleton className="h-4 w-40" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-11 w-28" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
      ) : subscribers.length === 0 ? (
        <div className="onside-panel py-16 text-center text-sm text-[var(--onside-muted)]">
          Nenhum inscrito encontrado.
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          {isMobile ? (
            <ul className="mb-4 space-y-3" aria-label="Inscritos">
              {subscribers.map((s) => {
                const label = entryLabel(s)
                const conviteExpirado = Boolean(
                  s.approvedAt &&
                    !s.activatedAt &&
                    s.inviteExpiresAt &&
                    new Date(s.inviteExpiresAt).getTime() <= Date.now()
                )
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
                        <p className="break-all font-medium text-sm">
                          {s.email}
                        </p>
                        <span className="onside-badge onside-badge-stone mt-1">
                          {roleLabel(s.role)}
                        </span>
                        {s.accountExists && !s.approvedAt ? (
                          <span className="onside-badge onside-badge-stone mt-1 ml-1">
                            Conta existente — acesso pendente
                          </span>
                        ) : null}
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
                        <dt className="text-[var(--onside-muted)]">
                          Inscrição
                        </dt>
                        <dd className="text-right tabular-nums">
                          {formatDate(s.createdAt)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <dt className="text-[var(--onside-muted)]">Acesso</dt>
                        <dd>
                          <button
                            type="button"
                            disabled={
                              Boolean(
                                s.activatedAt || s.cancelledAt || !s.confirmedAt
                              ) || aprovacao.isPending
                            }
                            onClick={() =>
                              aprovacao.mutate({
                                email: s.email,
                                approved:
                                  s.inviteError || conviteExpirado
                                    ? true
                                    : !s.approvedAt
                              })
                            }
                            className="onside-btn onside-btn-outline min-h-11 px-3 text-xs disabled:opacity-40"
                          >
                            {s.approvedAt
                              ? s.inviteError || conviteExpirado
                                ? 'Reenviar convite'
                                : 'Revogar'
                              : 'Aprovar e convidar'}
                          </button>
                        </dd>
                      </div>
                    </dl>
                  </li>
                )
              })}
            </ul>
          ) : (
            <>
              {/* Desktop table */}
              {/*
               * O `Table` do shadcn já traz o próprio contêiner de rolagem.
               * Havia um `overflow-x-auto` extra por fora dele e um
               * `overflow-hidden` no painel: dois scrollers aninhados no mesmo
               * eixo, e a coluna de ações — a última — ficava recortada sem
               * barra que a alcançasse. Sobrou um contêiner só, e a largura
               * mínima da tabela garante que ele de fato role em vez de
               * espremer as colunas.
               */}
              <div className="onside-panel">
                <section aria-label="Tabela de inscritos">
                  <Table className="min-w-[68rem]">
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
                      {subscribers.map((s) => {
                        const label = entryLabel(s)
                        const conviteExpirado = Boolean(
                          s.approvedAt &&
                            !s.activatedAt &&
                            s.inviteExpiresAt &&
                            new Date(s.inviteExpiresAt).getTime() <= Date.now()
                        )
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
                                <span className="break-all text-sm">
                                  {s.email}
                                </span>
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
                            <TableCell className="whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span
                                  className={
                                    s.approvedAt
                                      ? 'onside-badge bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                                      : 'onside-badge onside-badge-stone'
                                  }
                                >
                                  {s.activatedAt
                                    ? 'Conta ativada'
                                    : s.accountExists && !s.approvedAt
                                      ? 'Conta existente — acesso pendente'
                                      : s.cancelledAt
                                        ? 'Saiu da lista'
                                        : !s.confirmedAt
                                          ? 'Aguardando confirmação'
                                          : s.approvedAt
                                            ? s.inviteError
                                              ? 'Aprovado — falha no envio'
                                              : conviteExpirado
                                                ? 'Convite expirado'
                                                : 'Convite enviado'
                                            : s.joinedError
                                              ? 'Confirmado — falha no envio'
                                              : 'Pendente'}
                                </span>
                                <button
                                  type="button"
                                  disabled={
                                    Boolean(
                                      s.activatedAt ||
                                        s.cancelledAt ||
                                        !s.confirmedAt
                                    ) ||
                                    (aprovacao.isPending &&
                                      aprovacao.variables?.email === s.email)
                                  }
                                  onClick={() =>
                                    aprovacao.mutate({
                                      email: s.email,
                                      approved:
                                        s.inviteError || conviteExpirado
                                          ? true
                                          : !s.approvedAt
                                    })
                                  }
                                  className="onside-btn onside-btn-outline min-h-11 px-3 text-xs disabled:opacity-40"
                                >
                                  {s.approvedAt
                                    ? s.inviteError || conviteExpirado
                                      ? 'Reenviar'
                                      : 'Revogar'
                                    : 'Aprovar e convidar'}
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
                  Exibindo {subscribers.length} de {total} registros
                </div>
              </div>
            </>
          )}

          {isMobile ? (
            <p className="mt-3 font-[family-name:var(--onside-mono)] text-[11px] text-[var(--onside-muted)]">
              Exibindo {subscribers.length} de {total} registros
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={previousPage}
              disabled={cursorHistory.length === 0 || isFetching}
              className="onside-btn onside-btn-outline min-h-11 px-3 text-xs disabled:opacity-40"
            >
              Página anterior
            </button>
            <span className="font-[family-name:var(--onside-mono)] text-[11px] text-[var(--onside-muted)]">
              Página {cursorHistory.length + 1}
            </span>
            <button
              type="button"
              onClick={nextPage}
              disabled={!data?.nextCursor || isFetching}
              className="onside-btn onside-btn-outline min-h-11 px-3 text-xs disabled:opacity-40"
            >
              Próxima página
            </button>
          </div>
        </>
      )}
    </InternalShell>
  )
}
