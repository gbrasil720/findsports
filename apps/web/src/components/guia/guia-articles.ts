import type { PageClosing, PageDocument } from '@/components/legal/legal-page'

/**
 * Artigos do guia (`/guia`). Texto de marketing, escrito para quem busca onde
 * assistir a um jogo. Regra: só fala do que a Onside faz hoje e de conselho
 * prático; não cita bar, número nem estatística que não dê para conferir.
 */
export type GuiaArticle = {
  slug: string
  /** `<title>`, sem o " — Onside" do fim. */
  seoTitle: string
  description: string
  /** AAAA-MM-DD */
  published: string
  modified: string
  document: PageDocument
  closing: PageClosing
}

export const FAN_CLOSING: PageClosing = {
  kicker: 'Grátis para torcedores',
  title: 'Ache o bar do próximo jogo na Onside.',
  href: '/signup',
  label: 'Criar conta'
}

const BAR_CLOSING: PageClosing = {
  kicker: 'Para bares',
  title: 'Coloque a grade do seu bar na Onside.',
  href: '/signup?role=pub',
  label: 'Cadastrar meu bar'
}

const SAO_PAULO: GuiaArticle = {
  slug: 'onde-assistir-futebol-em-sao-paulo',
  seoTitle: 'Onde assistir futebol em São Paulo: como escolher o bar',
  description:
    'Telão, som do jogo, torcida, preço e como voltar para casa: o que olhar antes de escolher um bar para assistir futebol em São Paulo.',
  published: '2026-10-19',
  modified: '2026-10-19',
  closing: FAN_CLOSING,
  document: {
    kicker: 'Guia · Torcedor',
    title: 'Onde assistir futebol em São Paulo: como escolher o bar',
    updated: '19 de outubro de 2026',
    reading: '5 seções · ~5 min',
    intro: [
      'São Paulo tem bar para todo tipo de torcedor, e é justamente isso que complica: dois lugares na mesma rua podem oferecer experiências completamente diferentes no mesmo jogo. Um tem telão e som da transmissão; o outro tem uma TV pequena no canto e música ambiente.',
      'Este guia junta o que vale conferir antes de sair de casa, para você escolher o bar pelo jogo, e não descobrir na hora que ele não serve.'
    ],
    company: [],
    other: {
      label: 'Como achar um bar que passa o jogo do seu time',
      to: '/guia/como-achar-bar-que-passa-o-jogo-do-seu-time',
      blurb:
        'O passo a passo para não chegar e descobrir que o jogo não está passando.'
    },
    sections: [
      {
        id: 'jogo-confirmado',
        num: '01',
        title: 'Comece pelo jogo, não pelo bar',
        blocks: [
          {
            type: 'p',
            content:
              'O erro mais comum é escolher o bar de sempre e torcer para ele passar a partida. Em rodada cheia, com vários jogos no mesmo horário, cada bar decide o que vai para as telas, e o seu jogo pode ficar numa TV lateral ou nem entrar.'
          },
          {
            type: 'p',
            content:
              'Inverta a ordem: primeiro descubra quais bares confirmaram aquele jogo, depois escolha entre eles. Se o bar diz que vai passar, você só precisa decidir se o lugar combina com você.'
          }
        ]
      },
      {
        id: 'infraestrutura',
        num: '02',
        title: 'Confira a infraestrutura para ver o jogo',
        blocks: [
          {
            type: 'p',
            content:
              'Ver o jogo bem depende de poucas coisas, e vale perguntar por elas antes de ir:'
          },
          {
            type: 'ul',
            items: [
              [
                { b: 'Telão ou projetor:' },
                ' faz diferença quando o bar enche e a mesa fica longe da TV.'
              ],
              [
                { b: 'Som do jogo ligado:' },
                ' ouvir a narração e o estádio muda o clima. Muitos bares deixam música ambiente e o jogo no mudo.'
              ],
              [
                { b: 'Canais fechados:' },
                ' parte das partidas passa só em TV por assinatura, pay-per-view ou streaming. O bar precisa ter o serviço daquela transmissão.'
              ],
              [
                { b: 'Mais de uma tela:' },
                ' em rodada com jogos simultâneos, é o que permite passar o seu sem disputar com outro.'
              ]
            ]
          }
        ]
      },
      {
        id: 'clima',
        num: '03',
        title: 'Escolha o clima que você quer',
        blocks: [
          {
            type: 'p',
            content:
              'Não existe bar melhor em absoluto, existe o bar certo para a ocasião. Assistir a uma final com a torcida cantando é uma experiência; ver um jogo de meio de semana conversando com os amigos é outra.'
          },
          {
            type: 'ul',
            items: [
              [
                { b: 'Animado:' },
                ' som alto, torcida, gente em pé. Ótimo em clássico e decisão, mas chegue cedo.'
              ],
              [
                { b: 'Tranquilo:' },
                ' mesa garantida, dá para conversar e pedir comida sem pressa.'
              ],
              [
                { b: 'Torcida dividida:' },
                ' em clássico, vale saber se o bar costuma reunir uma torcida só. Ninguém quer comemorar gol cercado de rival.'
              ]
            ]
          }
        ]
      },
      {
        id: 'preco-e-comida',
        num: '04',
        title: 'Preço, comida e o que mais pesa na conta',
        blocks: [
          {
            type: 'p',
            content:
              'Um jogo dura duas horas, e com pré e pós-jogo a noite fica mais longa. Antes de ir, veja o preço médio do bar, se a cozinha fica aberta até o fim da partida e se ele aceita Pix e cartão. Em grupo, confirme também se dá para dividir a conta sem complicação.'
          },
          {
            type: 'p',
            content:
              'Se alguém do grupo precisa de acessibilidade, área coberta para dia de chuva ou lugar que aceite pet, pergunte antes. São detalhes que decidem se a noite funciona para todo mundo.'
          }
        ]
      },
      {
        id: 'ida-e-volta',
        num: '05',
        title: 'Pense na ida e na volta',
        blocks: [
          {
            type: 'p',
            content:
              'Em São Paulo, a distância conta mais que no mapa. Jogo à noite termina tarde, e o trânsito depois de um clássico pode ser pesado. Um bar perto de casa ou de uma estação de metrô costuma valer mais que um lugar famoso do outro lado da cidade.'
          },
          {
            type: 'p',
            content:
              'Se vai de carro, veja se há estacionamento no local ou perto. E se for beber, combine antes quem dirige, ou deixe o carro em casa.'
          },
          {
            type: 'attention',
            label: 'Na Onside',
            content: [
              'A busca da Onside começa pelo jogo: você vê os bares que confirmaram a partida e compara infraestrutura, preço médio e distância antes de sair. A conta de torcedor é grátis. ',
              { link: 'Veja como funciona', to: '/#como-funciona' },
              '.'
            ]
          }
        ]
      }
    ]
  }
}

