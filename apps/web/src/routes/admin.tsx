import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AccountSettings } from '@/components/account/account-settings'
import { useMyBar, useMySubscription } from '@/components/admin/admin-queries'
import {
  type AdminSectionId,
  AdminTabPanel,
  AdminTabs,
  getAdminSectionFromHash,
  getAdminSections
} from '@/components/admin/admin-tabs'
import { getAnalyticsRange } from '@/components/admin/analytics-period'
import { OverviewTab } from '@/components/admin/overview-tab'
import { QueryError } from '@/components/admin/query-error'
import { ReservationsTab } from '@/components/admin/reservations-tab'
import { ScheduleTab } from '@/components/admin/schedule-tab'
import { SpaceTab } from '@/components/admin/space-tab'
import { AppShell } from '@/components/app/app-shell'
import { InstallAppCard } from '@/components/app/install-app-card'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'Painel do Bar — Onside' },
      {
        name: 'description',
        content:
          'Gerencie a programação de jogos do seu bar e atraia torcedores perto de você.'
      },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: PubDashboard
})

function AdminDashboardSkeleton() {
  return (
    <div
      className="space-y-6 py-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Carregando painel do bar…</span>
      <div className="border-[var(--onside-ink)] border-b pb-4">
        <Skeleton className="mb-3 h-3 w-32 bg-[var(--onside-stone)]" />
        <Skeleton className="h-12 w-48 bg-[var(--onside-stone)]" />
        <Skeleton className="mt-3 h-3 w-32 bg-[var(--onside-stone)]" />
      </div>
      <div className="onside-admin-grid">
        <nav className="onside-admin-nav" aria-hidden="true">
          <div className="space-y-2">
            <Skeleton className="h-11 w-full bg-[var(--onside-stone)]" />
            <Skeleton className="h-11 w-full bg-[var(--onside-stone)]" />
            <Skeleton className="h-11 w-full bg-[var(--onside-stone)]" />
            <Skeleton className="h-11 w-full bg-[var(--onside-stone)]" />
          </div>
          <Skeleton className="mt-4 h-11 w-full bg-[var(--onside-stone)]" />
        </nav>
        <div className="min-w-0 space-y-4">
          <div>
            <Skeleton className="mb-2 h-8 w-36 bg-[var(--onside-stone)]" />
            <Skeleton className="h-4 w-72 max-w-full bg-[var(--onside-stone)]" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="onside-stat" aria-hidden="true">
                <Skeleton className="mb-3 h-3 w-24 bg-[var(--onside-stone)]" />
                <Skeleton className="h-10 w-14 bg-[var(--onside-stone)]" />
                <Skeleton className="mt-2 h-3 w-20 bg-[var(--onside-stone)]" />
              </div>
            ))}
          </div>
          <div className="onside-panel-acid space-y-4 p-4" aria-hidden="true">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-3 w-28 bg-[var(--onside-stone)]" />
                <Skeleton className="h-4 w-40 bg-[var(--onside-stone)]" />
              </div>
              <Skeleton className="h-3 w-20 bg-[var(--onside-stone)]" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-11 w-20 bg-[var(--onside-stone)]" />
              <Skeleton className="h-11 w-24 bg-[var(--onside-stone)]" />
              <Skeleton className="h-11 w-28 bg-[var(--onside-stone)]" />
              <Skeleton className="h-11 w-32 bg-[var(--onside-stone)]" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="onside-panel-acid p-4">
              <Skeleton className="mb-3 h-5 w-36 bg-[var(--onside-stone)]" />
              <Skeleton className="h-40 w-full bg-[var(--onside-stone)]" />
            </div>
            <div className="onside-panel-acid p-4">
              <Skeleton className="mb-3 h-5 w-40 bg-[var(--onside-stone)]" />
              <Skeleton className="h-10 w-full bg-[var(--onside-stone)]" />
              <Skeleton className="mt-3 h-10 w-full bg-[var(--onside-stone)]" />
              <Skeleton className="mt-3 h-10 w-full bg-[var(--onside-stone)]" />
            </div>
          </div>
          <div className="onside-panel-acid p-4" aria-hidden="true">
            <Skeleton className="mb-3 h-5 w-44 bg-[var(--onside-stone)]" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="space-y-2">
                  <Skeleton className="h-3 w-16 bg-[var(--onside-stone)]" />
                  <Skeleton className="h-6 w-12 bg-[var(--onside-stone)]" />
                  <Skeleton className="h-3 w-14 bg-[var(--onside-stone)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PubDashboard() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const [activeSection, setActiveSection] =
    useState<AdminSectionId>('admin-visao')
  // Escolhido na Visão geral, também filtra o desempenho por jogo da Grade.
  const [analyticsRange, setAnalyticsRange] = useState(() =>
    getAnalyticsRange('30d')
  )

  useEffect(() => {
    const syncSectionFromHash = () => {
      const section = getAdminSectionFromHash(window.location.hash)
      if (section) setActiveSection(section)
    }

    syncSectionFromHash()
    window.addEventListener('hashchange', syncSectionFromHash)
    return () => window.removeEventListener('hashchange', syncSectionFromHash)
  }, [])

  const changeSection = (section: AdminSectionId) => {
    setActiveSection(section)
    const nextHash = `#${section}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }

  const {
    data: bar,
    isLoading: loadingBar,
    isError: barError,
    error: barQueryError,
    refetch: refetchBar
  } = useMyBar()
  const { data: subscription } = useMySubscription()

  if (loadingBar) {
    return (
      <AppShell variant="pub">
        <AdminDashboardSkeleton />
      </AppShell>
    )
  }

  if (barError || !bar) {
    return (
      <AppShell variant="pub">
        <QueryError
          message={getUserFacingMessage(
            barQueryError,
            'Não foi possível carregar os dados do bar.'
          )}
          retryable={isRetryableError(barQueryError)}
          onRetry={() => {
            void refetchBar()
          }}
        />
      </AppShell>
    )
  }

  // O servidor confere o plano de novo; aqui só decide se a aba existe.
  const receivesReservations =
    bar.acceptsReservations && subscription?.currentPlan === 'elite'
  const sections = getAdminSections(receivesReservations)
  // Link para uma aba que não existe para este bar cai na Visão geral.
  const shownSection = sections.some(({ id }) => id === activeSection)
    ? activeSection
    : 'admin-visao'

  // Cada aba é dona das próprias queries (WEB-138).
  return (
    <AppShell variant="pub" userMeta={bar.name}>
      <div className="mb-6 border-[var(--onside-ink)] border-b pb-4">
        <p className="onside-kicker mb-2">Onside para bares</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="onside-display text-4xl md:text-5xl">Sua grade</h1>
            <p className="mt-2 font-[family-name:var(--onside-mono)] text-[11px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
              {bar.name}
            </p>
          </div>
        </div>
      </div>

      <div className="onside-admin-grid">
        <AdminTabs
          sections={sections}
          activeSection={shownSection}
          onChange={changeSection}
        />

        <div className="min-w-0">
          <OverviewTab
            active={shownSection === 'admin-visao'}
            analyticsRange={analyticsRange}
            onAnalyticsRangeChange={setAnalyticsRange}
            onCreateEvent={() => changeSection('admin-grade')}
          />
          <ScheduleTab
            active={shownSection === 'admin-grade'}
            analyticsRange={analyticsRange}
          />
          <SpaceTab
            active={shownSection === 'admin-espaco'}
            onCreateEvent={() => changeSection('admin-grade')}
          />
          {receivesReservations ? (
            <ReservationsTab active={shownSection === 'admin-reservas'} />
          ) : null}
          <AdminTabPanel
            id="admin-configuracoes"
            active={shownSection === 'admin-configuracoes'}
          >
            <div className="mb-6">
              <h2 className="onside-display text-2xl">Configurações</h2>
              <p className="mt-1 text-sm text-[var(--onside-muted)]">
                Gerencie a segurança da conta responsável por este bar.
              </p>
            </div>
            <AccountSettings surface="pub" />
          </AdminTabPanel>
        </div>

        {session ? (
          <InstallAppCard userId={session.user.id} surface="admin" />
        ) : null}
      </div>
    </AppShell>
  )
}
