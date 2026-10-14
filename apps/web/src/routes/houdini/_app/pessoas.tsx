import type { AppRouter } from '@findsports_oficial/api/routers/index'
import {
  keepPreviousData,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { useState } from 'react'
import { toast } from 'sonner'

import { formatDate, initials } from '@/components/houdini/format'
import { HoldButton } from '@/components/houdini/hold-button'
import { HatIcon } from '@/components/houdini/icons'
import { HoudiniShell } from '@/components/houdini/shell'
import { authClient } from '@/lib/auth-client'
import { appHref } from '@/lib/houdini-host'
import { roleLabel } from '@/lib/roles'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/pessoas')({
  head: () => ({ meta: [{ title: 'Pessoas — Houdini' }] }),
  component: PessoasPage
})

type Person =
  inferRouterOutputs<AppRouter>['adminUsers']['list']['users'][number]
type Role = 'fan' | 'pub' | 'admin'

const ROLE_FILTERS = [
  { value: undefined, label: 'Todos' },
  { value: 'fan', label: 'fan' },
  { value: 'pub', label: 'pub' },
  { value: 'admin', label: 'admin' }
] as const

function PessoasPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Role | undefined>()
  const [pickedId, setPickedId] = useState<string | null>(null)

  const query = useQuery({
    ...trpc.adminUsers.list.queryOptions({
      search: search.trim() || undefined,
      role
    }),
    placeholderData: keepPreviousData,
    meta: { errorToast: false }
  })
  const people = query.data?.users ?? []
  const picked = people.find((p) => p.id === pickedId) ?? people[0] ?? null

  return (
    <HoudiniShell title="Pessoas" env={env} user={admin}>
      <div className="hd-split">
        <section className="hd-page" aria-labelledby="pessoas-h">
          <div className="hd-head" style={{ alignItems: 'baseline' }}>
            <h1 id="pessoas-h" className="hd-h1">
              Pessoas
            </h1>
            {query.data ? (
              <span className="hd-mono hd-small">
                {query.data.total} contas · {query.data.admins} admins ·{' '}
                {query.data.banned} sumidas
              </span>
            ) : null}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center'
            }}
          >
            <label htmlFor="hd-busca" className="hd-sr">
              Buscar pessoa
            </label>
            <input
              id="hd-busca"
              type="search"
              className="hd-input"
              placeholder="Buscar por nome ou e-mail..."
              style={{ flex: '1 1 260px' }}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <fieldset className="hd-seg" aria-label="Filtrar por role">
              {ROLE_FILTERS.map((filter) => (
                <button
                  key={filter.label}
                  type="button"
                  aria-pressed={role === filter.value}
                  onClick={() => setRole(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </fieldset>
          </div>

          {query.isError ? (
            <div className="hd-card" role="alert">
              <p style={{ margin: 0 }}>
                {getUserFacingMessage(
                  query.error,
                  'Não foi possível carregar as pessoas.'
                )}
              </p>
              <button
                type="button"
                className="hd-btn"
                style={{ alignSelf: 'flex-start', marginTop: 12 }}
                onClick={() => void query.refetch()}
              >
                Tentar de novo
              </button>
            </div>
          ) : (
            <div className="hd-table-wrap" aria-busy={query.isFetching}>
              <table className="hd-table">
                <thead>
                  <tr>
                    <th scope="col">Quem</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {query.isLoading ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="hd-skeleton" style={{ height: 160 }} />
                      </td>
                    </tr>
                  ) : people.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="hd-empty">
                        Ninguém com esse nome ou e-mail.
                      </td>
                    </tr>
                  ) : (
                    people.map((person) => (
                      <tr
                        key={person.id}
                        aria-selected={person.id === picked?.id}
                      >
                        <td>
                          <button
                            type="button"
                            className="hd-cell-btn"
                            onClick={() => setPickedId(person.id)}
                          >
                            {person.name}
                            <span className="hd-sub">{person.email}</span>
                          </button>
                        </td>
                        <td className="hd-mono" style={{ fontSize: 12 }}>
                          {person.role}
                        </td>
                        <td>
                          {person.banned ? (
                            <span className="hd-pill" data-tone="bad">
                              sumiu
                            </span>
                          ) : (
                            <span className="hd-pill">presente</span>
                          )}
                        </td>
                        <td className="hd-mono hd-small">
                          {formatDate(person.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          {query.data && query.data.matched > people.length ? (
            <p className="hd-small" style={{ margin: 0 }}>
              Mostrando {people.length} de {query.data.matched}. Refine a busca
              para achar o resto.
            </p>
          ) : null}
        </section>

        <aside className="hd-aside" aria-label="Dossiê">
          {picked ? (
            <Dossie
              key={picked.id}
              person={picked}
              isSelf={picked.id === admin.id}
            />
          ) : (
            <p className="hd-empty">Escolha alguém na lista.</p>
          )}
        </aside>
      </div>
    </HoudiniShell>
  )
}

function Dossie({ person, isSelf }: { person: Person; isSelf: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [nextRole, setNextRole] = useState<Role>(person.role as Role)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<null | 'pele' | 'role' | 'sumir' | 'voltar'>(
    null
  )

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: trpc.adminUsers.list.queryKey()
    })
  }

  async function entrarNaPele() {
    setBusy('pele')
    const res = await authClient.admin.impersonateUser({ userId: person.id })
    if (res.error || !res.data) {
      setBusy(null)
      toast.error(
        getUserFacingMessage(res.error, 'Não foi possível entrar na pele.')
      )
      return
    }
    // Recarga inteira: o próximo pedido já leva o cookie da outra conta.
    window.location.href = appHref(
      person.role === 'pub' ? '/admin' : '/dashboard',
      new URL(window.location.href)
    )
  }

  async function trocarRole() {
    setBusy('role')
    const res = await authClient.admin.setRole({
      userId: person.id,
      // biome-ignore lint/suspicious/noExplicitAny: o plugin admin não tipa roles próprios
      role: nextRole as any
    })
    setBusy(null)
    if (res.error) {
      toast.error(
        getUserFacingMessage(res.error, 'Não foi possível trocar a role.')
      )
      return
    }
    toast.success(`${person.name} agora é ${roleLabel(nextRole)}.`)
    await refresh()
  }

  async function sumir() {
    setBusy('sumir')
    const res = await authClient.admin.banUser({
      userId: person.id,
      banReason: reason.trim() || undefined
    })
    setBusy(null)
    if (res.error) {
      toast.error(
        getUserFacingMessage(res.error, 'Não foi possível sumir com a conta.')
      )
      return
    }
    toast.success(`${person.name} sumiu.`)
    setReason('')
    await refresh()
  }

  async function trazerDeVolta() {
    setBusy('voltar')
    const res = await authClient.admin.unbanUser({ userId: person.id })
    setBusy(null)
    if (res.error) {
      toast.error(
        getUserFacingMessage(res.error, 'Não foi possível trazer de volta.')
      )
      return
    }
    toast.success(`${person.name} voltou.`)
    await refresh()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          className="hd-avatar"
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            fontSize: 18,
            background: 'var(--hd-roxo-tint)'
          }}
        >
          {initials(person.name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 className="hd-h1" style={{ fontSize: 18 }}>
            {person.name}
          </h2>
          <span
            className="hd-mono hd-small"
            style={{ overflowWrap: 'anywhere' }}
          >
            {person.email}
          </span>
        </div>
      </div>

      <dl className="hd-dl">
        <div>
          <dt>Role</dt>
          <dd>{roleLabel(person.role as Role)}</dd>
        </div>
        <div>
          <dt>Desde</dt>
          <dd>{formatDate(person.createdAt)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{person.banned ? 'sumiu' : 'presente'}</dd>
        </div>
        {person.banned && person.banReason ? (
          <div>
            <dt>Motivo</dt>
            <dd>{person.banReason}</dd>
          </div>
        ) : null}
      </dl>

      {isSelf ? (
        <p className="hd-small" style={{ margin: 0 }}>
          É você. Os truques não valem na própria conta.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="hd-btn hd-btn-primary"
            onClick={entrarNaPele}
            disabled={busy !== null || person.banned === true}
          >
            <HatIcon size={16} sparkle={false} />
            {busy === 'pele' ? 'Entrando…' : 'Entrar na pele'}
          </button>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <label className="hd-label" style={{ flex: '1 1 auto' }}>
              Trocar role
              <select
                className="hd-select"
                value={nextRole}
                onChange={(event) => setNextRole(event.target.value as Role)}
              >
                <option value="fan">fan</option>
                <option value="pub">pub</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button
              type="button"
              className="hd-btn"
              disabled={busy !== null || nextRole === person.role}
              onClick={trocarRole}
            >
              {busy === 'role' ? 'Salvando…' : 'Salvar'}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              paddingTop: 16,
              borderTop: '1px solid var(--hd-line)'
            }}
          >
            {person.banned ? (
              <button
                type="button"
                className="hd-btn"
                disabled={busy !== null}
                onClick={trazerDeVolta}
              >
                {busy === 'voltar' ? 'Trazendo…' : 'Trazer de volta'}
              </button>
            ) : (
              <>
                <label className="hd-label">
                  Motivo para sumir
                  <textarea
                    className="hd-input hd-textarea"
                    placeholder="Ex: Violação dos termos de uso..."
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <HoldButton
                  label="Segure para sumir"
                  busyLabel="Sumindo…"
                  busy={busy === 'sumir'}
                  disabled={busy !== null}
                  onConfirm={sumir}
                />
              </>
            )}
          </div>
          <p className="hd-small" style={{ margin: 0 }}>
            Dentro da pele, a faixa no topo do app mostra quem você está sendo.
          </p>
        </>
      )}
    </>
  )
}
