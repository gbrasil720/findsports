import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { Botao, CampoTexto } from '@/components/painel'
import { type DiaRascunho, SEMANA_PADRAO } from './espaco-model'

/*
 * Horário e oferta da casa, como o Meu espaço os edita. A Revisão do
 * cadastro do bar (WEB-448) usa os mesmos, para as duas telas não divergirem.
 */

export function Erro({ texto }: { texto?: string }) {
  return texto ? (
    <span role="alert" className="text-[var(--painel-live)]">
      {texto}
    </span>
  ) : null
}

/** Segunda primeiro; o índice é o do `getDay` (0 = domingo). */
const DIAS = [
  [1, 'Segunda'],
  [2, 'Terça'],
  [3, 'Quarta'],
  [4, 'Quinta'],
  [5, 'Sexta'],
  [6, 'Sábado'],
  [0, 'Domingo']
] as const

export function Horario({
  hours,
  erro,
  mudar
}: {
  hours: DiaRascunho[] | null
  erro?: string
  mudar: (hours: DiaRascunho[] | null) => void
}) {
  if (!hours) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-[var(--painel-muted)]">
          A página do bar não mostra horário. Com ele, o torcedor vê “aberto
          agora” no horário de Brasília.
        </p>
        <Botao altura={38} onClick={() => mudar(SEMANA_PADRAO)}>
          Informar horário
        </Botao>
      </div>
    )
  }
  const atualizar = (dia: number, patch: Partial<DiaRascunho>) =>
    mudar(hours.map((d, i) => (i === dia ? { ...d, ...patch } : d)))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-[var(--painel-muted)]">
        Fecha depois da meia-noite? Informe a hora do dia seguinte, como 17:00
        às 02:00.
      </p>
      <ul>
        {DIAS.map(([dia, nome], index) => {
          const d = hours[dia]
          if (!d) return null
          const igual = d.open && d.opens === d.closes
          return (
            <li
              key={dia}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-2 ${index ? 'border-[var(--painel-line)] border-t' : ''}`}
            >
              <label className="flex w-36 items-center gap-2.5 font-semibold text-[14px]">
                <input
                  type="checkbox"
                  checked={d.open}
                  onChange={(e) => atualizar(dia, { open: e.target.checked })}
                  className="size-4 accent-[var(--painel-acid)]"
                />
                {nome}
              </label>
              {d.open ? (
                <div className="flex min-w-0 items-center gap-2">
                  <HoraCampo
                    rotulo={`${nome}, abre`}
                    valor={d.opens}
                    mudar={(opens) => atualizar(dia, { opens })}
                  />
                  <span aria-hidden="true">–</span>
                  <HoraCampo
                    rotulo={`${nome}, fecha`}
                    valor={d.closes}
                    invalido={igual}
                    mudar={(closes) => atualizar(dia, { closes })}
                  />
                </div>
              ) : (
                <span className="text-[13.5px] text-[var(--painel-muted)]">
                  Fechado
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <Erro texto={erro} />
      <div>
        <Botao altura={36} onClick={() => mudar(null)}>
          Tirar o horário da página
        </Botao>
      </div>
    </div>
  )
}

function HoraCampo({
  rotulo,
  valor,
  invalido,
  mudar
}: {
  rotulo: string
  valor: string
  invalido?: boolean
  mudar: (valor: string) => void
}) {
  return (
    // Encolhe até a hora caber: a 320 px duas caixas de 140 passavam da tela.
    <div className="painel-campo-caixa w-[140px] min-w-0 px-2.5 [--painel-campo-h:40px]">
      <input
        type="time"
        aria-label={rotulo}
        value={valor}
        aria-invalid={invalido || undefined}
        onChange={(e) => e.target.value && mudar(e.target.value)}
        // No celular o seletor abre ao tocar; o relógio do Chrome só tomava a
        // largura da hora.
        className="painel-mono max-sm:[&::-webkit-calendar-picker-indicator]:hidden"
      />
    </div>
  )
}

export function OfertaDaCasa({
  valor,
  erro,
  mudar
}: {
  valor: string
  erro?: string
  mudar: (valor: string) => void
}) {
  const tamanho = houseOfferLength(normalizeHouseOffer(valor))
  const passou = tamanho > HOUSE_OFFER_MAX_LENGTH
  return (
    <div>
      <CampoTexto
        aria-label="Oferta da casa"
        altura={84}
        rows={2}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        aria-invalid={erro || passou ? true : undefined}
      />
      <div className="mt-1.5 flex justify-between gap-3 text-[12.5px] text-[var(--painel-muted)]">
        <span>Vale para quem validar o código no balcão.</span>
        <span
          className={`painel-mono text-[12px] ${passou ? 'text-[var(--painel-live)]' : ''}`}
        >
          {tamanho}/{HOUSE_OFFER_MAX_LENGTH}
        </span>
      </div>
      {erro ? (
        <p
          role="alert"
          className="mt-1.5 text-[12.5px] text-[var(--painel-live)]"
        >
          {erro}
        </p>
      ) : null}
      <p className="mt-3 text-[12.5px] text-[var(--painel-muted)] leading-[1.45]">
        A promessa é sua com o cliente: a Onside não define nem confere o
        conteúdo. Em branco, o perfil não mostra oferta.
      </p>
    </div>
  )
}
