import { PhoneInput } from '@/components/phone-input'

type Props = {
  name: string
  address: string
  neighborhood: string
  city: string
  phone: string
  description: string
  onChange: (field: string, value: string) => void
}

export function PubInfoForm({
  name,
  address,
  neighborhood,
  city,
  phone,
  description,
  onChange
}: Props) {
  return (
    <div className="space-y-4 max-w-md">
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
          Nome do estabelecimento *
        </span>
        <input
          value={name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="Ex: Bar do Zé"
          className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
          Endereço *
        </span>
        <input
          value={address}
          onChange={(e) => onChange('address', e.target.value)}
          placeholder="Ex: Rua Aspicuelta, 123"
          className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
            Bairro *
          </span>
          <input
            value={neighborhood}
            onChange={(e) => onChange('neighborhood', e.target.value)}
            placeholder="Ex: Vila Madalena"
            className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
            Cidade
          </span>
          <input
            value={city}
            onChange={(e) => onChange('city', e.target.value)}
            placeholder="São Paulo"
            className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
          Telefone
        </span>
        <PhoneInput
          defaultValue={phone}
          onChange={(p) => onChange('phone', p)}
          variant="onboarding"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
          Descrição
        </span>
        <textarea
          value={description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Ex: Bar esportivo com 4 TVs e transmissão de todos os jogos"
          rows={3}
          className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition resize-none"
        />
      </label>
    </div>
  )
}
