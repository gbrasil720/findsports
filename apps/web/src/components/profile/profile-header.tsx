import Calendar from 'reicon-react/icons/Calendar'
import Camera from 'reicon-react/icons/Camera'
import Check from 'reicon-react/icons/Check'
import Edit from 'reicon-react/icons/Edit'
import Loader from 'reicon-react/icons/Loader'
import Xmark from 'reicon-react/icons/Xmark'
import type { ProfileUser } from './profile-model'

type Props = {
  user: ProfileUser | undefined
  initials: string
  memberSince: string | null
  editingName: boolean
  nameInput: string
  uploadingImage: boolean
  imageError: string | null
  onNameInputChange: (value: string) => void
  onStartEditingName: () => void
  onCancelEditingName: () => void
  onSaveName: () => void
  onChooseImage: () => void
}

export function ProfileHeader({
  user,
  initials,
  memberSince,
  editingName,
  nameInput,
  uploadingImage,
  imageError,
  onNameInputChange,
  onStartEditingName,
  onCancelEditingName,
  onSaveName,
  onChooseImage
}: Props) {
  return (
    <section className="onside-panel-ink onside-shadow-acid relative mb-8 overflow-hidden p-8 text-[var(--onside-paper)] md:p-10">
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
        <div className="relative shrink-0 self-start md:self-auto">
          <div className="grid size-24 place-items-center overflow-hidden border-2 border-[var(--onside-paper)] bg-[var(--onside-paper)] font-bold text-4xl text-[var(--onside-ink)]">
            {user?.image ? (
              <img
                src={user.image}
                alt={user.name ?? 'Foto de perfil'}
                width={96}
                height={96}
                className="size-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <button
            type="button"
            disabled={uploadingImage}
            onClick={onChooseImage}
            className="absolute -right-1.5 -bottom-1.5 grid size-11 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-acid)] text-[var(--onside-ink)] disabled:opacity-60"
            aria-label="Trocar foto de perfil"
          >
            {uploadingImage ? (
              <Loader size={14} color="currentColor" className="animate-spin" />
            ) : (
              <Camera size={14} color="currentColor" />
            )}
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--onside-acid)] uppercase tracking-[0.16em]">
            Conta de torcedor
          </div>
          {editingName ? (
            <div className="mb-1 flex items-center gap-2">
              <input
                value={nameInput}
                onChange={(event) => onNameInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSaveName()
                }}
                className="w-full max-w-xs rounded-none bg-[var(--onside-paper)]/20 px-3 py-1.5 font-bold text-2xl text-[var(--onside-paper)] outline-none placeholder-white/50 focus:ring-2 focus:ring-white/40"
              />
              <button
                type="button"
                onClick={onSaveName}
                className="rounded-none bg-[var(--onside-paper)]/20 p-2 hover:bg-[var(--onside-paper)]/30"
              >
                <Check size={16} color="currentColor" />
              </button>
              <button
                type="button"
                onClick={onCancelEditingName}
                className="rounded-none bg-[var(--onside-paper)]/20 p-2 hover:bg-[var(--onside-paper)]/30"
              >
                <Xmark size={16} color="currentColor" />
              </button>
            </div>
          ) : (
            <h1 className="onside-display mb-1 text-3xl text-[var(--onside-paper)] md:text-4xl">
              {user?.name}
            </h1>
          )}
          <p className="text-[var(--onside-paper)]/80 text-sm">{user?.email}</p>
          {memberSince ? (
            <p className="mt-1 flex items-center gap-1 text-[var(--onside-paper)]/60 text-xs">
              <Calendar size={11} color="currentColor" />
              Membro desde {memberSince}
            </p>
          ) : null}
          {imageError ? (
            <p className="mt-2 text-[var(--onside-acid)] text-xs" role="alert">
              {imageError}
            </p>
          ) : null}
        </div>

        {!editingName ? (
          <button
            type="button"
            onClick={onStartEditingName}
            className="inline-flex shrink-0 items-center gap-2 rounded-none bg-[var(--onside-paper)]/15 px-4 py-2.5 font-bold text-sm backdrop-blur hover:bg-[var(--onside-paper)]/25"
          >
            <Edit size={16} color="currentColor" /> Editar nome
          </button>
        ) : null}
      </div>
    </section>
  )
}
