import { useState } from 'react'
import Call from 'reicon-react/icons/Call'
import Check from 'reicon-react/icons/Check'
import Edit from 'reicon-react/icons/Edit'
import Eye from 'reicon-react/icons/Eye'
import EyeSlash from 'reicon-react/icons/EyeSlash'
import Image from 'reicon-react/icons/Image'
import Location from 'reicon-react/icons/Location'
import Xmark from 'reicon-react/icons/Xmark'
import { BarAvatar } from '@/components/admin/pub-avatar'
import { PhoneInput } from '@/components/phone-input'
import { analytics } from '@/lib/analytics'
import { formatStoredPhone } from '@/utils/format-phone'

type Participant = { team: { name: string } }

type Event = {
  id: string
  championship: string
  participants: Participant[]
}

type Bar = {
  name: string
  address?: string
  neighborhood?: string
  city?: string
  phone?: string | null
  description?: string | null
  photoUrl?: string | null
  isActive?: boolean
}

type EditForm = {
  name: string
  address: string
  neighborhood: string
  city: string
  phone: string
  description: string
}

type Props = {
  bar: Bar
  liveEvent?: Event
  totalCount: number
  onSave: (data: EditForm) => Promise<void>
  onPhotoUpdate: (url: string) => void
  isSaving?: boolean
  saveError?: string | null
}