const SEU_TIME: GuiaArticle = {
  slug: 'como-achar-bar-que-passa-o-jogo-do-seu-time',
  seoTitle: 'Como achar um bar que passa o jogo do seu time',
  description:
    'Transmissão, horário, torcida e o que perguntar ao bar: o passo a passo para achar um lugar que passe o jogo do seu time, sem surpresa na hora.',
  published: '2026-10-19',
  modified: '2026-10-19',
  closing: FAN_CLOSING,
  document: {
    kicker: 'Guia · Torcedor',
    title: 'Como achar um bar que passa o jogo do seu time',
    updated: '19 de outubro de 2026',
    reading: '5 seções · ~4 min',
    intro: [
      'Todo torcedor já passou por isso: chegar ao bar, pedir a primeira rodada e descobrir que o jogo do seu time não está passando, ou está numa TV sem som enquanto o resto do bar assiste a outra partida.',
      'Dá para evitar com um pouco de planejamento. Este é o passo a passo.'
    ],
    company: [],
    other: {
      label: 'Onde assistir futebol em São Paulo',
      to: '/guia/onde-assistir-futebol-em-sao-paulo',
      blurb:
        'O que olhar antes de escolher o bar: telão, som, clima, preço e a volta.'
    },
    sections: [
      {
        id: 'transmissao',
        num: '01',
        title: 'Descubra onde o jogo vai passar',
        blocks: [
          {
            type: 'p',
            content:
              'Antes do bar, descubra a transmissão. Dependendo do campeonato e da rodada, o jogo pode passar em TV aberta, em canal fechado, em pay-per-view ou só em streaming. Isso muda tudo: um bar sem o serviço certo simplesmente não tem como passar a partida.'
          },
          {
            type: 'p',
            content:
              'Os direitos mudam de um ano para o outro e de uma competição para outra, então confira perto da data. A tabela do campeonato e o site do seu clube costumam informar onde cada jogo vai passar.'
          }
        ]
      },
      {
        id: 'confirmacao',
        num: '02',
        title: 'Procure bar que confirmou a partida',
        blocks: [
          {
            type: 'p',
            content:
              '“Passa todos os jogos” raramente é verdade em rodada cheia. O que vale é a confirmação daquele jogo, naquele horário. Procure um bar que tenha divulgado a grade da rodada, ou pergunte diretamente: qual tela, com som ou sem som.'
          },
          {
            type: 'p',
            content:
              'Se o jogo é de um time de fora do seu estado, ou de um campeonato com menos procura, a confirmação é ainda mais importante: são esses os jogos que costumam ficar de fora quando há disputa por tela.'
          }
        ]
      },
      {
        id: 'torcida',
        num: '03',
        title: 'Veja de quem é a torcida',
        blocks: [
          {
            type: 'p',
            content:
              'Alguns bares viram ponto de encontro de uma torcida específica. É ótimo quando é a sua, e desconfortável quando é a do rival. Em clássico, pergunte ao bar ou a amigos que frequentam o lugar.'
          }
        ]
      },
      {
        id: 'horario',
        num: '04',
        title: 'Chegue antes do apito',
        blocks: [
          {
            type: 'ul',
            items: [
              [
                { b: 'Jogo grande lota:' },
                ' em final, clássico e jogo decisivo, chegue com antecedência ou ligue antes para saber se dá para segurar mesa.'
              ],
              [
                { b: 'Grupo grande:' },
                ' avise o bar. Juntar mesas no meio do primeiro tempo é difícil.'
              ],
              [
                { b: 'Horário fora do comum:' },
                ' jogo de manhã, de madrugada ou no meio da tarde de um dia útil? Confirme que o bar vai estar aberto.'
              ]
            ]
          }
        ]
      },
      {
        id: 'na-onside',
        num: '05',
        title: 'Como fazer isso na Onside',
        blocks: [
          {
            type: 'p',
            content:
              'Na Onside, a grade de jogos é cadastrada pelo próprio bar. Você busca pelo time, pelo campeonato ou pela data e vê só os bares que confirmaram aquela partida, com distância, preço médio e o que cada um oferece: telão, som do jogo ligado, canais fechados, área externa e outras características.'
          },
          {
            type: 'p',
            content: [
              'Achou o bar? Marque “Vou assistir aqui” nele. A conta de torcedor é grátis: ',
              { link: 'crie a sua', to: '/signup' },
              ' ou ',
              { link: 'veja como a Onside funciona', to: '/#como-funciona' },
              '.'
            ]
          }
        ]
      }
    ]
  }
}

