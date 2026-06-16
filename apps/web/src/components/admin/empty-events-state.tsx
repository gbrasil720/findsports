import { CalendarsIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

type Props = {
  onCreate: () => void
}

export function EmptyEventsState({ onCreate }: Props) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-black/5 p-12 flex flex-col items-center gap-4 text-center">
      <div className="size-16 rounded-2xl bg-zinc-100 flex items-center justify-center">
        <HugeiconsIcon
          icon={CalendarsIcon}
          size={28}
          color="currentColor"
          strokeWidth={1.5}
          className="text-zinc-400"
        />
      </div>
      <div>
        <p className="font-heading font-bold text-zinc-900 mb-1">
          Nenhum jogo cadastrado
        </p>
        <p className="text-sm text-zinc-500 max-w-xs">
          Adicione jogos para começar a aparecer nas buscas dos torcedores.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-2 bg-black text-white text-xs font-bold px-5 py-2.5 rounded-full hover:bg-brand-blue transition-colors"
      >
        <HugeiconsIcon
          icon={PlusSignIcon}
          size={16}
          color="currentColor"
          strokeWidth={1.5}
        />{' '}
        Adicionar primeiro jogo
      </button>
    </div>
  )
}
