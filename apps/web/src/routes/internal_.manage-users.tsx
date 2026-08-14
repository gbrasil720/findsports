/** biome-ignore-all lint/a11y/noLabelWithoutControl: Dialog fields use associated labels via layout patterns already present. */
import { Badge } from '@findsports_oficial/ui/components/badge'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@findsports_oficial/ui/components/dropdown-menu'
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
import { Textarea } from '@findsports_oficial/ui/components/textarea'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import Ban from 'reicon-react/icons/Ban'
import Calendar from 'reicon-react/icons/Calendar'
import Envelope from 'reicon-react/icons/Envelope'
import Loader from 'reicon-react/icons/Loader'
import More from 'reicon-react/icons/More'
import Search from 'reicon-react/icons/Search'
import Shield from 'reicon-react/icons/Shield'
import Trophy from 'reicon-react/icons/Trophy'
import User from 'reicon-react/icons/User'
import Users from 'reicon-react/icons/Users'
import { toast } from 'sonner'
import { InternalShell } from '@/components/app/internal-shell'
import { getUser } from '@/functions/get-user'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/internal_/manage-users')({
  head: () => ({
    meta: [
      { title: 'Gerenciar usuários — Onside Admin' },
      {
        name: 'description',
        content: 'Gerenciamento de usuários da plataforma Onside.'
      }
    ]
  }),
  beforeLoad: async () => {
    const session = await getUser()
    return { session }
  },
  loader: async ({ context }): Promise<{ currentUserId: string }> => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
    if (context.session.user.role !== 'admin') {
      throw redirect({ to: '/' })
    }
    return { currentUserId: context.session.user.id }
  },
  component: ManageUsersPage
})

/* ---------- types ---------- */
type AdminUser = {
  id: string
  name: string
  email: string
  role: string
  banned: boolean | null
  banReason: string | null
  banExpires: Date | string | null
  createdAt: Date | string
  image?: string | null
}

