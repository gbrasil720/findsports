import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { useRef } from 'react'
import { Botao, CampoTexto, Chip, Icone, Toggle } from '@/components/painel'
import {
  atalhosDoHorario,
  type DiaRascunho,
  SEMANA_PADRAO,
  situacaoDoHorario
} from './espaco-model'

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

/**
 * Editor do horário (28a; os atalhos e o aviso são da folha 28e, WEB-463).
 * `agora` liga a linha "Aberto agora · fecha às 01:00"; `aviso` é o que o
 * horário novo faz com os jogos publicados (`avisoDosJogos`).
 */
export function Horario({
  hours,
  erro,
  mudar,
  agora,
  aviso
}: {
  hours: DiaRascunho[] | null
  erro?: string
  mudar: (hours: DiaRascunho[] | null) => void
  agora?: number
  aviso?: { fora: boolean; texto: string } | null
}) {
  const lista = useRef<HTMLUListElement>(null)
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
  // O atalho acende de leve as linhas que mudou, para o dono ver o que ele fez.
  // Só opacidade, então vale também com movimento reduzido. 450 ms (acima dos
  // 300 da regra): o brilho que some mais rápido não chega a ser visto.
  const aplicar = (resultado: DiaRascunho[]) => {
    mudar(resultado)
    for (const [dia] of DIAS) {
      if (JSON.stringify(resultado[dia]) === JSON.stringify(hours[dia]))
        continue
      lista.current
        ?.querySelector(`[data-dia="${dia}"]`)
        ?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 450,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
          pseudoElement: '::before'
        })
    }
  }
  const situacao =
    agora === undefined ? null : situacaoDoHorario(hours, new Date(agora))
  return (
    <div className="flex flex-col gap-3.5">
      {situacao ? (
        <p className="painel-horario-situacao" data-aberto={situacao.aberto}>
          <span aria-hidden="true" />
          <b>{situacao.aberto ? 'Aberto agora' : 'Fechado agora'}</b>
          <span className="text-[var(--painel-muted)]">{situacao.texto}</span>
        </p>
      ) : null}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Atalhos</legend>
        {atalhosDoHorario(hours).map(({ rotulo, resultado }) => (
          <Chip
            key={rotulo}
            check={false}
            // `aria-disabled`, não `disabled`: o atalho recém-usado desliga e o
            // foco do teclado não pode cair no `body`.
            aria-disabled={!resultado}
            onClick={() => resultado && aplicar(resultado)}
          >
            {rotulo}
          </Chip>
        ))}
      </fieldset>
      <ul ref={lista} className="painel-horario-lista">
        {DIAS.map(([dia, nome], index) => {
          const d = hours[dia]
          if (!d) return null
          const igual = d.open && d.opens === d.closes
          return (
            <li
              key={dia}
              data-dia={dia}
              className={`painel-horario-dia ${index ? 'border-[var(--painel-line)] border-t' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`painel-disp [--painel-disp-size:20px] ${d.open ? '' : 'text-[var(--painel-muted)]'}`}
              >
                {nome.slice(0, 3)}
              </span>
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
              <Toggle
                ligado={d.open}
                onChange={(open) => atualizar(dia, { open })}
                rotulo={nome}
              />
            </li>
          )
        })}
      </ul>
      {/* Região viva fixa: o aviso entra e sai dentro dela. */}
      <div role="status" className="contents">
        {aviso ? (
          <p
            className="painel-horario-aviso"
            data-fora={aviso.fora || undefined}
          >
            <Icone nome="tv" tamanho={18} />
            {aviso.texto}
          </p>
        ) : null}
      </div>
      <Erro texto={erro} />
      <p className="text-[12.5px] text-[var(--painel-muted)] leading-[1.45]">
        Fecha depois da meia-noite? Informe a hora do dia seguinte, como 17:00
        às 02:00. O torcedor vê “Aberto agora” ou “Fechado agora”, no horário de
        Brasília. Jogo fora do horário recebe um aviso ao publicar.
      </p>
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
