import {
  ehUf,
  type Uf
} from '@findsports_oficial/api/lib/bar-profile-validation'
import {
  dayHoursSchema,
  normalizeOpeningHours,
  type OpeningHours
} from '@findsports_oficial/api/lib/opening-hours'
import {
  averageSpendInputValue,
  parseAverageSpendInput,
  parseMenuUrl
} from '@findsports_oficial/db/bar-menu'
import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { juntarEndereco, separarNumero } from '@/lib/cep'

/*
 * O rascunho de "Meu espaço" (WEB-501, fase 4; protótipo `espaco` e
 * `dirty`): o que o dono mexe fica aqui até "Salvar alterações", e cada parte
 * vai à sua mutation só se mudou. Contas puras, sem React.
 */

type Bar = {
  name: string
  address: string
  neighborhood: string
  city: string
  uf: string | null
  phone: string | null
  description: string | null
  amenities: number[]
  screenCount: number | null
  houseOffer: string | null
  menuUrl: string | null
  averageSpendCents: number | null
  openingHours?: OpeningHours | null
}

export type Perfil = {
  name: string
  /** `address` é uma coluna só: rua e número se separam aqui e voltam juntos. */
  rua: string
  numero: string
  neighborhood: string
  city: string
  uf: string
  phone: string
  description: string
  amenities: number[]
  screenCount: number | null
}

export type Rascunho = {
  perfil: Perfil
  oferta: string
  cardapio: { url: string; gasto: string }
  /** Sete dias, 0 no domingo; `null` é fechado (WEB-397). */
  horario: OpeningHours
}

export type Parte = keyof Rascunho

export const PARTES: Parte[] = ['perfil', 'horario', 'oferta', 'cardapio']

export function doBar(bar: Bar): Rascunho {
  const [rua, numero] = separarNumero(bar.address ?? '')
  return {
    perfil: {
      name: bar.name ?? '',
      rua,
      numero,
      neighborhood: bar.neighborhood ?? '',
      city: bar.city ?? '',
      uf: bar.uf ?? '',
      phone: bar.phone ?? '',
      description: bar.description ?? '',
      amenities: bar.amenities ?? [],
      screenCount: bar.screenCount ?? null
    },
    oferta: bar.houseOffer ?? '',
    cardapio: {
      url: bar.menuUrl ?? '',
      gasto: averageSpendInputValue(bar.averageSpendCents)
    },
    horario: bar.openingHours ?? semHorario()
  }
}

const semHorario = (): OpeningHours => Array.from({ length: 7 }, () => null)

/** O dia que o dono liga sem faixa nenhuma ainda: a noite de jogo. */
export const DIA_PADRAO = { opens: '18:00', closes: '00:00' }

/**
 * O horário do rascunho no formato de `pub.updateOpeningHours`: a semana toda
 * fechada é "não informado" (`null`), como o servidor grava. Abre e fecha na
 * mesma hora não serve; fechar antes de abrir é virar a meia-noite.
 */
export function horario(
  rascunho: OpeningHours,
  gravado: OpeningHours | null | undefined
) {
  const valor = normalizeOpeningHours(rascunho)
  const antes = normalizeOpeningHours(gravado ?? null)
  const erro = rascunho.some((dia) => !dayHoursSchema.safeParse(dia).success)
    ? 'Confira os horários: cada dia abre e fecha em horas diferentes.'
    : null
  return {
    valor,
    erro,
    mudou: JSON.stringify(valor) !== JSON.stringify(antes)
  }
}

const mesmaLista = (a: number[], b: number[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

/** O que mudou no perfil, já no formato de `pub.updateMe`. */
export function entradaDoPerfil(perfil: Perfil, base: Perfil, cep: string) {
  const mudou = <K extends keyof Perfil>(k: K) => perfil[k] !== base[k]
  const endereco = juntarEndereco(perfil.rua, perfil.numero)
  const entrada: {
    name?: string
    address?: string
    neighborhood?: string
    city?: string
    uf?: Uf
    cep?: string
    phone?: string
    description?: string
    amenities?: number[]
    screenCount?: number | null
  } = {}
  // Nome e endereço são obrigatórios (o servidor recusa ''): vazio é "não
  // mexer". Telefone e descrição são opcionais: '' limpa (WEB-143).
  if (mudou('name') && perfil.name.trim()) entrada.name = perfil.name.trim()
  if ((mudou('rua') || mudou('numero')) && endereco) entrada.address = endereco
  if (mudou('neighborhood') && perfil.neighborhood.trim())
    entrada.neighborhood = perfil.neighborhood.trim()
  if (mudou('city') && perfil.city.trim()) entrada.city = perfil.city.trim()
  // Sem UF escolhida, "não mexer": bar anterior ao campo salva o resto (WEB-270).
  if (mudou('uf') && ehUf(perfil.uf)) entrada.uf = perfil.uf
  // Só o CEP digitado inteiro: o servidor geocodifica de novo com ele.
  if (cep.length === 9) entrada.cep = cep
  if (mudou('phone')) entrada.phone = perfil.phone
  if (mudou('description')) entrada.description = perfil.description
  if (!mesmaLista(perfil.amenities, base.amenities))
    entrada.amenities = perfil.amenities
  if (mudou('screenCount')) entrada.screenCount = perfil.screenCount
  return entrada
}

export function perfilMudou(perfil: Perfil, base: Perfil, cep: string) {
  return Object.keys(entradaDoPerfil(perfil, base, cep)).length > 0
}

export function oferta(rascunho: string, gravada: string | null) {
  const valor = normalizeHouseOffer(rascunho)
  const tamanho = houseOfferLength(valor)
  return {
    valor,
    tamanho,
    mudou: valor !== gravada,
    erro:
      tamanho > HOUSE_OFFER_MAX_LENGTH
        ? `A oferta aceita até ${HOUSE_OFFER_MAX_LENGTH} caracteres. Tire ${tamanho - HOUSE_OFFER_MAX_LENGTH}.`
        : null
  }
}

export function cardapio(
  rascunho: Rascunho['cardapio'],
  gravado: { menuUrl: string | null; averageSpendCents: number | null }
) {
  const url = parseMenuUrl(rascunho.url)
  const gasto = parseAverageSpendInput(rascunho.gasto)
  const mudancas: {
    menuUrl?: string | null
    averageSpendCents?: number | null
  } = {}
  if (url.ok && url.url !== gravado.menuUrl) mudancas.menuUrl = url.url
  if (gasto.ok && gasto.cents !== gravado.averageSpendCents)
    mudancas.averageSpendCents = gasto.cents
  // Campo inválido também é mudança: o dono mexeu, e salvar mostra o erro.
  const mudou =
    Object.keys(mudancas).length > 0 ||
    (!url.ok && rascunho.url !== (gravado.menuUrl ?? '')) ||
    (!gasto.ok &&
      rascunho.gasto !== averageSpendInputValue(gravado.averageSpendCents))
  return {
    mudancas,
    mudou,
    erroUrl: url.ok ? null : url.error,
    erroGasto: gasto.ok ? null : gasto.error,
    url: url.ok ? url.url : null,
    gasto: gasto.ok ? gasto.cents : null
  }
}
