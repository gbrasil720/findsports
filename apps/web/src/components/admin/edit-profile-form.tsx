import { useState } from 'react'
import { PhoneInput } from '@/components/phone-input'

type ProfileForm = {
  name: string
  address: string
  neighborhood: string
  city: string
  phone: string
  description: string
}

type Props = {
  initial: ProfileForm
  onSave: (data: ProfileForm) => void
  onCancel: () => void
  isSaving: boolean
  error?: string
}

export function EditProfileForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error
}: Props) {
  const [form, setForm] = useState<ProfileForm>(initial)
  const set =
    (key: keyof ProfileForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const canSave = form.name.length >= 2 && form.address.length >= 5

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
          Nome do bar *
        </span>
        <input
          value={form.name}
          onChange={set('name')}
          className="admin-input"
          placeholder="Nome do bar"
          autoComplete="organization"
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
          Endereço *
        </span>
        <input
          value={form.address}
          onChange={set('address')}
          className="admin-input"
          placeholder="Rua, número"
          autoComplete="street-address"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
            Bairro *
          </span>
          <input
            value={form.neighborhood}
            onChange={set('neighborhood')}
            className="admin-input"
            placeholder="Bairro"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
            Cidade *
          </span>
          <input
            value={form.city}
            onChange={set('city')}
            className="admin-input"
            placeholder="Cidade"
            autoComplete="address-level2"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
          Telefone
        </span>
        <PhoneInput
          defaultValue={form.phone}
          onChange={(phone) => setForm((prev) => ({ ...prev, phone }))}
          variant="admin"
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
          Descrição
        </span>
        <textarea
          value={form.description}
          onChange={set('description')}
          className="admin-input resize-none"
          rows={3}
          placeholder="Descreva o ambiente do seu bar..."
        />
      </label>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-full text-sm font-bold text-zinc-600 hover:bg-zinc-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={!canSave || isSaving}
          className="px-5 py-2 rounded-full text-sm font-bold bg-brand-blue text-white disabled:opacity-50"
        >
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