/* ---------- helpers ---------- */
function formatDate(date: Date | string) {
  const d = new Date(date)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

function getRoleLabel(role: string) {
  if (role === 'fan') return 'Torcedor'
  if (role === 'pub') return 'Bar / Pub'
  if (role === 'admin') return 'Admin'
  return role
}

function getRoleBadgeClass(role: string) {
  if (role === 'fan') return 'onside-badge onside-badge-acid'
  if (role === 'pub') return 'onside-badge onside-badge-ink'
  if (role === 'admin') return 'onside-badge onside-badge-ink'
  return 'onside-badge onside-badge-stone'
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/* ---------- page ---------- */
function ManageUsersPage() {
  const queryClient = useQueryClient()
  const { currentUserId } = Route.useLoaderData()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  // Dialog states
  const [banDialogUser, setBanDialogUser] = useState<AdminUser | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banLoading, setBanLoading] = useState(false)
  const [roleDialogUser, setRoleDialogUser] = useState<AdminUser | null>(null)
  const [newRole, setNewRole] = useState('')
  const [roleLoading, setRoleLoading] = useState(false)

  /* --- data --- */
  const {
    data: usersData,
    isLoading,
    isError
  } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await authClient.admin.listUsers({ query: { limit: 200 } })
      if (res.error) throw new Error(res.error.message)
      return res.data
    }
  })

  const allUsers = (usersData?.users ?? []) as AdminUser[]

  const filtered = allUsers.filter((u) => {
    const matchesSearch =
      search === '' ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  const total = allUsers.length
  const adminCount = allUsers.filter((u) => u.role === 'admin').length
  const bannedCount = allUsers.filter((u) => u.banned).length

  /* --- actions --- */
  async function handleImpersonate(user: AdminUser) {
    const res = await authClient.admin.impersonateUser({ userId: user.id })
    if (res.error || !res.data) {
      toast.error(res.error?.message ?? 'Falha ao impersonar usuário.')
      return
    }
    // Hard reload — forces browser to send the new impersonation cookie on the next request.
    // Redirect to role-appropriate page so impersonation is visually confirmed.
    window.location.href = user.role === 'pub' ? '/admin' : '/dashboard'
  }

  async function handleBan() {
    if (!banDialogUser) return
    setBanLoading(true)
    try {
      const res = await authClient.admin.banUser({
        userId: banDialogUser.id,
        banReason: banReason || undefined
      })
      if (res.error) {
        toast.error(`Erro ao banir: ${res.error.message}`)
        return
      }
      toast.success(`${banDialogUser.name} foi banido.`)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setBanDialogUser(null)
      setBanReason('')
    } finally {
      setBanLoading(false)
    }
  }

  async function handleUnban(user: AdminUser) {
    const res = await authClient.admin.unbanUser({ userId: user.id })
    if (res.error) {
      toast.error(`Erro ao desbanir: ${res.error.message}`)
      return
    }
    toast.success(`${user.name} foi desbanido.`)
    await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  async function handleSetRole() {
    if (!roleDialogUser || !newRole) return
    setRoleLoading(true)
    try {
      const res = await authClient.admin.setRole({
        userId: roleDialogUser.id,
        // biome-ignore lint/suspicious/noExplicitAny: custom role values not typed by admin plugin
        role: newRole as any
      })
      if (res.error) {
        toast.error(`Erro ao alterar role: ${res.error.message}`)
        return
      }
      toast.success(
        `Role de ${roleDialogUser.name} alterado para ${getRoleLabel(newRole)}.`
      )
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setRoleDialogUser(null)
      setNewRole('')
    } finally {
      setRoleLoading(false)
    }
  }

  return (
    <InternalShell title="Gerenciar usuários" kicker="Admin interno">
      <div className="space-y-6">
        {/* Title */}
        <div>
          <h1 className="font-bold font-heading text-2xl tracking-tight">
            Gerenciar Usuários
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Impersone, bana e altere roles de usuários da plataforma.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-none border border-[var(--onside-line)] bg-[var(--onside-paper)] p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-none bg-[var(--onside-stone)]">
              <Users className="size-5 text-[var(--onside-ink)]" />
            </div>
            <div>
              <div className="font-bold font-heading text-2xl">
                {isLoading ? (
                  <Loader className="size-5 animate-spin text-[var(--onside-muted)]" />
                ) : (
                  total
                )}
              </div>
              <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Total de usuários
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-none border border-[var(--onside-line)] bg-[var(--onside-paper)] p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-none bg-[var(--onside-stone)]">
              <Shield className="size-5 text-[var(--onside-ink)]" />
            </div>
            <div>
              <div className="font-bold font-heading text-2xl">
                {isLoading ? (
                  <Loader className="size-5 animate-spin text-[var(--onside-muted)]" />
                ) : (
                  adminCount
                )}
              </div>
              <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Admins
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-none border border-[var(--onside-line)] bg-[var(--onside-paper)] p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-none bg-[var(--onside-stone)]">
              <Ban className="size-5 text-[var(--onside-live-text)]" />
            </div>
            <div>
              <div className="font-bold font-heading text-2xl">
                {isLoading ? (
                  <Loader className="size-5 animate-spin text-[var(--onside-muted)]" />
                ) : (
                  bannedCount
                )}
              </div>
              <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Banidos
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 rounded-none border border-[var(--onside-line)] bg-[var(--onside-paper)] p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--onside-muted)]" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-none border-none bg-[var(--onside-paper)] pl-10 focus:ring-2 focus:ring-black/10"
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v ?? 'all')}
          >
            <SelectTrigger className="w-full rounded-none border-none bg-[var(--onside-paper)] sm:w-48">
              <SelectValue placeholder="Filtrar por role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="fan">Torcedor</SelectItem>
              <SelectItem value="pub">Bar / Pub</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-none border border-[var(--onside-line)] bg-[var(--onside-paper)]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--onside-line)] border-b hover:bg-transparent">
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <User className="size-3.5" />
                      Usuário
                    </span>
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Envelope className="size-3.5" />
                      E-mail
                    </span>
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Trophy className="size-3.5" />
                      Role
                    </span>
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      Criado em
                    </span>
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center">
                      <Loader className="mx-auto size-6 animate-spin text-[var(--onside-muted)]" />
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-[var(--onside-live-text)] text-sm"
                    >
                      Erro ao carregar usuários. Tente novamente.
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((u) => (
                    <TableRow
                      key={u.id}
                      className="border-[var(--onside-line)] border-b"
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div
                            className={`grid size-8 shrink-0 place-items-center rounded-none font-bold text-xs ${
                              u.role === 'admin'
                                ? 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
                                : u.role === 'pub'
                                  ? 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
                                  : 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                            }`}
                          >
                            {getInitials(u.name)}
                          </div>
                          <span className="max-w-[160px] truncate">
                            {u.name}
                          </span>
                          {u.id === currentUserId && (
                            <Badge
                              variant="secondary"
                              className="rounded-none border-none bg-[var(--onside-stone)] text-[var(--onside-muted)] text-[10px] font-bold uppercase tracking-wider"
                            >
                              Você
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`rounded-none font-bold text-[10px] uppercase tracking-wider ${getRoleBadgeClass(u.role)}`}
                        >
                          {getRoleLabel(u.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.banned ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge
                              variant="secondary"
                              className="w-fit rounded-none border border-[var(--onside-live)] bg-[color-mix(in_srgb,var(--onside-live)_12%,var(--onside-paper))] text-[var(--onside-live-text)] font-bold text-[10px] uppercase tracking-wider"
                            >
                              Banido
                            </Badge>
                            {u.banReason && (
                              <span
                                className="text-xs text-muted-foreground truncate max-w-[140px]"
                                title={u.banReason}
                              >
                                {u.banReason}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="rounded-none border-none bg-[var(--onside-stone)] text-[var(--onside-ink)] font-bold text-[10px] uppercase tracking-wider"
                          >
                            Ativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.id !== currentUserId ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  className="inline-flex size-8 items-center justify-center rounded-none border border-[var(--onside-line)] bg-[var(--onside-paper)] text-[var(--onside-muted)] transition-colors hover:border-[var(--onside-ink)] hover:text-[var(--onside-ink)]"
                                />
                              }
                            >
                              <More className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" side="bottom">
                              <DropdownMenuGroup>
                                <DropdownMenuLabel>{u.name}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleImpersonate(u)}
                                >
                                  <Users className="size-4" />
                                  Impersonar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setRoleDialogUser(u)
                                    setNewRole(u.role)
                                  }}
                                >
                                  <Trophy className="size-4" />
                                  Alterar role
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {u.banned ? (
                                  <DropdownMenuItem
                                    onClick={() => handleUnban(u)}
                                  >
                                    <User className="size-4" />
                                    Desbanir
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => {
                                      setBanDialogUser(u)
                                      setBanReason('')
                                    }}
                                  >
                                    <Ban className="size-4" />
                                    Banir
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="border-[var(--onside-line)] border-t px-4 py-3 text-muted-foreground text-xs">
            {isLoading
              ? 'Carregando usuários...'
              : `Exibindo ${filtered.length} de ${allUsers.length} usuários`}
          </div>
        </div>
      </div>

      {/* Ban dialog */}
      <Dialog
        open={banDialogUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBanDialogUser(null)
            setBanReason('')
          }
        }}
      >
        <DialogContent className="p-0 overflow-hidden max-w-[calc(100vw-2rem)] sm:max-w-md">
          <div className="p-6">
            <DialogTitle>Banir usuário</DialogTitle>
            <DialogDescription className="mt-1">
              {banDialogUser?.name} ({banDialogUser?.email}) será impedido de
              fazer login.
            </DialogDescription>
          </div>
          <div className="px-6 pb-4 space-y-3">
            <label className="block text-sm font-semibold text-[var(--onside-ink)]">
              Motivo do banimento{' '}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </label>
            <Textarea
              placeholder="Ex: Violação dos termos de uso..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              className="resize-none rounded-none border-[var(--onside-line)] bg-[var(--onside-paper)] text-sm"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--onside-line)] px-6 py-4">
            <DialogClose className="rounded-none border border-[var(--onside-line)] px-4 py-2 text-sm font-medium text-[var(--onside-muted)] hover:border-[var(--onside-ink)] hover:text-[var(--onside-ink)] transition-colors">
              Cancelar
            </DialogClose>
            <button
              type="button"
              onClick={handleBan}
              disabled={banLoading}
              className="inline-flex min-h-11 items-center gap-2 rounded-none bg-[var(--onside-live)] px-5 py-2 text-sm font-bold text-[var(--onside-paper)] transition-colors hover:bg-[var(--onside-live-text)] disabled:opacity-50"
            >
              {banLoading && <Loader className="size-4 animate-spin" />}
              <Ban className="size-4" />
              Banir
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Set role dialog */}
      <Dialog
        open={roleDialogUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRoleDialogUser(null)
            setNewRole('')
          }
        }}
      >
        <DialogContent className="p-0 overflow-hidden max-w-[calc(100vw-2rem)] sm:max-w-md">
          <div className="p-6">
            <DialogTitle>Alterar role</DialogTitle>
            <DialogDescription className="mt-1">
              Altere o nível de acesso de {roleDialogUser?.name}.
            </DialogDescription>
          </div>
          <div className="px-6 pb-4 space-y-3">
            <label className="block text-sm font-semibold text-[var(--onside-ink)]">
              Novo role
            </label>
            <Select
              value={newRole}
              onValueChange={(v) => {
                if (v) setNewRole(v)
              }}
            >
              <SelectTrigger className="rounded-none border-[var(--onside-line)] bg-[var(--onside-paper)] w-full">
                <SelectValue placeholder="Selecione um role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fan">Torcedor</SelectItem>
                <SelectItem value="pub">Bar / Pub</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            {newRole === 'admin' && (
              <p className="text-xs text-[var(--onside-live-text)] font-medium">
                Atenção: este usuário terá acesso total ao painel admin.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--onside-line)] px-6 py-4">
            <DialogClose className="rounded-none border border-[var(--onside-line)] px-4 py-2 text-sm font-medium text-[var(--onside-muted)] hover:border-[var(--onside-ink)] hover:text-[var(--onside-ink)] transition-colors">
              Cancelar
            </DialogClose>
            <button
              type="button"
              onClick={handleSetRole}
              disabled={roleLoading || !newRole}
              className="inline-flex min-h-11 items-center gap-2 rounded-none bg-[var(--onside-ink)] px-5 py-2 text-sm font-bold text-[var(--onside-paper)] transition-colors hover:bg-[var(--onside-ink)] disabled:opacity-50"
            >
              {roleLoading && <Loader className="size-4 animate-spin" />}
              <Trophy className="size-4" />
              Salvar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </InternalShell>
  )
}
