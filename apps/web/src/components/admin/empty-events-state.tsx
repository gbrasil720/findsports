import Calendar from 'reicon-react/icons/Calendar'
import Plus from 'reicon-react/icons/Plus'

type Props = {
  onCreate: () => void
  /**
   * Por que a criação está fechada, quando está. `null` significa liberada.
   *
   * O botão ficava cinza sozinho, embaixo de uma frase que mandava adicionar
   * jogos: a tela pedia uma ação e desligava a ação, sem dizer o motivo. O
   * motivo já existia no `EventsManager` — faltava chegar aqui.
   */
  blockReason?: string | null
}

export function EmptyEventsState({ onCreate, blockReason = null }: Props) {
  const blocked = blockReason !== null

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
          {blocked
            ? 'Assim que a criação for liberada, os jogos cadastrados aqui aparecem nas buscas dos torcedores.'
            : 'Adicione jogos para começar a aparecer nas buscas dos torcedores.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={blocked}
        aria-describedby={blocked ? 'empty-events-block-reason' : undefined}
        title={blockReason ?? undefined}
        className="onside-btn onside-btn-ink"
      >
        <Plus size={16} color="currentColor" aria-hidden="true" />
        Adicionar primeiro jogo
      </button>
      {blocked ? (
        <p
          id="empty-events-block-reason"
          className="max-w-xs font-semibold text-[var(--onside-live-text)] text-xs"
        >
          {blockReason}
        </p>
      ) : null}
    </div>
  )
}
