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
import {
  ArrowLeft01Icon,
  BlockedIcon,
  Calendar01Icon,
  CrownIcon,
  Loading03Icon,
  Logout01Icon,
  Mail01Icon,
  MoreVerticalIcon,
  Search01Icon,
  ShieldUserIcon,
  User02Icon,
  UserCheck01Icon,
  UserMultipleIcon,
  UserSwitchIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

export const Route = createFileRoute('/internal_/manage-users')({
  head: () => ({
    meta: [
      { title: 'Admin — Gerenciar Usuários' },
      {
        name: 'description',
        content: 'Gerenciamento de usuários da plataforma FindSports.'
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
  if (role === 'fan') return 'border-none bg-brand-orange/10 text-brand-orange'
  if (role === 'pub') return 'border-none bg-brand-blue/10 text-brand-blue'
  if (role === 'admin') return 'border-none bg-zinc-800 text-white'
  return 'border-none bg-zinc-100 text-zinc-600'
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
  const router = useRouter()
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
  async function handleLogout() {
    await authClient.signOut()
    router.navigate({ to: '/login' })
  }

  async function handleImpersonate(user: AdminUser) {
    const res = await authClient.admin.impersonateUser({ userId: user.id })
    if (res.error) {
      toast.error(`Erro ao impersonar: ${res.error.message}`)
      return
    }
    // Hard reload so the browser sends the new impersonation cookie to the server
    window.location.href = '/'
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
                Total de usuários
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100">
              <HugeiconsIcon
                icon={ShieldUserIcon}
                className="size-5 text-zinc-700"
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
                  adminCount
                )}
              </div>
              <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Admins
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100">
              <HugeiconsIcon
                icon={BlockedIcon}
                className="size-5 text-red-500"
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
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-black/5 border-b hover:bg-transparent">
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={User02Icon} className="size-3.5" />
                      Usuário
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
                      <HugeiconsIcon icon={CrownIcon} className="size-3.5" />
                      Role
                    </span>
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <HugeiconsIcon
                        icon={Calendar01Icon}
                        className="size-3.5"
                      />
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
                    <TableRow key={u.id} className="border-black/5 border-b">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div
                            className={`grid size-8 shrink-0 place-items-center rounded-full font-bold text-white text-xs ${
                              u.role === 'admin'
                                ? 'bg-zinc-800'
                                : u.role === 'pub'
                                  ? 'bg-brand-blue'
                                  : 'bg-brand-orange'
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
                              className="rounded-full border-none bg-zinc-100 text-zinc-500 text-[10px] font-bold uppercase tracking-wider"
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
                          className={`rounded-full font-bold text-[10px] uppercase tracking-wider ${getRoleBadgeClass(u.role)}`}
                        >
                          {getRoleLabel(u.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.banned ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge
                              variant="secondary"
                              className="w-fit rounded-full border-none bg-red-50 text-red-600 font-bold text-[10px] uppercase tracking-wider"
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
                            className="rounded-full border-none bg-green-50 text-green-600 font-bold text-[10px] uppercase tracking-wider"
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
                                  className="inline-flex size-8 items-center justify-center rounded-full border border-black/10 bg-white text-zinc-500 transition-colors hover:border-black/20 hover:text-zinc-900"
                                />
                              }
                            >
                              <HugeiconsIcon
                                icon={MoreVerticalIcon}
                                className="size-4"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" side="bottom">
                              <DropdownMenuGroup>
                                <DropdownMenuLabel>{u.name}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleImpersonate(u)}
                                >
                                  <HugeiconsIcon
                                    icon={UserSwitchIcon}
                                    className="size-4"
                                  />
                                  Impersonar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setRoleDialogUser(u)
                                    setNewRole(u.role)
                                  }}
                                >
                                  <HugeiconsIcon
                                    icon={CrownIcon}
                                    className="size-4"
                                  />
                                  Alterar role
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {u.banned ? (
                                  <DropdownMenuItem
                                    onClick={() => handleUnban(u)}
                                  >
                                    <HugeiconsIcon
                                      icon={UserCheck01Icon}
                                      className="size-4"
                                    />
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
                                    <HugeiconsIcon
                                      icon={BlockedIcon}
                                      className="size-4"
                                    />
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
          <div className="border-black/5 border-t px-4 py-3 text-muted-foreground text-xs">
            {isLoading
              ? 'Carregando usuários...'
              : `Exibindo ${filtered.length} de ${allUsers.length} usuários`}
          </div>
        </div>
      </main>

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
            <label className="block text-sm font-semibold text-zinc-700">
              Motivo do banimento{' '}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </label>
            <Textarea
              placeholder="Ex: Violação dos termos de uso..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              className="resize-none rounded-xl border-black/10 bg-zinc-50 text-sm"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-black/5 px-6 py-4">
            <DialogClose className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-black/20 hover:text-zinc-900 transition-colors">
              Cancelar
            </DialogClose>
            <button
              type="button"
              onClick={handleBan}
              disabled={banLoading}
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {banLoading && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  className="size-4 animate-spin"
                />
              )}
              <HugeiconsIcon icon={BlockedIcon} className="size-4" />
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
            <label className="block text-sm font-semibold text-zinc-700">
              Novo role
            </label>
            <Select
              value={newRole}
              onValueChange={(v) => {
                if (v) setNewRole(v)
              }}
            >
              <SelectTrigger className="rounded-xl border-black/10 bg-zinc-50 w-full">
                <SelectValue placeholder="Selecione um role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fan">Torcedor</SelectItem>
                <SelectItem value="pub">Bar / Pub</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            {newRole === 'admin' && (
              <p className="text-xs text-amber-600 font-medium">
                Atenção: este usuário terá acesso total ao painel admin.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-black/5 px-6 py-4">
            <DialogClose className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-black/20 hover:text-zinc-900 transition-colors">
              Cancelar
            </DialogClose>
            <button
              type="button"
              onClick={handleSetRole}
              disabled={roleLoading || !newRole}
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-blue disabled:opacity-50"
            >
              {roleLoading && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  className="size-4 animate-spin"
                />
              )}
              <HugeiconsIcon icon={CrownIcon} className="size-4" />
              Salvar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