export function PubHeroSection({
  bar,
  liveEvent,
  totalCount,
  onSave,
  onPhotoUpdate,
  isSaving,
  saveError
}: Props) {
  const [editing, setEditing] = useState(false)
  const initialForm: EditForm = {
    name: bar.name ?? '',
    address: bar.address ?? '',
    neighborhood: bar.neighborhood ?? '',
    city: bar.city ?? '',
    phone: bar.phone ?? '',
    description: bar.description ?? ''
  }
  const [form, setForm] = useState<EditForm>(initialForm)

  const isDirty = (Object.keys(form) as (keyof EditForm)[]).some(
    (k) => form[k] !== initialForm[k]
  )

  const handleSave = async () => {
    const changedFields = (Object.keys(form) as (keyof EditForm)[]).filter(
      (k) => form[k] !== initialForm[k]
    )
    await onSave(form)
    analytics.barProfileUpdated(changedFields)
    setEditing(false)
  }

  const handleCancel = () => {
    setForm(initialForm)
    setEditing(false)
  }

  return (
    <section className="onside-panel-ink relative mb-8 overflow-hidden text-[var(--onside-paper)]">
      <div className="hidden" />
      <div className="relative grid items-start gap-6 p-6 md:grid-cols-[1fr_auto] md:p-10">
        <div className="min-w-0">
          {/* Status badges */}
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--onside-acid)]">
              <Image size={12} color="currentColor" />
              Meu espaço
            </div>
            {bar.isActive ? (
              <span className="inline-flex items-center gap-1.5 font-[family-name:var(--onside-mono)] text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--onside-acid)]">
                <Eye size={12} color="currentColor" /> Visível
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-[family-name:var(--onside-mono)] text-[10px] font-bold uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--onside-paper)_45%,transparent)]">
                <EyeSlash size={12} color="currentColor" /> Não visível
              </span>
            )}
          </div>

          <div
            className={`flex gap-5 ${editing ? 'flex-col sm:flex-row sm:items-start' : 'items-start'}`}
          >
            {/* Avatar clicável */}
            <BarAvatar
              name={bar.name}
              photoUrl={bar.photoUrl}
              onUploadSuccess={(url) => {
                analytics.barPhotoUploaded()
                onPhotoUpdate(url)
              }}
            />

            <div className="flex-1 min-w-0">
              {liveEvent && !editing && (
                <div className="mb-3 inline-flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--onside-live)]">
                  <span className="onside-live-dot is-pulse" />
                  Ao vivo ·{' '}
                  {liveEvent.participants.length > 0
                    ? liveEvent.participants.map((p) => p.team.name).join(' × ')
                    : liveEvent.championship}
                </div>
              )}

              {editing ? (
                <div className="space-y-3 w-full">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nome do bar"
                    className="w-full border border-[rgb(241_238_230_/_30%)] bg-[rgb(241_238_230_/_8%)] px-4 py-2.5 font-bold text-2xl text-[var(--onside-paper)] outline-none placeholder:text-[rgb(241_238_230_/_40%)] focus:border-[var(--onside-live)]"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={form.address}
                      onChange={(e) =>
                        setForm({ ...form, address: e.target.value })
                      }
                      placeholder="Endereço"
                      className="w-full border border-[rgb(241_238_230_/_30%)] bg-[rgb(241_238_230_/_8%)] px-3 py-2 text-base text-[var(--onside-paper)] outline-none placeholder:text-[rgb(241_238_230_/_40%)] focus:border-[var(--onside-live)]"
                    />
                    <input
                      value={form.neighborhood}
                      onChange={(e) =>
                        setForm({ ...form, neighborhood: e.target.value })
                      }
                      placeholder="Bairro"
                      className="w-full border border-[rgb(241_238_230_/_30%)] bg-[rgb(241_238_230_/_8%)] px-3 py-2 text-base text-[var(--onside-paper)] outline-none placeholder:text-[rgb(241_238_230_/_40%)] focus:border-[var(--onside-live)]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={form.city}
                      onChange={(e) =>
                        setForm({ ...form, city: e.target.value })
                      }
                      placeholder="Cidade"
                      className="w-full border border-[rgb(241_238_230_/_30%)] bg-[rgb(241_238_230_/_8%)] px-3 py-2 text-base text-[var(--onside-paper)] outline-none placeholder:text-[rgb(241_238_230_/_40%)] focus:border-[var(--onside-live)]"
                    />
                    <PhoneInput
                      defaultValue={form.phone}
                      onChange={(phone) =>
                        setForm((prev) => ({ ...prev, phone }))
                      }
                      variant="dark"
                    />
                  </div>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    placeholder="Descrição do bar (opcional)"
                    rows={2}
                    className="w-full border border-[rgb(241_238_230_/_30%)] bg-[rgb(241_238_230_/_8%)] px-3 py-2 text-base text-[var(--onside-paper)] outline-none placeholder:text-[rgb(241_238_230_/_40%)] focus:border-[var(--onside-live)] resize-none"
                  />
                </div>
              ) : (
                <>
                  <h1 className="onside-display mb-3 text-4xl text-[var(--onside-paper)] md:text-5xl">
                    {bar.name ?? 'Meu bar'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-[color-mix(in_srgb,var(--onside-paper)_78%,transparent)]">
                    {bar.address && (
                      <span className="inline-flex items-center gap-1.5">
                        <Location size={16} color="currentColor" />
                        {bar.address} · {bar.neighborhood}
                      </span>
                    )}
                    {bar.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Call size={16} color="currentColor" />
                        {formatStoredPhone(bar.phone)}
                      </span>
                    )}
                  </div>
                  {bar.description && (
                    <p className="mt-3 max-w-lg text-sm text-[color-mix(in_srgb,var(--onside-paper)_65%,transparent)]">
                      {bar.description}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Lado direito */}
        <div className="flex flex-col items-start md:items-end gap-4 shrink-0">
          {!editing && (
            <div className="flex gap-6 text-center">
              <div>
                <div className="onside-display text-3xl tabular-nums">
                  {totalCount}
                </div>
                <div className="mt-0.5 font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-widest text-[color-mix(in_srgb,var(--onside-paper)_50%,transparent)]">
                  {totalCount === 1 ? 'Jogo' : 'Jogos'}
                </div>
              </div>
              {liveEvent && (
                <div>
                  <div className="onside-display text-3xl text-[var(--onside-live)] tabular-nums">
                    1
                  </div>
                  <div className="mt-0.5 font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-widest text-[var(--onside-live)]">
                    Ao vivo
                  </div>
                </div>
              )}
            </div>
          )}

          {editing ? (
            <div className="mt-2 flex flex-col items-stretch gap-2 sm:items-end">
              {saveError ? (
                <p
                  className="text-sm text-[var(--onside-live-text)]"
                  role="alert"
                >
                  {saveError}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="onside-btn onside-btn-outline min-h-11 border-[var(--onside-paper)] text-[var(--onside-paper)] text-xs"
                >
                  <Xmark size={14} color="currentColor" />
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !form.name.trim() || !isDirty}
                  className="onside-btn onside-btn-acid min-h-11 text-xs disabled:opacity-50"
                >
                  <Check size={14} color="currentColor" />
                  {isSaving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="onside-btn onside-btn-outline min-h-11 border-[var(--onside-paper)] text-[var(--onside-paper)] text-xs"
            >
              <Edit size={14} color="currentColor" />
              Editar perfil
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