const PARA_BARES: GuiaArticle = {
  slug: 'como-atrair-torcedores-para-o-seu-bar-em-dia-de-jogo',
  seoTitle: 'Como atrair torcedores para o seu bar em dia de jogo',
  description:
    'Grade divulgada com antecedência, infraestrutura clara e fotos reais: o que faz um torcedor escolher o seu bar para assistir ao jogo.',
  published: '2026-10-19',
  modified: '2026-10-19',
  closing: BAR_CLOSING,
  document: {
    kicker: 'Guia · Para bares',
    title: 'Como atrair torcedores para o seu bar em dia de jogo',
    updated: '19 de outubro de 2026',
    reading: '4 seções · ~4 min',
    intro: [
      'Dia de jogo pode ser o melhor dia da semana para um bar, ou uma casa vazia enquanto o vizinho lota. A diferença quase nunca está na cerveja: está em o torcedor saber, antes de sair de casa, que o seu bar vai passar o jogo dele e como vai ser a experiência.',
      'Estas são as práticas que ajudam o torcedor a escolher o seu bar.'
    ],
    company: [],
    other: {
      label: 'Como achar um bar que passa o jogo do seu time',
      to: '/guia/como-achar-bar-que-passa-o-jogo-do-seu-time',
      blurb: 'O mesmo assunto, do lado de quem está procurando.'
    },
    sections: [
      {
        id: 'grade',
        num: '01',
        title: 'Divulgue a grade com antecedência',
        blocks: [
          {
            type: 'p',
            content:
              'O torcedor decide onde vai assistir horas ou dias antes. Se a grade do seu bar só aparece num story no dia, ele já escolheu outro lugar. Publique os jogos da rodada assim que souber o que vai passar, com horário e tela.'
          },
          {
            type: 'p',
            content:
              'Seja específico: “passamos o jogo com som no telão” convence mais que “passamos todos os jogos”. E se não vai passar uma partida, não prometa. Torcedor que chega e não encontra o jogo não volta.'
          }
        ]
      },
      {
        id: 'infraestrutura',
        num: '02',
        title: 'Deixe claro o que o bar oferece',
        blocks: [
          {
            type: 'p',
            content:
              'Quem procura bar para ver jogo compara as mesmas coisas. Diga, sem rodeio, o que você tem:'
          },
          {
            type: 'ul',
            items: [
              'Quantas telas e se há telão ou projetor.',
              'Se o som da transmissão fica ligado.',
              'Quais canais fechados e serviços de transmissão o bar assina.',
              'Área externa ou coberta, acessibilidade, estacionamento, cozinha até tarde e formas de pagamento.'
            ]
          }
        ]
      },
      {
        id: 'fotos',
        num: '03',
        title: 'Mostre o bar como ele é em dia de jogo',
        blocks: [
          {
            type: 'p',
            content:
              'Foto de bar vazio de manhã não ajuda o torcedor a imaginar a noite do clássico. Use fotos reais do salão com as telas ligadas, de onde dá para ver o jogo. Uma foto honesta evita expectativa errada, e expectativa errada vira avaliação ruim.'
          }
        ]
      },
      {
        id: 'na-onside',
        num: '04',
        title: 'Como a Onside ajuda',
        blocks: [
          {
            type: 'p',
            content:
              'Na Onside, o bar cadastra a própria grade de jogos, as características e as fotos, e aparece para os torcedores que buscam aquela partida perto dali. O torcedor pode marcar “Vou assistir aqui”, e depois do jogo avaliar se voltaria.'
          },
          {
            type: 'p',
            content: [
              'O cadastro do bar começa com um teste grátis, sem cartão. ',
              { link: 'Cadastre seu bar', to: '/signup?role=pub' },
              ' ou ',
              { link: 'veja como a Onside funciona', to: '/#como-funciona' },
              '.'
            ]
          }
        ]
      }
    ]
  }
}

export const GUIA_ARTICLES: readonly GuiaArticle[] = [
  SAO_PAULO,
  SEU_TIME,
  PARA_BARES
]

export function findGuiaArticle(slug: string): GuiaArticle | undefined {
  return GUIA_ARTICLES.find((article) => article.slug === slug)
}
