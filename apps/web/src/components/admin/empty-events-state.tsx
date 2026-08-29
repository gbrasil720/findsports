import Calendar from 'reicon-react/icons/Calendar'
import Plus from 'reicon-react/icons/Plus'

type Props = {
  onCreate: () => void
  createDisabled?: boolean
}

export function EmptyEventsState({ onCreate, createDisabled = false }: Props) {
  return (
    <div className="onside-panel-acid flex flex-col items-center gap-4 p-12 text-center">
      <div className="grid size-16 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-paper)]">
        <Calendar size={28} color="currentColor" aria-hidden="true" />
      </div>
      <div>
        <p className="onside-display mb-1 text-2xl text-[var(--onside-ink)]">
          Nenhum jogo cadastrado
        </p>
        <p className="max-w-xs text-[var(--onside-ink)] text-sm opacity-80">
          Adicione jogos para começar a aparecer nas buscas dos torcedores.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={createDisabled}
        className="onside-btn onside-btn-ink"
      >
        <Plus size={16} color="currentColor" aria-hidden="true" />
        Adicionar primeiro jogo
      </button>
    </div>
  )
}
