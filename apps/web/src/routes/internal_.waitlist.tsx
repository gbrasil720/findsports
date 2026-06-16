import { Badge } from '@findsports_oficial/ui/components/badge'
import { Input } from '@findsports_oficial/ui/components/input'
import {
  Select,
  SelectContent,
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
import {
  ArrowLeft01Icon,
  Calendar01Icon,
  Download01Icon,
  DrinkIcon,
  Fire02Icon,
  Loading03Icon,
  Location01Icon,
  Logout01Icon,
  Mail01Icon,
  Search01Icon,
  SmartPhone01Icon,
  User02Icon,
  UserMultipleIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  redirect,
  useRouter
} from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { Logo } from '@/components/landing/logo'
import { getUser } from '@/functions/get-user'
import { authClient } from '@/lib/auth-client'
import { formatStoredPhone } from '@/utils/format-phone'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/internal_/waitlist')({
  head: () => ({
    meta: [
      { title: 'Admin — FindSports Waitlist' },
      {
        name: 'description',
        content: 'Painel administrativo da lista de espera FindSports.'
      }
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

/* ---------- helpers ---------- */
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

/* ---------- page ---------- */
function AdminWaitlistPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const router = useRouter()

  async function handleLogout() {
    await authClient.signOut()
    router.navigate({ to: '/login' })
  }

  const trpc = useTRPC()
  const {
    data: subscribers = [],
    isLoading,
    isError
  } = useQuery(trpc.waitlist.getAll.queryOptions())

  const filtered = subscribers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' ? true : s.role === roleFilter
    return matchesSearch && matchesRole
  })

  const total = filtered.length
  const fanCount = filtered.filter((s) => s.role === 'fan').length
  const pubCount = filtered.filter((s) => s.role === 'pub').length

  function handleExportCSV() {
    try {
      const header = [
        'ID',
        'Nome',
        'Email',
        'Telefone',
        'Tipo',
        'Estabelecimento',
        'Bairro',
        'Data de inscrição'
      ]
      const rows = filtered.map((s) => [
        s.id,
        s.name,
        s.email,
        s.phone ?? '',
        s.role,
        s.pubName !== 'N/A' ? s.pubName : '',
        s.bairro !== 'N/A' ? s.bairro : '',
        formatDate(s.createdAt)
      ])
      const csv = [header, ...rows]
        .map((r) => r.map((v) => `"${v}"`).join(','))
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
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-body text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-black/5 border-b bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 md:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <Logo className="size-8" />
            <span className="font-bold font-heading text-lg tracking-tight">
              FindSports
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/internal"
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 font-medium text-sm text-zinc-600 transition-colors hover:border-black/20 hover:text-zinc-900"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
              Hall
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange px-2 py-1 font-bold text-[10px] text-white uppercase tracking-[0.2em]">
              Admin
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 font-medium text-sm text-zinc-600 transition-colors hover:border-black/20 hover:text-zinc-900"
            >
              <HugeiconsIcon icon={Logout01Icon} className="size-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 md:px-8">
        {/* Title */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-bold font-heading text-2xl tracking-tight">
              Lista de Espera
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Todos os inscritos na lista de espera — torcedores e bares.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={isLoading || filtered.length === 0}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-black px-5 py-2.5 font-bold text-sm text-white transition-colors hover:bg-brand-orange disabled:opacity-50"
          >
            <HugeiconsIcon icon={Download01Icon} className="size-4" />
            Exportar CSV
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100">
              <HugeiconsIcon
                icon={UserMultipleIcon}
                className="size-5 text-brand-orange"
              />
            </div>
            <div>
              <div className="font-bold font-heading text-2xl">
                {isLoading ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    className="size-5 animate-spin text-zinc-400"
                  />
                ) : (
                  total
                )}
              </div>
              <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Total de inscritos
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100">
              <HugeiconsIcon
                icon={Fire02Icon}
                className="size-5 text-brand-orange"
              />
            </div>
            <div>
              <div className="font-bold font-heading text-2xl">
                {isLoading ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    className="size-5 animate-spin text-zinc-400"
                  />
                ) : (
                  fanCount
                )}
              </div>
              <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Torcedores
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100">
              <HugeiconsIcon
                icon={DrinkIcon}
                className="size-5 text-brand-blue"
              />
            </div>
            <div>
              <div className="font-bold font-heading text-2xl">
                {isLoading ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    className="size-5 animate-spin text-zinc-400"
                  />
                ) : (
                  pubCount
                )}
              </div>
              <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Bares / Pubs
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-4 sm:flex-row">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
            />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-full border-none bg-zinc-50 pl-10 focus:ring-2 focus:ring-black/10"
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v ?? 'all')}
          >
            <SelectTrigger className="w-full rounded-full border-none bg-zinc-50 sm:w-48">
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="fan">Torcedor</SelectItem>
              <SelectItem value="pub">Bar / Pub</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-black/5 border-b hover:bg-transparent">
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={User02Icon} className="size-3.5" />
                      Nome
                    </span>
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Mail01Icon} className="size-3.5" />
                      E-mail
                    </span>
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <HugeiconsIcon
                        icon={SmartPhone01Icon}
                        className="size-3.5"
                      />
                      Telefone
                    </span>
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    Tipo
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={DrinkIcon} className="size-3.5" />
                      Estabelecimento
                    </span>
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <HugeiconsIcon
                        icon={Calendar01Icon}
                        className="size-3.5"
                      />
                      Data de inscrição
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center">
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        className="mx-auto size-6 animate-spin text-zinc-400"
                      />
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-red-500 text-sm"
                    >
                      Erro ao carregar dados. Tente novamente.
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      Nenhum inscrito encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => (
                    <TableRow key={s.id} className="border-black/5 border-b">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div
                            className={`grid size-8 shrink-0 place-items-center rounded-full font-bold text-white text-xs ${
                              s.role === 'fan'
                                ? 'bg-brand-orange'
                                : 'bg-brand-blue'
                            }`}
                          >
                            {s.name.slice(0, 1)}
                          </div>
                          {s.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {s.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {s.phone ? formatStoredPhone(s.phone) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`rounded-full font-bold text-[10px] uppercase tracking-wider ${
                            s.role === 'fan'
                              ? 'border-none bg-brand-orange/10 text-brand-orange'
                              : 'border-none bg-brand-blue/10 text-brand-blue'
                          }`}
                        >
                          {s.role === 'fan' ? 'Torcedor' : 'Bar / Pub'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.role === 'pub' ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {s.pubName !== 'N/A' ? s.pubName : '—'}
                            </span>
                            {s.bairro !== 'N/A' && (
                              <span className="mt-0.5 inline-flex items-center gap-1 text-muted-foreground text-xs">
                                <HugeiconsIcon
                                  icon={Location01Icon}
                                  className="size-3"
                                />
                                {s.bairro}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(s.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {/* Footer info */}
          <div className="border-black/5 border-t px-4 py-3 text-muted-foreground text-xs">
            {isLoading
              ? 'Carregando registros...'
              : `Exibindo ${filtered.length} de ${subscribers.length} registros`}
          </div>
        </div>
      </main>
    </div>
  )
}
