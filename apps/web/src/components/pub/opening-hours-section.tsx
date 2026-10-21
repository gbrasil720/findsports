import {
  groupOpeningHours,
  type OpeningHours
} from '@findsports_oficial/api/lib/opening-hours'

type Row = ReturnType<typeof groupOpeningHours>[number]

/** As linhas do horário, com os dias iguais juntos ("Seg a qui"). */
export function OpeningHoursList({ rows }: { rows: Row[] }) {
  return (
    <dl className="divide-y divide-[var(--onside-line)] border border-[var(--onside-line)]">
      {rows.map((row) => (
        <div
          key={row.days}
          className="flex items-baseline justify-between gap-4 px-4 py-2.5"
        >
          <dt className="text-[var(--onside-ink)] text-sm">{row.days}</dt>
          <dd
            className={`font-[family-name:var(--onside-mono)] text-sm tabular-nums ${row.hours ? 'font-semibold text-[var(--onside-ink)]' : 'text-[var(--onside-muted)]'}`}
          >
            {row.hours ?? 'Fechado'}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * "Horário" da página do bar (WEB-397, 2g do app). Bar sem horário não tem a
 * seção; "aberto agora" vem pronto de `pubs.getById`.
 */
export function OpeningHoursSection({
  openingHours,
  openNow
}: {
  openingHours: OpeningHours | null
  openNow: boolean | null
}) {
  if (!openingHours) return null
  return (
    <section className="onside-panel p-5 md:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="onside-display text-2xl">Horário</h2>
        {openNow !== null ? (
          <p className="text-[var(--onside-muted)] text-sm">
            {openNow ? 'Aberto agora' : 'Fechado agora'}
          </p>
        ) : null}
      </div>
      <OpeningHoursList rows={groupOpeningHours(openingHours)} />
    </section>
  )
}
