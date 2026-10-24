import {
  BRASILIA_TIME_ZONE,
  brasiliaDay
} from '@findsports_oficial/db/event-window'
import { countLabel } from '@/lib/plural'
import {
  compareEventStartsAscending,
  compareEventStartsDescending,
  getEventTemporalState
} from './events'

/*
 * Contas da tela Jogos do painel do bar (1n–1q do design "Bar Web"): filtro,
 * busca, agrupamento por dia e a semana. Tudo no relógio de Brasília, como o
 * resto da grade; dia é `AAAA-MM-DD`.
 */

type Jogo = { startsAt: string | Date; endsAt: string | Date | null }

export type FiltroJogos = 'proximos' | 'passados'

/**
 * "Próximos" é o que ainda não acabou (o ao vivo entra, e por ter começado
 * antes fica no topo); "Passados", do mais recente para trás.
 */
export function filtrarJogos<T extends Jogo>(
  jogos: readonly T[],
  filtro: FiltroJogos,
  now: number = Date.now()
): T[] {
  const passado = (jogo: T) =>
    getEventTemporalState(jogo.startsAt, jogo.endsAt, now) === 'past'
  return filtro === 'passados'
    ? jogos.filter(passado).sort(compareEventStartsDescending)
    : jogos.filter((jogo) => !passado(jogo)).sort(compareEventStartsAscending)
}

/** Sem acento e em minúsculas, para a busca não depender de como se digita. */
function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Cada palavra da busca aparece em algum dos textos do jogo. */
export function casaBusca(busca: string, textos: readonly string[]): boolean {
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean)
  if (!palavras.length) return true
  const alvo = normalizar(textos.join(' '))
  return palavras.every((palavra) => alvo.includes(palavra))
}

/** `AAAA-MM-DD` mais `n` dias, sem fuso no meio (meio-dia UTC). */
export function somarDias(dia: string, n: number): string {
  const data = new Date(`${dia}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + n)
  return data.toISOString().slice(0, 10)
}

/** Meio-dia UTC é manhã em Brasília: o mesmo dia no `Intl`. */
function formatar(dia: string, opcoes: Intl.DateTimeFormatOptions) {
  return new Date(`${dia}T12:00:00Z`)
    .toLocaleDateString('pt-BR', { ...opcoes, timeZone: BRASILIA_TIME_ZONE })
    .replace(/\./g, '')
}

/** "seg", "ter"… */
function semanaCurta(dia: string) {
  return formatar(dia, { weekday: 'short' })
}

/** "Quarta", "Sábado": o dia da semana sem o "-feira". */
function semanaLonga(dia: string) {
  const nome = formatar(dia, { weekday: 'long' }).replace(/-feira$/, '')
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/** "12 out"; com o ano quando não é o de `hoje`. */
function diaMes(dia: string, hoje: string) {
  const texto = formatar(dia, { day: 'numeric', month: 'short' }).replace(
    ' de ',
    ' '
  )
  return dia.slice(0, 4) === hoje.slice(0, 4)
    ? texto
    : `${texto} ${dia.slice(0, 4)}`
}

/**
 * Título do dia na lista: "Hoje · seg, 12 out", "Amanhã · ter, 13 out",
 * "Ontem · dom, 11 out" e, nos outros, "Quarta · 14 out".
 */
export function rotuloDia(dia: string, now: Date | number = Date.now()) {
  const hoje = brasiliaDay(now)
  const perto =
    dia === hoje
      ? 'Hoje'
      : dia === somarDias(hoje, 1)
        ? 'Amanhã'
        : dia === somarDias(hoje, -1)
          ? 'Ontem'
          : null
  return perto
    ? `${perto} · ${semanaCurta(dia)}, ${diaMes(dia, hoje)}`
    : `${semanaLonga(dia)} · ${diaMes(dia, hoje)}`
}

export type GrupoDia<T> = {
  dia: string
  rotulo: string
  hoje: boolean
  jogos: T[]
}

/** Agrupa por dia de Brasília, na ordem em que os jogos já vieram. */
export function agruparPorDia<T extends Jogo>(
  jogos: readonly T[],
  now: Date | number = Date.now()
): GrupoDia<T>[] {
  const hoje = brasiliaDay(now)
  const grupos = new Map<string, GrupoDia<T>>()
  for (const jogo of jogos) {
    const dia = brasiliaDay(jogo.startsAt)
    const grupo = grupos.get(dia)
    if (grupo) grupo.jogos.push(jogo)
    else
      grupos.set(dia, {
        dia,
        rotulo: rotuloDia(dia, now),
        hoje: dia === hoje,
        jogos: [jogo]
      })
  }
  return [...grupos.values()]
}

export type DiaSemana<T> = {
  dia: string
  /** "12" */
  numero: string
  /** "Seg" */
  semana: string
  hoje: boolean
  /** Já passou: não ganha "Adicionar". */
  passado: boolean
  jogos: T[]
}

/** Os sete dias a partir de `inicio`, com os jogos de cada um. */
export function montarSemana<T extends Jogo>(
  inicio: string,
  jogos: readonly T[],
  now: Date | number = Date.now()
): DiaSemana<T>[] {
  const hoje = brasiliaDay(now)
  const porDia = new Map<string, T[]>()
  for (const jogo of [...jogos].sort(compareEventStartsAscending)) {
    const dia = brasiliaDay(jogo.startsAt)
    porDia.set(dia, [...(porDia.get(dia) ?? []), jogo])
  }
  return Array.from({ length: 7 }, (_, i) => {
    const dia = somarDias(inicio, i)
    const curta = semanaCurta(dia)
    return {
      dia,
      numero: String(Number(dia.slice(8))),
      semana: curta.charAt(0).toUpperCase() + curta.slice(1),
      hoje: dia === hoje,
      passado: dia < hoje,
      jogos: porDia.get(dia) ?? []
    }
  })
}

/** "12 a 18 out", "28 out a 3 nov". */
export function rotuloSemana(inicio: string, now: Date | number = Date.now()) {
  const hoje = brasiliaDay(now)
  const fim = somarDias(inicio, 6)
  const mesmoMes = inicio.slice(0, 7) === fim.slice(0, 7)
  const comeco = mesmoMes
    ? String(Number(inicio.slice(8)))
    : diaMes(inicio, hoje)
  return `${comeco} a ${diaMes(fim, hoje)}`
}

/** "Marcou há 2 h", "Marcou há 40 min". */
export function marcouHa(at: Date, now: number = Date.now()) {
  const minutos = Math.max(1, Math.round((now - at.getTime()) / 60_000))
  if (minutos < 60) return `Marcou há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `Marcou há ${horas} h`
  return `Marcou há ${countLabel(Math.round(horas / 24), 'dia', 'dias')}`
}
