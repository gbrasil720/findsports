import { UFS } from '@findsports_oficial/api/lib/bar-profile-validation'
import { normalizarCidade } from '@findsports_oficial/api/lib/city-match'
import {
  carregarMunicipios,
  type Municipio
} from '@/components/internal/controle-cidades'

/**
 * UF do endereço do bar (WEB-270), no onboarding e na edição do painel.
 *
 * Fica ao lado da cidade, e não dentro dela: `bar.city` continua nome puro,
 * que é o que `launch.pub_cities` compara (`cidadeLiberada`).
 */

type Props = {
  id: string
  value: string
  onChange: (uf: string) => void
  required?: boolean
}

export function UfSelect({ id, value, onChange, required }: Props) {
  return (
    <select
      id={id}
      name="uf"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="address-level1"
      required={required}
      // As opções abrem na lista do sistema: sem cor própria herdariam o texto
      // claro do campo ink sobre fundo claro.
      className="onside-select onside-input-ink [&>option]:bg-[var(--onside-paper)] [&>option]:text-[var(--onside-ink)]"
    >
      <option value="">Estado (UF)</option>
      {Object.entries(UFS).map(([uf, nome]) => (
        <option key={uf} value={uf}>
          {uf} — {nome}
        </option>
      ))}
    </select>
  )
}

/**
 * A UF que combina com a cidade digitada, pela lista de municípios do IBGE.
 *
 * - cidade que só existe em um estado: é a UF dele, mesmo trocando a que
 *   estava (quem muda "São Paulo" para "Curitiba" não pode ficar com SP);
 * - homônima em vários estados: a UF atual fica se for um deles, senão esvazia
 *   para o dono escolher — adivinhar aqui gravaria o bar no estado errado;
 * - fora da lista (distrito, erro de digitação): não mexe.
 */
export function ufParaCidade(
  municipios: Municipio[],
  cidade: string,
  atual: string
): string {
  const alvo = normalizarCidade(cidade)
  const ufs = municipios
    .filter(([nome]) => normalizarCidade(nome) === alvo)
    .map(([, uf]) => uf)
  if (ufs.length === 0 || ufs.includes(atual)) return atual
  return ufs.length === 1 ? (ufs[0] as string) : ''
}

/**
 * Para o `onBlur` do campo de cidade — ao sair, e não a cada tecla: "Bela
 * Vista" só existe em MS, mas é o começo de "Bela Vista de Goiás".
 *
 * `atualizar` recebe uma função porque a lista chega depois (~123 KB na
 * primeira vez) e a UF pode ter mudado nesse meio-tempo. Sem a lista, nada
 * acontece: o campo continua manual.
 */
export function conciliarUfComCidade(
  cidade: string,
  atualizar: (proxima: (atual: string) => string) => void
) {
  void carregarMunicipios()
    .then((municipios) =>
      atualizar((atual) => ufParaCidade(municipios, cidade, atual))
    )
    .catch(() => {})
}
