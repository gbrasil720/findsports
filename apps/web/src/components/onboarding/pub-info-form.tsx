import type { ReactNode } from 'react'
import { useState } from 'react'
import { Check } from '@/components/landing/v3/icons'
import { PhoneInput } from '@/components/phone-input'
import { UfSelect } from '@/components/uf-select'
import { type CepStatus, juntarEndereco, separarNumero } from '@/lib/cep'

type FieldName =
  | 'name'
  | 'address'
  | 'neighborhood'
  | 'city'
  | 'uf'
  | 'phone'
  | 'description'

type Props = {
  name: string
  cep: string
  cepStatus: CepStatus
  /** Com os oito dígitos, a tela busca no ViaCEP e preenche o endereço. */
  onCepChange: (value: string) => void
  /** Rua e número juntos, "Rua Aspicuelta, 214": a coluna é uma só. */
  address: string
  neighborhood: string
  city: string
  uf: string
  phone: string
  description: string
  onChange: (field: FieldName, value: string) => void
  /** Ao sair da cidade, a tela concilia a UF com ela (`uf-select.tsx`). */
  onCityBlur?: () => void
  errors?: Partial<Record<'phone', string>>
}

const DESCRIPTION_MAX = 500

function Field({
  id,
  label,
  span,
  auto,
  extra,
  error,
  children
}: {
  id: string
  label: string
  span: 'c2' | 'c4' | 'c6'
  /** Preenchido pelo CEP: o campo fica verde-limão e o rótulo diz de onde veio. */
  auto?: boolean
  extra?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <div className={`ob-fl ${span}${auto ? ' auto' : ''}`}>
      <label htmlFor={id} className="onside-label">
        <span>
          {label}
          {auto ? (
            <em className="ob-auto" aria-hidden="true">
              {' '}
              · pelo CEP
            </em>
          ) : null}
        </span>
        {extra}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="onside-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const CEP_STATUS: Record<
  Exclude<CepStatus, 'idle'>,
  { tone: string; title: string; text: string }
> = {
  buscando: { tone: 'cep-wait', title: 'Buscando o CEP…', text: '' },
  achou: {
    tone: 'cep-ok',
    title: 'CEP encontrado',
    text: 'Preenchemos o endereço. Confira e coloque o número.'
  },
  nao: {
    tone: 'cep-no',
    title: 'Não achamos esse CEP',
    text: 'Preencha o endereço abaixo.'
  }
}

/**
 * O passo "Estabelecimento" do cadastro do bar (WEB-501): o CEP preenche rua,
 * bairro, cidade e UF, e os campos que vieram dele ficam marcados.
 */
export function PubInfoForm({
  name,
  cep,
  cepStatus,
  onCepChange,
  address,
  neighborhood,
  city,
  uf,
  phone,
  description,
  onChange,
  onCityBlur,
  errors = {}
}: Props) {
  // Rua e número em dois campos, gravados juntos. O par fica aqui enquanto o
  // dono digita (o `trim` de `juntarEndereco` comeria o espaço do fim da
  // rua); quando o endereço muda por fora (CEP, rascunho), o par é refeito.
  const [[rua, numero], setParts] = useState(() => separarNumero(address))
  const fromAddress = separarNumero(address)
  if (
    juntarEndereco(rua, numero) !== address &&
    (fromAddress[0] !== rua || fromAddress[1] !== numero)
  ) {
    setParts(fromAddress)
  }
  const setAddress = (nextRua: string, nextNumero: string) => {
    setParts([nextRua, nextNumero])
    onChange('address', juntarEndereco(nextRua, nextNumero))
  }

  const auto = cepStatus === 'achou'
  const status = cepStatus === 'idle' ? null : CEP_STATUS[cepStatus]

  return (
    <div className="ob-form">
      <Field id="pub-name" label="Nome do estabelecimento" span="c6">
        <input
          id="pub-name"
          name="name"
          value={name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="Ex: Bar do Zé"
          autoComplete="organization"
          required
          maxLength={120}
          className="onside-input"
        />
      </Field>

      <Field
        id="pub-cep"
        label="CEP"
        span="c2"
        extra={
          <a
            href="https://buscacepinter.correios.com.br/app/endereco/index.php"
            target="_blank"
            rel="noopener noreferrer"
          >
            Não sei
          </a>
        }
      >
        <input
          id="pub-cep"
          name="cep"
          value={cep}
          onChange={(e) => onCepChange(e.target.value)}
          placeholder="00000-000"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={9}
          aria-describedby="pub-cep-status"
          className="onside-input"
        />
      </Field>
      <div
        id="pub-cep-status"
        className={`ob-cepf c4 ${status?.tone ?? 'cep-wait'}`}
        role="status"
      >
        {status?.tone === 'cep-ok' ? (
          <span className="ck" aria-hidden="true">
            <Check size={16} />
          </span>
        ) : null}
        <span>
          <b>{status?.title ?? 'O CEP preenche o endereço'}</b>
          {status
            ? status.text
            : 'Rua, bairro, cidade e estado. Ou preencha à mão.'}
        </span>
      </div>

      <Field id="pub-street" label="Rua" span="c4" auto={auto}>
        <input
          id="pub-street"
          name="street"
          value={rua}
          onChange={(e) => setAddress(e.target.value, numero)}
          placeholder="Ex: Rua Aspicuelta"
          autoComplete="address-line1"
          required
          maxLength={180}
          className="onside-input"
        />
      </Field>
      <Field id="pub-number" label="Número" span="c2">
        <input
          id="pub-number"
          name="number"
          value={numero}
          onChange={(e) => setAddress(rua, e.target.value)}
          placeholder="Ex: 214"
          autoComplete="off"
          maxLength={20}
          className="onside-input"
        />
      </Field>

      <Field id="pub-neighborhood" label="Bairro" span="c2" auto={auto}>
        <input
          id="pub-neighborhood"
          name="neighborhood"
          value={neighborhood}
          onChange={(e) => onChange('neighborhood', e.target.value)}
          placeholder="Ex: Vila Madalena"
          autoComplete="address-level3"
          required
          maxLength={100}
          className="onside-input"
        />
      </Field>
      <Field id="pub-city" label="Cidade" span="c2" auto={auto}>
        <input
          id="pub-city"
          name="city"
          value={city}
          onChange={(e) => onChange('city', e.target.value)}
          onBlur={onCityBlur}
          placeholder="São Paulo"
          autoComplete="address-level2"
          maxLength={100}
          className="onside-input"
        />
      </Field>
      <Field id="pub-uf" label="Estado (UF)" span="c2" auto={auto}>
        <UfSelect
          id="pub-uf"
          value={uf}
          onChange={(value) => onChange('uf', value)}
          required
        />
      </Field>

      <Field
        id="pub-phone"
        label="Telefone ou WhatsApp · opcional"
        span="c6"
        error={errors.phone}
      >
        <PhoneInput
          id="pub-phone"
          name="phone"
          defaultValue={phone}
          onChange={(p) => onChange('phone', p)}
          tone="paper"
          invalid={Boolean(errors.phone)}
          describedBy={errors.phone ? 'pub-phone-error' : undefined}
        />
      </Field>

      <Field
        id="pub-description"
        label="Descrição · opcional"
        span="c6"
        extra={
          <span aria-hidden="true">
            {description.length} de {DESCRIPTION_MAX}
          </span>
        }
      >
        <textarea
          id="pub-description"
          name="description"
          value={description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Ex: mesa de sinuca no fundo e happy hour até as 20h nos dias de jogo"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          className="onside-textarea"
        />
      </Field>
    </div>
  )
}
