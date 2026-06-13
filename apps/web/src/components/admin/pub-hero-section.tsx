import {
  CallIcon,
  Cancel01Icon,
  EyeIcon,
  FloppyDiskIcon,
  MapPinIcon,
  PencilIcon,
  TvSmartIcon,
  ViewOffSlashIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { BarAvatar } from '@/components/admin/pub-avatar'
import { PhoneInput } from '@/components/phone-input'
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
}

export function PubHeroSection({
  bar,
  liveEvent,
  totalCount,
  onSave,
  onPhotoUpdate,
  isSaving
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
    await onSave(form)
    setEditing(false)
  }

  const handleCancel = () => {
    setForm(initialForm)
    setEditing(false)
  }

  return (
    <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-zinc-900 via-black to-zinc-900 text-white mb-8">
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(255,90,31,0.6),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(30,107,255,0.5),transparent_45%)]" />
      <div className="relative p-8 md:p-10 grid md:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="min-w-0">
          {/* Status badges */}
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-blue">
              <HugeiconsIcon
                icon={TvSmartIcon}
                size={12}
                color="currentColor"
                strokeWidth={1.5}
              />
              Painel administrativo
            </div>
            {bar.isActive ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                <HugeiconsIcon
                  icon={EyeIcon}
                  size={12}
                  color="currentColor"
                  strokeWidth={1.5}
                />{' '}
                Visível
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                <HugeiconsIcon
                  icon={ViewOffSlashIcon}
                  size={12}
                  color="currentColor"
                  strokeWidth={1.5}
                />{' '}
                Não visível
              </span>
            )}
          </div>

          <div className={`flex gap-5 ${editing ? 'flex-col sm:flex-row sm:items-start' : 'items-start'}`}>
            {/* Avatar clicável */}
            <BarAvatar
              name={bar.name}
              photoUrl={bar.photoUrl}
              onUploadSuccess={onPhotoUpdate}
            />

            <div className="flex-1 min-w-0">
              {liveEvent && !editing && (
                <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-orange mb-3">
                  <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
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
                    className="w-full bg-white/10 text-white placeholder-white/40 rounded-xl px-4 py-2.5 font-heading text-2xl font-bold outline-none focus:ring-2 focus:ring-white/30"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={form.address}
                      onChange={(e) =>
                        setForm({ ...form, address: e.target.value })
                      }
                      placeholder="Endereço"
                      className="w-full bg-white/10 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/30"
                    />
                    <input
                      value={form.neighborhood}
                      onChange={(e) =>
                        setForm({ ...form, neighborhood: e.target.value })
                      }
                      placeholder="Bairro"
                      className="w-full bg-white/10 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={form.city}
                      onChange={(e) =>
                        setForm({ ...form, city: e.target.value })
                      }
                      placeholder="Cidade"
                      className="w-full bg-white/10 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/30"
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
                    className="w-full bg-white/10 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/30 resize-none"
                  />
                </div>
              ) : (
                <>
                  <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-[0.95] mb-3">
                    {bar.name ?? 'Meu bar'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
                    {bar.address && (
                      <span className="inline-flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={MapPinIcon}
                          size={16}
                          color="currentColor"
                          strokeWidth={1.5}
                        />
                        {bar.address} · {bar.neighborhood}
                      </span>
                    )}
                    {bar.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={CallIcon}
                          size={16}
                          color="currentColor"
                          strokeWidth={1.5}
                        />
                        {formatStoredPhone(bar.phone)}
                      </span>
                    )}
                  </div>
                  {bar.description && (
                    <p className="text-sm text-white/60 mt-3 max-w-lg">
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
                <div className="font-heading text-3xl font-bold tabular-nums">
                  {totalCount}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/50 mt-0.5">
                  {totalCount === 1 ? 'Jogo' : 'Jogos'}
                </div>
              </div>
              {liveEvent && (
                <div>
                  <div className="font-heading text-3xl font-bold text-brand-orange tabular-nums">
                    1
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-brand-orange/70 mt-0.5">
                    Ao vivo
                  </div>
                </div>
              )}
            </div>
          )}

          {editing ? (
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-3 rounded-full transition-colors min-h-[44px]"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={14}
                  color="currentColor"
                  strokeWidth={1.5}
                />
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !form.name.trim() || !isDirty}
                className="inline-flex items-center gap-2 bg-brand-blue hover:bg-brand-blue/80 text-white text-xs font-bold px-4 py-3 rounded-full transition-colors disabled:opacity-50 min-h-[44px]"
              >
                <HugeiconsIcon
                  icon={FloppyDiskIcon}
                  size={14}
                  color="currentColor"
                  strokeWidth={1.5}
                />
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur text-white text-xs font-bold px-4 py-3 rounded-full transition-colors min-h-[44px]"
            >
              <HugeiconsIcon
                icon={PencilIcon}
                size={14}
                color="currentColor"
                strokeWidth={1.5}
              />
              Editar perfil
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
