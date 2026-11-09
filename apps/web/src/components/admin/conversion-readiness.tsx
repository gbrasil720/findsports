import type { AdminBar, ProfileReadiness } from './admin-model'

/** Abaixo disso a seção pública ainda parece um cadastro pela metade. */
const MIN_AMENITIES_FOR_READY = 3

type ReadinessItem = ProfileReadiness['checks'][number] & {
  description: string
}

type DetailedReadiness = Omit<ProfileReadiness, 'checks'> & {
  checks: ReadinessItem[]
}

/** O "Perfil N de 7" de Meu espaço (`components/painel/meu-espaco.tsx`). */
export function buildReadiness(
  bar: AdminBar,
  hasUpcomingEvent: boolean
): DetailedReadiness {
  const hasPhone = (bar.phone?.length ?? 0) >= 10
  const checks: ReadinessItem[] = [
    {
      key: 'photo',
      label: 'Foto do bar',
      description: 'Ajuda o torcedor a reconhecer seu espaço.',
      done: !!bar.photoUrl
    },
    {
      key: 'name',
      label: 'Nome do bar',
      description: 'É como seu estabelecimento aparece nas buscas.',
      done: (bar.name?.length ?? 0) >= 2
    },
    {
      key: 'amenities',
      label: 'Características do bar',
      // Trocou a antiga checagem de descrição. O perfil do bar não é mais uma
      // caixa de texto: quem enche a seção pública, e quem alimenta o filtro
      // da busca, é o que o dono marcou. Cobrar descrição aqui apontaria para
      // a alavanca errada.
      description: 'Marque pelo menos 3 — é o que o torcedor usa para filtrar.',
      done: (bar.amenities?.length ?? 0) >= MIN_AMENITIES_FOR_READY
    },
    {
      key: 'address',
      label: 'Endereço completo',
      description: 'Necessário para rota, distância e mapa.',
      done:
        (bar.address?.length ?? 0) >= 5 &&
        (bar.neighborhood?.length ?? 0) >= 2 &&
        (bar.city?.length ?? 0) >= 2
    },
    {
      key: 'phone',
      label: 'Telefone de contato',
      description: 'Permite que potenciais clientes falem com o bar.',
      done: hasPhone
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp ativado',
      description: 'Confirme que o telefone também recebe mensagens.',
      done: hasPhone && !!bar.phoneAcceptsWhatsapp
    },
    {
      key: 'upcoming_event',
      label: 'Próximo jogo cadastrado',
      description: 'Coloca o bar nas buscas por partidas futuras.',
      done: hasUpcomingEvent
    }
  ]

  return {
    checks,
    score: checks.filter((check) => check.done).length,
    total: checks.length
  }
}
