import type { AppRouter } from '@findsports_oficial/api/routers/index'
import {
  keepPreviousData,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { useState } from 'react'
import { toast } from 'sonner'

import { formatDate, initials } from '@/components/houdini/format'
import { HoldButton } from '@/components/houdini/hold-button'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { authClient } from '@/lib/auth-client'
import { appHref } from '@/lib/houdini-host'
import { roleLabel } from '@/lib/roles'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/pessoas')({
  head: () => ({ meta: [{ title: 'Pessoas — Houdini' }] }),
  // `?pessoa=<id>` vem do ⌘K: abre com a busca no id, e a ficha já aberta.
  // Outro resultado do ⌘K, com a página aberta, remonta com o novo id.
  validateSearch: (search: Record<string, unknown>): { pessoa?: string } =>
    typeof search.pessoa === 'string' ? { pessoa: search.pessoa } : {},
  remountDeps: ({ search }) => search.pessoa,
  component: PessoasPage
})

type Person =
  inferRouterOutputs<AppRouter>['adminUsers']['list']['users'][number]
type Role = 'fan' | 'pub' | 'admin'

const ROLES = ['fan', 'pub', 'admin'] as const

const ROLE_FILTERS = [
  { value: undefined, label: 'Todos' },
  ...ROLES.map((value) => ({ value, label: roleLabel(value) }))
]

/** O selo do papel: admin em tinta, bar em pedra, torcedor sem fundo. */
const ROLE_TONES: Record<string, string | undefined> = {
  admin: 'ink',
  pub: 'stone'
}

function PessoasPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const { pessoa: fromPalette } = Route.useSearch()
  const [search, setSearch] = useState(fromPalette ?? '')
  const [role, setRole] = useState<Role | undefined>()
  const [pickedId, setPickedId] = useState<string | null>(fromPalette ?? null)

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
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Gente e bares"
          title="Pessoas"
          titleId="pessoas-h"
          summary={
            query.data ? (
              <>
                <b>{query.data.total}</b> contas · <b>{query.data.admins}</b>{' '}
                admins · <b>{query.data.banned}</b> sumidas
              </>
            ) : null
          }
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center'
          }}
        >
          <label className="hd-search">
            <Icon name="search" size={18} />
            <span className="hd-sr">Buscar pessoa</span>
            <input
              type="search"
              className="hd-input"
              placeholder="Nome, e-mail ou id"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <fieldset className="hd-seg" aria-label="Papel">
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

        <div className="hd-cols">
          <section className="grow" aria-labelledby="pessoas-h">
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
                      <th scope="col">Papel</th>
                      <th scope="col">Status</th>
                      <th scope="col">Cidade</th>
                      <th scope="col" style={{ textAlign: 'right' }}>
                        Desde
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.isLoading ? (
                      <tr>
                        <td colSpan={5}>
                          <div
                            className="hd-skeleton"
                            style={{ height: 160 }}
                          />
                        </td>
                      </tr>
                    ) : people.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="hd-empty">
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
                          <td>
                            <span
                              className="hd-pill"
                              data-tone={ROLE_TONES[person.role]}
                            >
                              {roleLabel(person.role)}
                            </span>
                          </td>
                          <td>
                            {person.banned ? (
                              <span className="hd-pill" data-tone="live">
                                sumiu
                              </span>
                            ) : (
                              <span className="hd-pill" data-tone="draft">
                                presente
                              </span>
                            )}
                          </td>
                          <td style={{ color: 'var(--hd-muted)' }}>
                            {person.cityName
                              ? `${person.cityName}${person.cityUf ? `/${person.cityUf}` : ''}`
                              : '—'}
                          </td>
                          <td
                            className="hd-mono"
                            style={{ textAlign: 'right', fontWeight: 600 }}
                          >
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
                Mostrando {people.length} de {query.data.matched}. Refine a
                busca para achar o resto.
              </p>
            ) : null}
          </section>

          <aside className="hd-card hd-aside side" aria-label="Dossiê">
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
      <span className="hd-eyebrow">Dossiê</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="hd-avatar is-lg">{initials(person.name)}</span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 0
          }}
        >
          <h2 className="hd-h1 is-sm">{person.name}</h2>
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
          <dt>Papel</dt>
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
        <div>
          <dt>2FA</dt>
          <dd>{person.twoFactorEnabled ? 'ligado' : 'desligado'}</dd>
        </div>
        {person.banned && person.banReason ? (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Motivo</dt>
            <dd>{person.banReason}</dd>
          </div>
        ) : null}
      </dl>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {isSelf ? null : (
          <button
            type="button"
            className="hd-btn hd-btn-ink"
            style={{ flex: '1 1 160px' }}
            onClick={entrarNaPele}
            disabled={busy !== null || person.banned === true}
          >
            <Icon name="mask" size={18} />
            {busy === 'pele' ? 'Entrando…' : 'Entrar na pele'}
          </button>
        )}
        <Link
          to="/houdini/pessoas/$userId"
          params={{ userId: person.id }}
          className="hd-btn"
          style={{ flex: '1 1 120px' }}
        >
          Abrir a ficha
        </Link>
      </div>

      {isSelf ? (
        <p className="hd-small" style={{ margin: 0 }}>
          É você. Os truques não valem na própria conta.
        </p>
      ) : (
        <>
          <hr className="hd-rule" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontWeight: 700 }}>Trocar o papel</span>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center'
              }}
            >
              <fieldset className="hd-seg" aria-label="Novo papel">
                {ROLES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={nextRole === value}
                    onClick={() => setNextRole(value)}
                  >
                    {roleLabel(value)}
                  </button>
                ))}
              </fieldset>
              <button
                type="button"
                className="hd-btn is-sm"
                disabled={busy !== null || nextRole === person.role}
                onClick={trocarRole}
              >
                {busy === 'role' ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>

          <hr className="hd-rule" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontWeight: 700 }}>Sumir com a conta</span>
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
                  <span className="hd-small" style={{ fontWeight: 600 }}>
                    Motivo, até 500 caracteres
                  </span>
                  <textarea
                    className="hd-input hd-textarea"
                    placeholder="Ex: perfil falso, abuso nas avaliações…"
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
          <p className="hd-note">
            <Icon name="book" size={16} />
            Dentro da pele, uma faixa no topo do app mostra quem você está
            sendo.
          </p>
        </>
      )}
    </>
  )
}
