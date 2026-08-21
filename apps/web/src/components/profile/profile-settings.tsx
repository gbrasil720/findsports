import Check from 'reicon-react/icons/Check'
import Compass from 'reicon-react/icons/Compass'
import Edit from 'reicon-react/icons/Edit'
import Loader from 'reicon-react/icons/Loader'
import Location from 'reicon-react/icons/Location'
import Medal from 'reicon-react/icons/Medal'
import { AccountSettings } from '@/components/account/account-settings'
import { type RadiusKm, SEARCH_RADII } from '@/domain/discovery'
import type { Preference, ProfileUser, Sport } from './profile-model'

type Props = {
  user: ProfileUser | undefined
  sports: Sport[]
  preferences: Preference[]
  loadingPreferences: boolean
  editingSports: boolean
  selectedSportIds: string[]
  savingSports: boolean
  sportsError: string | null
  savingRadius: boolean
  radiusError: string | null
  resettingRecommendations: boolean
  recommendationsReset: boolean
  recommendationsResetError: string | null
  onStartEditingSports: () => void
  onCancelEditingSports: () => void
  onToggleSport: (sportId: string) => void
  onSaveSports: () => void
  onRadiusChange: (radiusKm: RadiusKm) => void
  onResetRecommendations: () => void
}

export function ProfileSettings(props: Props) {
  return (
    <div className="space-y-4">
      <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-lg">
            <Medal
              size={20}
              color="currentColor"
              className="text-[var(--onside-live)]"
            />
            Esportes favoritos
          </h3>
          {!props.editingSports ? (
            <button
              type="button"
              onClick={props.onStartEditingSports}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-none px-3 py-1.5 font-bold text-[var(--onside-muted)] text-xs hover:bg-[var(--onside-stone)] hover:text-[var(--onside-ink)]"
            >
              <Edit size={14} color="currentColor" /> Editar
            </button>
          ) : null}
        </div>

        {props.loadingPreferences ? (
          <Loader
            size={16}
            color="currentColor"
            className="animate-spin text-[var(--onside-muted)]"
          />
        ) : props.editingSports ? (
          <SportsEditor {...props} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {props.preferences.length === 0 ? (
              <p className="text-[var(--onside-muted)] text-sm">
                Nenhum esporte selecionado.
              </p>
            ) : (
              props.preferences.map((preference) => (
                <span
                  key={preference.sportId}
                  className="rounded-none bg-[var(--onside-acid)]/10 px-3 py-1.5 font-bold text-[var(--onside-ink)] text-xs"
                >
                  {preference.sport.name}
                </span>
              ))
            )}
          </div>
        )}
      </section>

      <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6">
        <h3 className="mb-1 flex items-center gap-2 font-bold text-lg">
          <Location
            size={20}
            color="currentColor"
            className="text-[var(--onside-live)]"
          />
          Raio de busca
        </h3>
        <p className="mb-4 text-[var(--onside-muted)] text-xs">
          Distância máxima para buscar bares
        </p>
        <div className="flex flex-wrap gap-2">
          {SEARCH_RADII.map((radiusKm) => (
            <button
              key={radiusKm}
              type="button"
              disabled={props.savingRadius}
              onClick={() => props.onRadiusChange(radiusKm)}
              className={`min-h-11 rounded-none px-4 py-2 font-bold text-sm transition-colors disabled:opacity-60 ${
                props.user?.searchRadiusKm === radiusKm
                  ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                  : 'bg-[var(--onside-stone)] text-[var(--onside-muted)] hover:bg-[var(--onside-stone)]'
              }`}
            >
              {radiusKm} km
            </button>
          ))}
        </div>
        {props.radiusError ? (
          <p
            className="mt-2 text-[var(--onside-live-text)] text-xs"
            role="alert"
          >
            {props.radiusError}
          </p>
        ) : null}
        {props.savingRadius ? (
          <p className="mt-2 text-[10px] text-[var(--onside-muted)]">
            Salvando…
          </p>
        ) : null}
      </section>

      <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6">
        <h3 className="mb-1 flex items-center gap-2 font-bold text-lg">
          <Compass
            size={20}
            color="currentColor"
            className="text-[var(--onside-live)]"
          />
          Sugestões personalizadas
        </h3>
        <p className="mb-4 max-w-2xl text-[var(--onside-muted)] text-xs leading-relaxed">
          Recomece o histórico usado nas sugestões sem alterar seus esportes,
          raio, favoritos, avaliações ou onboarding.
        </p>
        <button
          type="button"
          disabled={props.resettingRecommendations}
          onClick={props.onResetRecommendations}
          className="min-h-11 border border-[var(--onside-ink)] bg-[var(--onside-paper)] px-4 py-2 font-bold text-sm hover:bg-[var(--onside-stone)] disabled:opacity-50"
        >
          {props.resettingRecommendations
            ? 'Recomeçando…'
            : 'Recomeçar minhas sugestões'}
        </button>
        {props.recommendationsReset ? (
          <p className="mt-2 text-xs" role="status">
            Sugestões recomeçadas. Seus dados do perfil foram preservados.
          </p>
        ) : null}
        {props.recommendationsResetError ? (
          <p
            className="mt-2 text-[var(--onside-live-text)] text-xs"
            role="alert"
          >
            {props.recommendationsResetError}
          </p>
        ) : null}
      </section>

      <AccountSettings surface="fan" />
    </div>
  )
}

function SportsEditor(props: Props) {
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {props.sports.map((sport) => {
          const selected = props.selectedSportIds.includes(sport.id)
          return (
            <button
              key={sport.id}
              type="button"
              onClick={() => props.onToggleSport(sport.id)}
              className={`relative min-h-11 rounded-none p-4 text-left ring-1 transition-[box-shadow,background] ${
                selected
                  ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)] ring-transparent'
                  : 'bg-[var(--onside-stone)] ring-[var(--onside-line)] hover:bg-[var(--onside-stone)]'
              }`}
            >
              <div className="font-bold text-sm">{sport.name}</div>
              {selected ? (
                <Check
                  size={14}
                  color="currentColor"
                  className="absolute top-2 right-2"
                />
              ) : null}
            </button>
          )
        })}
      </div>
      <p className="mb-4 text-[var(--onside-muted)] text-xs">
        {props.selectedSportIds.length} selecionado
        {props.selectedSportIds.length !== 1 ? 's' : ''} — escolha pelo menos 1.
      </p>
      {props.sportsError ? (
        <p className="mb-3 text-[var(--onside-live-text)] text-xs" role="alert">
          {props.sportsError}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={props.onSaveSports}
          disabled={props.selectedSportIds.length === 0 || props.savingSports}
          className="min-h-11 rounded-none bg-[var(--onside-acid)] px-4 py-2 font-bold text-[var(--onside-ink)] text-sm disabled:opacity-50"
        >
          {props.savingSports ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={props.onCancelEditingSports}
          className="min-h-11 rounded-none px-4 py-2 font-bold text-[var(--onside-muted)] text-sm hover:bg-[var(--onside-stone)]"
        >
          Cancelar
        </button>
      </div>
    </>
  )
}
