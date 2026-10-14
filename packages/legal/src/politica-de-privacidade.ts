import type { LegalDocument } from './legal-types'

// Texto vindo do projeto "Onside landing page variation" no Claude Design
// (WEB-240). Conteúdo jurídico: não reescreva sem revisão do dono do produto.
export const POLITICA_DE_PRIVACIDADE: LegalDocument = {
  kicker: 'Legal · Política de Privacidade',
  title: 'Política de privacidade',
  updated: '10 de outubro de 2026',
  reading: '17 seções · ~18 min',
  intro: [
    'Privacidade não é página de rodapé para a gente. Esta Política explica, em português claro, quais dados a plataforma Onside coleta, por que coleta, com quem compartilha, por quanto tempo guarda e o que você pode exigir de nós a qualquer momento. Ela integra os nossos Termos de Uso e segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).',
    'O princípio que guia o documento inteiro: coletamos o mínimo necessário para a plataforma funcionar e para entendermos se ela está funcionando. Não vendemos dados, não gravamos a sua tela e não montamos perfil seu para publicidade de terceiros.',
    'Se sobrar dúvida depois de ler, o contato do nosso encarregado de dados está na última seção — e ele responde.'
  ],
  company: [
    'Onside Tecnologia da Informação Ltda.',
    'CNPJ 69.032.124/0001-55',
    'Pinheiros · São Paulo/SP'
  ],
  other: {
    label: 'Termos de Uso',
    to: '/termos',
    blurb: 'As regras da plataforma, para torcedores e estabelecimentos.'
  },
  sections: [
    {
      id: 's-1',
      num: '01',
      title: 'A quem esta Política se aplica?',
      blocks: [
        {
          type: 'p',
          content:
            'Esta Política vale para todas as pessoas cujos dados passam pela plataforma Onside — o site, o aplicativo e o painel do estabelecimento. Na prática, três perfis:'
        },
        {
          type: 'ul',
          items: [
            [
              {
                b: 'Torcedor:'
              },
              ' pessoa física que usa a Onside para descobrir onde assistir a um jogo. O uso é gratuito.'
            ],
            [
              {
                b: 'Estabelecimento Parceiro:'
              },
              ' bar, restaurante, casa noturna ou espaço similar que cadastra sua agenda de transmissões na plataforma.'
            ],
            [
              {
                b: 'Responsável Legal:'
              },
              ' o sócio, administrador ou preposto autorizado que cria e opera a conta do estabelecimento. Os dados dele são dados pessoais e recebem a mesma proteção.'
            ]
          ]
        },
        {
          type: 'p',
          content:
            'Visitantes que apenas navegam pelo site, sem criar conta, também estão cobertos: mesmo sem cadastro, coletamos dados técnicos de visita, e explicamos isso adiante.'
        }
      ]
    },
    {
      id: 's-2',
      num: '02',
      title: 'O que significam os termos usados aqui?',
      blocks: [
        {
          type: 'p',
          content:
            'Política de privacidade costuma ser escrita para advogado. Antes de continuar, os quatro termos que aparecem o tempo todo: Titular (você, pessoa física a quem os dados se referem), Controlador (quem decide o porquê e o como do tratamento — a Onside, na maior parte dos casos, e o estabelecimento, nos limites da seção 9.1), Operador (quem trata dados em nome do controlador, seguindo suas instruções — os fornecedores da seção 9.2) e Tratamento (qualquer operação com dado pessoal: coletar, usar, guardar, compartilhar ou eliminar).'
        }
      ]
    },
    {
      id: 's-3',
      num: '03',
      title: 'Quem controla os seus dados?',
      blocks: [
        {
          type: 'p',
          content:
            'A Onside é a controladora dos dados pessoais tratados na plataforma, nos termos da Política.'
        },
        {
          type: 'attention',
          label: 'Atenção',
          content:
            'Há uma exceção importante. Quando um estabelecimento parceiro recebe de nós os dados mínimos para entregar um benefício no balcão, ele passa a ser controlador do uso que fizer desses dados, e responde por esse uso — não nós. A seção sobre compartilhamento detalha os limites.'
        }
      ]
    },
    {
      id: 's-4',
      num: '04',
      title: 'Quais dados coletamos?',
      blocks: [
        {
          type: 'h3',
          text: 'Dados que você nos fornece',
          num: '4.1'
        },
        {
          type: 'p',
          content: [
            {
              b: 'Torcedor:'
            },
            ' nome ou apelido, e-mail, senha (guardada de forma cifrada, nunca em texto legível), cidade e — se quiser informar — times e esportes de interesse.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Estabelecimento:'
            },
            ' dados do negócio (nome, razão social, CNPJ, endereço, horário de funcionamento, estrutura, fotos, agenda de partidas) e dados do Responsável Legal (nome, CPF, e-mail e telefone).'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Conteúdo que você publica:'
            },
            ' avaliações, notas, comentários, correções de informação e check-ins.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Contato:'
            },
            ' o que você escrever para nós por e-mail ou pelos canais de suporte, incluindo anexos.'
          ]
        },
        {
          type: 'h3',
          text: 'Dados gerados pelo seu uso',
          num: '4.2'
        },
        {
          type: 'p',
          content:
            'São os dados de comportamento dentro do produto — buscas feitas, filtros escolhidos, bares abertos, check-ins, ações de intenção. A seção 5 lista exatamente o que medimos, evento por evento.'
        },
        {
          type: 'h3',
          text: 'Dados técnicos do seu acesso',
          num: '4.3'
        },
        {
          type: 'ul',
          items: [
            'Tipo de dispositivo, navegador, sistema operacional e idioma.',
            'Páginas e rotas acessadas, com data e hora.',
            'Origem do acesso — de onde você veio antes de chegar até nós.',
            'Endereço IP, nos registros de acesso que a lei nos obriga a guardar e nos logs da hospedagem.'
          ]
        },
        {
          type: 'attention',
          label: 'Atenção',
          content:
            'Na nossa ferramenta de análise de produto, a captura de endereço IP está desativada. O IP existe apenas nos registros de acesso obrigatórios e nos logs de infraestrutura, com acesso restrito.'
        },
        {
          type: 'h3',
          text: 'Localização',
          num: '4.4'
        },
        {
          type: 'p',
          content:
            'Usamos a sua localização aproximada para mostrar os bares perto de você. O acesso é opcional, pedido no momento em que a função é usada, e pode ser revogado a qualquer momento nas configurações do aparelho — sem ele, você informa a cidade ou o bairro manualmente e o resto da plataforma continua funcionando. Não rastreamos a sua localização em segundo plano e não guardamos histórico de deslocamento.'
        },
        {
          type: 'p',
          content:
            'A sua localização é usada para calcular distância e ordenar resultados. O mapa em si é servido pela nossa própria infraestrutura; apenas as buscas por endereço passam por um fornecedor externo de geocodificação, como explicamos na seção 9.'
        },
        {
          type: 'h3',
          text: 'O que não coletamos',
          num: '4.5'
        },
        {
          type: 'ul',
          items: [
            'Não pedimos CPF, RG ou qualquer documento do torcedor.',
            'Não coletamos dados sensíveis na acepção do art. 5º, II da LGPD — origem racial ou étnica, convicção religiosa, opinião política, filiação sindical, dado de saúde, vida sexual, dado genético ou biométrico. Time de futebol não é dado sensível, mas tratamos com o mesmo cuidado.',
            'Não gravamos a sua tela: a gravação de sessão (session replay) está desligada.',
            'Não guardamos dados de cartão. Quando houver pagamento de plano, ele é processado pelo provedor de pagamento, que recebe os dados diretamente de você.'
          ]
        }
      ]
    },
    {
      id: 's-5',
      num: '05',
      title: 'Como acompanhamos o uso do produto?',
      blocks: [
        {
          type: 'p',
          content:
            'Esta seção existe porque achamos que você tem o direito de saber exatamente o que é medido — e não apenas que “coletamos dados de uso”.'
        },
        {
          type: 'p',
          content:
            'Usamos uma ferramenta de análise de produto (PostHog) para entender como as pessoas usam a Onside e decidir o que construir e corrigir. O que medimos hoje:'
        },
        {
          type: 'h3',
          text: 'No site e na landing page',
          num: '5.1'
        },
        {
          type: 'ul',
          items: [
            'Cliques nos botões.',
            'Tráfego por rota e quais páginas são mais acessadas.',
            'Visitantes únicos por dia.',
            'Tipo de dispositivo das visitas.'
          ]
        },
        {
          type: 'h3',
          text: 'No cadastro',
          num: '5.2'
        },
        {
          type: 'ul',
          items: [
            'Se o cadastro é de torcedor ou de estabelecimento.',
            [
              {
                b: 'O funil completo:'
              },
              ' quem começou, em que etapa parou e quem concluiu o onboarding.'
            ],
            'Contas criadas, por tipo.',
            [
              {
                b: 'No estabelecimento:'
              },
              ' quem iniciou o cadastro e chegou até a página de planos.'
            ]
          ]
        },
        {
          type: 'h3',
          text: 'No uso da plataforma',
          num: '5.3'
        },
        {
          type: 'ul',
          items: [
            'Buscas realizadas e raio de busca escolhido.',
            'Quantos bares cada busca retornou, em média.',
            'Pessoas únicas que fizeram alguma busca.',
            'Aberturas da página de um bar, separando se vieram da busca ou do mapa.',
            'Ações de intenção sobre um bar, e quais delas funcionam melhor.',
            [
              {
                b: 'O “loop” de uso:'
              },
              ' a mesma pessoa que, no mesmo dia, buscou um jogo, abriu a página de um bar e fez uma ação de intenção.'
            ],
            'Partidas cadastradas pelos estabelecimentos.'
          ]
        },
        {
          type: 'h3',
          text: 'Na parte paga',
          num: '5.4'
        },
        {
          type: 'ul',
          items: [
            'Estabelecimentos que iniciaram o checkout.',
            'Cliques em upgrade de plano.',
            'Estabelecimentos que atingiram o limite de eventos do seu plano.'
          ]
        },
        {
          type: 'h3',
          text: 'Quem vê isso, e como',
          num: '5.5'
        },
        {
          type: 'p',
          content:
            'A equipe fundadora acompanha esses números em painéis internos. Para quem não tem conta, os dados são de visita e não identificam você.'
        },
        {
          type: 'attention',
          label: 'Atenção',
          content:
            'Para quem está logado, o comportamento pode ser visto de forma identificada — ou seja, é possível saber que determinada conta fez determinada busca. Usamos isso para entender problemas reais de uso e para prevenir fraude e abuso, e você pode se opor a esse tratamento pelo canal de privacidade.'
        },
        {
          type: 'p',
          content:
            'Esse tratamento tem como base legal o legítimo interesse (art. 7º, IX, da LGPD). Antes de tratar dados de uso de forma identificada, avaliamos, em relatório de impacto à proteção de dados pessoais mantido internamente e atualizado periodicamente, se a finalidade é legítima e específica, se os dados usados são os mínimos necessários e se o tratamento é proporcional às suas expectativas legítimas como usuário do produto, nos termos do art. 10 da LGPD. Esse relatório está disponível à Autoridade Nacional de Proteção de Dados mediante requisição e a você, mediante pedido justificado ao nosso encarregado.'
        },
        {
          type: 'p',
          content:
            'Esse acompanhamento é de uso, não de conteúdo privado: os painéis não exibem a sua senha nem qualquer dado sensível, e não existe gravação de tela.'
        }
      ]
    },
    {
      id: 's-6',
      num: '06',
      title: 'O que outras pessoas veem sobre você?',
      blocks: [
        {
          type: 'p',
          content:
            'A Onside tem uma parte pública. Antes de publicar qualquer coisa, vale saber o que fica visível:'
        },
        {
          type: 'table',
          head: ['O que', 'Quem vê', 'Você controla?'],
          rows: [
            [
              'Avaliações e notas que você publica',
              'Qualquer pessoa na plataforma, junto do seu nome ou apelido',
              'Sim — pode editar ou apagar quando quiser'
            ],
            [
              'Check-in de intenção em uma partida',
              'Outros torcedores, como indicador de movimento no bar',
              'Sim — pode desfazer o check-in ou torná-lo privado'
            ],
            [
              'Check-in de presença',
              'O estabelecimento, para validar benefício',
              'Sim — é você que faz o check-in'
            ],
            [
              'Nome ou apelido e foto de perfil',
              'Outros usuários, junto do seu conteúdo',
              'Sim — pode alterar nas configurações'
            ],
            ['E-mail, telefone e cidade', 'Ninguém além de nós', '—'],
            ['Buscas, filtros e histórico', 'Ninguém além de nós', '—']
          ]
        },
        {
          type: 'attention',
          label: 'Atenção',
          content:
            'Avaliação é conteúdo público e permanente por natureza. Se você excluir a conta, as avaliações já publicadas podem ser mantidas de forma anonimizada, desvinculadas do seu nome, porque integram o histórico coletivo do estabelecimento. Essa retenção anonimizada tem base no legítimo interesse da comunidade de usuários em uma base de avaliações íntegra e no direito à informação do consumidor (art. 6º, III, do Código de Defesa do Consumidor), e não impede o exercício do seu direito de eliminação previsto no art. 18, VI, da LGPD quanto aos dados que a identificam. Se preferir apagá-las de vez, peça antes de excluir a conta.'
        },
        {
          type: 'p',
          content:
            'Use o bom senso no que você escreve: não publique dados pessoais seus ou de terceiros — telefone, endereço, documento — dentro de uma avaliação.'
        }
      ]
    },
    {
      id: 's-7',
      num: '07',
      title: 'Por que coletamos e com que base legal?',
      blocks: [
        {
          type: 'p',
          content:
            'A LGPD exige uma base legal para cada finalidade. Não basta querer o dado; é preciso ter motivo previsto em lei.'
        },
        {
          type: 'p',
          content: 'As nossas:'
        },
        {
          type: 'table',
          head: ['Para quê', 'Quais dados', 'Base legal (LGPD)'],
          rows: [
            [
              'Criar e manter sua conta e operar a plataforma',
              'Cadastro, conteúdo publicado',
              'Execução de contrato (art. 7º, V)'
            ],
            [
              'Mostrar bares perto de você',
              'Localização aproximada',
              'Consentimento (art. 7º, I)'
            ],
            [
              'Validar e entregar benefício no estabelecimento',
              'Check-in de presença, identificação mínima',
              'Execução de contrato (art. 7º, V)'
            ],
            [
              'Entender o uso e melhorar o produto',
              'Eventos de uso e dados técnicos',
              'Legítimo interesse (art. 7º, IX)'
            ],
            [
              'Segurança, prevenção a fraude e abuso',
              'Eventos, registros de acesso',
              'Legítimo interesse (art. 7º, IX)'
            ],
            [
              'Guardar registros de acesso à aplicação',
              'IP, data e hora',
              'Obrigação legal (art. 7º, II)'
            ],
            [
              'Cobrar planos e emitir nota fiscal',
              'Dados do estabelecimento e do Responsável Legal',
              'Execução de contrato e obrigação legal'
            ],
            [
              'Enviar novidades e comunicações de marketing',
              'E-mail',
              'Consentimento (art. 7º, I)'
            ],
            [
              'Defender nossos direitos em processo',
              'O estritamente necessário',
              'Exercício regular de direitos (art. 7º, VI)'
            ]
          ]
        },
        {
          type: 'attention',
          label: 'Atenção',
          content:
            'Comunicações operacionais — confirmação de cadastro, aviso de cobrança, mudança nos Termos, incidente de segurança — são inerentes ao serviço e não dependem de consentimento; elas continuam enquanto a sua conta existir. Comunicações de marketing são opcionais e você sai delas a qualquer momento, pelo link de descadastro do próprio e-mail.'
        },
        {
          type: 'p',
          content:
            'Quando a base é o legítimo interesse, avaliamos se a finalidade é concreta, se os dados são os mínimos necessários e se o tratamento é o que você esperaria de um produto como este, com registro formal dessa avaliação conforme descrito na seção 5.5. Você pode pedir explicação ou se opor — e, nesse caso, analisamos o pedido caso a caso.'
        }
      ]
    },
    {
      id: 's-8',
      num: '08',
      title: 'Como usamos cookies e tecnologias semelhantes?',
      blocks: [
        {
          type: 'p',
          content:
            'Cookies são arquivos pequenos guardados no seu navegador. Usamos um conjunto enxuto deles, além do armazenamento local:'
        },
        {
          type: 'p',
          content: [
            {
              b: 'Essenciais:'
            },
            ' mantêm você logado, lembram preferências básicas e protegem contra abuso. Sem eles a plataforma não funciona, e por isso não dependem de consentimento.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'De análise:'
            },
            ' identificam o seu navegador de forma pseudonimizada para que as métricas da seção 5 não contem a mesma pessoa várias vezes. Dependem do seu consentimento e podem ser recusados.'
          ]
        },
        {
          type: 'p',
          content:
            'Não usamos cookies de publicidade, nem pixels de redes sociais para remarketing, nem tecnologia de terceiros para te seguir em outros sites. Você pode recusar os cookies de análise no aviso exibido no primeiro acesso, mudar a escolha depois pelo mesmo aviso, e bloquear ou apagar cookies nas configurações do seu navegador.'
        }
      ]
    },
    {
      id: 's-9',
      num: '09',
      title: 'Com quem compartilhamos os seus dados?',
      blocks: [
        {
          type: 'h3',
          text: 'Com os estabelecimentos parceiros',
          num: '9.1'
        },
        {
          type: 'p',
          content:
            'O estabelecimento vê métricas agregadas do próprio perfil — visualizações, check-ins, avaliações. Quando houver benefício ativo, ele recebe o mínimo necessário para identificar no balcão quem fez check-in de presença e validar a entrega da cortesia.'
        },
        {
          type: 'attention',
          label: 'Atenção',
          content:
            'Esses dados só podem ser usados para operar a parceria e atender você no local. O estabelecimento não pode reaproveitá-los para marketing próprio, lista de e-mail ou WhatsApp, nem repassá-los a terceiros, sem base legal e consentimento obtidos por ele. Se isso acontecer com você, avise-nos — é motivo de suspensão da parceria.'
        },
        {
          type: 'h3',
          text: 'Com operadores que nos prestam serviço',
          num: '9.2'
        },
        {
          type: 'p',
          content:
            'Estes fornecedores tratam dados em nosso nome, seguindo nossas instruções e sob contrato de proteção de dados. Eles têm acesso restrito ao necessário e não podem usar os dados para finalidade própria:'
        },
        {
          type: 'table',
          head: ['Fornecedor', 'Para quê', 'Onde ficam os dados'],
          rows: [
            [
              'Neon (grupo Databricks)',
              'Banco de dados da plataforma',
              'Estados Unidos e/ou União Europeia, conforme a região do projeto'
            ],
            [
              'PostHog',
              'Análise de uso do produto',
              'Frankfurt, Alemanha (nuvem europeia)'
            ],
            [
              'Cloudflare',
              'Hospedagem do site e do app, armazenamento de fotos, proteção de formulários contra robôs e contagem de acessos sem cookies',
              'Estados Unidos, com rede de distribuição global'
            ],
            [
              'Resend',
              'Envio dos e-mails da plataforma: confirmação de cadastro e redefinição de senha',
              'Estados Unidos, com envio a partir de São Paulo (Brasil)'
            ],
            [
              'LocationIQ (Unwired Labs)',
              'Busca de endereços e conversão entre endereço e coordenadas',
              'Estados Unidos ou União Europeia, conforme o servidor utilizado'
            ]
          ]
        },
        {
          type: 'h3',
          text: 'Uma nota sobre o mapa',
          num: '9.3'
        },
        {
          type: 'p',
          content:
            'O mapa da Onside é construído sobre dados abertos do OpenStreetMap, servidos no formato Protomaps a partir da nossa própria infraestrutura. Na prática: navegar, arrastar e dar zoom no mapa não envia nada para terceiros — os blocos de imagem do mapa saem dos nossos servidores, como qualquer outra parte do site.'
        },
        {
          type: 'p',
          content:
            'A exceção é a busca por endereço. Quando você digita um endereço ou pede os bares perto de você, essa consulta é enviada ao LocationIQ, que converte texto em coordenadas e vice-versa. É o único momento em que uma informação de localização sua toca um fornecedor externo, e ele recebe apenas a consulta necessária para responder.'
        },
        {
          type: 'attention',
          label: 'Atenção',
          content:
            'Essa escolha é deliberada. Preferimos uma base de mapas aberta, hospedada por nós, a um provedor de mapas ligado a uma grande plataforma de publicidade — porque assim a sua movimentação pelo mapa não vira insumo de perfil publicitário de ninguém.'
        },
        {
          type: 'h3',
          text: 'Sobre envio de e-mails',
          num: '9.4'
        },
        {
          type: 'p',
          content:
            'Os e-mails da plataforma — confirmação de cadastro e redefinição de senha — são enviados pela Resend, listada na tabela acima. Se trocarmos de fornecedor, a tabela será atualizada com o nome e o local de tratamento, e a mudança será comunicada conforme a seção sobre alterações.'
        },
        {
          type: 'h3',
          text: 'Com autoridades públicas',
          num: '9.5'
        },
        {
          type: 'p',
          content:
            'Podemos compartilhar dados com autoridades policiais, judiciais e administrativas competentes quando houver ordem judicial, requisição legal ou necessidade de cooperar com investigação, nos limites da lei. Sempre que pudermos informar você sobre a requisição, informaremos.'
        },
        {
          type: 'h3',
          text: 'Em reorganização societária',
          num: '9.6'
        },
        {
          type: 'p',
          content:
            'Em fusão, aquisição, incorporação ou venda de ativos, os dados podem ser transferidos para a empresa sucessora, mantidas as condições desta Política, e você será avisado.'
        },
        {
          type: 'h3',
          text: 'Dados agregados',
          num: '9.7'
        },
        {
          type: 'p',
          content:
            'Podemos publicar ou compartilhar números que não identificam ninguém — por exemplo, quantos bares transmitem determinado campeonato em uma cidade. Dado agregado e anonimizado não é dado pessoal.'
        },
        {
          type: 'p',
          content:
            'Não vendemos seus dados pessoais e não os cedemos a terceiros para que façam publicidade própria. Isso não é uma política que podemos mudar em silêncio: se um dia mudar, avisaremos com antecedência e pediremos consentimento.'
        }
      ]
    },
    {
      id: 's-10',
      num: '10',
      title: 'Transferimos dados para outros países?',
      blocks: [
        {
          type: 'p',
          content:
            'Sim, e a tabela da seção anterior mostra onde. Parte da nossa infraestrutura de nuvem fica fora do Brasil, o que significa que seus dados podem ser tratados nos Estados Unidos e na União Europeia.'
        },
        {
          type: 'p',
          content:
            'Essas transferências acontecem nas hipóteses do art. 33 da LGPD — principalmente para execução do contrato com você — e são amparadas por cláusulas-padrão contratuais de proteção de dados pessoais aprovadas pela Autoridade Nacional de Proteção de Dados (Resolução CD/ANPD nº 19/2024), firmadas com cada um dos fornecedores listados na seção 9.2, que exigem padrão de proteção compatível com a legislação brasileira.'
        },
        {
          type: 'p',
          content:
            'Mantemos essa documentação organizada e disponível para consulta pelo canal de privacidade.'
        },
        {
          type: 'p',
          content:
            'Sempre que existe a opção, escolhemos a região com regime de proteção mais próximo do brasileiro. É o caso da nossa ferramenta de analytics, que roda na nuvem europeia em vez da americana, com captura de IP desativada.'
        }
      ]
    },
    {
      id: 's-11',
      num: '11',
      title: 'Por quanto tempo guardamos os dados?',
      blocks: [
        {
          type: 'p',
          content:
            'Guardamos cada dado pelo tempo necessário à finalidade que justificou a coleta, respeitando os prazos legais:'
        },
        {
          type: 'table',
          head: ['Dado', 'Prazo'],
          rows: [
            [
              'Dados de cadastro e conteúdo publicado',
              'Enquanto a conta existir'
            ],
            ['Eventos de uso do produto', '12 meses'],
            [
              'Registros de acesso à aplicação (IP, data e hora)',
              '6 meses, por obrigação legal (art. 15 do Marco Civil da Internet)'
            ],
            [
              'Documentos fiscais e contábeis de planos pagos',
              '5 anos, por obrigação legal'
            ],
            [
              'Dados necessários à defesa em processo',
              'Até o encerramento do processo e dos prazos prescricionais'
            ]
          ],
          columnWeights: [1.2, 1.0]
        },
        {
          type: 'p',
          content:
            'Ao excluir sua conta, apagamos perfil, preferências, histórico de check-ins e favoritos. Encerrados os prazos e as finalidades acima, os dados são eliminados ou anonimizados de forma irreversível.'
        },
        {
          type: 'attention',
          label: 'Atenção',
          content:
            'Mesmo depois da exclusão, alguns registros permanecem pelo tempo que a lei determina — é o caso dos registros de acesso e dos documentos fiscais listados acima. Não é uma escolha nossa; é obrigação legal, e ela existe também para proteger você.'
        }
      ]
    },
    {
      id: 's-12',
      num: '12',
      title: 'Como protegemos os seus dados?',
      blocks: [
        {
          type: 'ul',
          items: [
            'Tráfego cifrado (HTTPS) entre o seu aparelho e os nossos servidores.',
            'Senhas guardadas com função de hash, nunca em texto legível — nem nós conseguimos ler a sua senha.',
            'Acesso à base de produção restrito às pessoas que precisam dele para trabalhar, com autenticação individual.',
            'Contratos de proteção de dados com todos os fornecedores que tratam dados em nosso nome.',
            'Coleta mínima como princípio de segurança: quanto menos guardamos, menor o estrago possível.'
          ]
        },
        {
          type: 'p',
          content:
            'Nenhum sistema é totalmente imune, e seria desonesto prometer o contrário. Se houver incidente de segurança com risco relevante aos seus direitos, comunicaremos você e a Autoridade Nacional de Proteção de Dados em prazo razoável, informando o que aconteceu, quais dados foram afetados, quais os riscos e o que estamos fazendo, conforme o art. 48 da LGPD.'
        },
        {
          type: 'p',
          content:
            'Você também tem um papel nisso: use senha única e forte, não compartilhe seu acesso e avise-nos se suspeitar de uso indevido da sua conta.'
        }
      ]
    },
    {
      id: 's-13',
      num: '13',
      title: 'Quais são os seus direitos e como exercê-los?',
      blocks: [
        {
          type: 'p',
          content: 'A LGPD garante a você, como titular, o direito de:'
        },
        {
          type: 'ul',
          items: [
            'confirmar que tratamos seus dados e acessar esses dados;',
            'corrigir dados incompletos, inexatos ou desatualizados;',
            'pedir anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;',
            'pedir a portabilidade dos seus dados a outro fornecedor de serviço;',
            'pedir a eliminação dos dados tratados com base no seu consentimento;',
            'saber com quem compartilhamos seus dados;',
            'ser informado sobre a possibilidade de não consentir e as consequências disso;',
            'revogar o consentimento a qualquer momento;',
            'opor-se a tratamento feito com base no legítimo interesse.'
          ]
        },
        {
          type: 'h3',
          text: 'Como pedir'
        },
        {
          type: 'p',
          content: [
            'Escreva para ',
            {
              email: 'contato@onside.sh'
            },
            '. Para que a gente consiga analisar rápido, inclua:'
          ]
        },
        {
          type: 'ul',
          items: [
            'o e-mail cadastrado na sua conta Onside;',
            'se você é torcedor ou estabelecimento (e, neste caso, o nome do bar);',
            'qual direito você quer exercer, de forma objetiva.'
          ]
        },
        {
          type: 'p',
          content:
            'Respondemos em até 15 dias. Podemos pedir informações adicionais para confirmar que é você mesmo — é medida de segurança, não barreira. Se não pudermos atender a algum pedido, explicaremos o motivo legal, e você pode recorrer à ANPD.'
        }
      ]
    },
    {
      id: 's-14',
      num: '14',
      title: 'Existem decisões automatizadas?',
      blocks: [
        {
          type: 'p',
          content:
            'Sim, uma. A ordem em que os estabelecimentos aparecem para você é definida por critérios automatizados de relevância — proximidade, aderência ao jogo pesquisado, avaliações e atualização da agenda —, combinados com posições de destaque pago, sempre identificadas como tal.'
        },
        {
          type: 'p',
          content:
            'Essas decisões afetam o que você vê primeiro, mas não produzem efeitos jurídicos sobre você, não definem acesso a crédito, emprego ou serviço, e não traçam perfil de personalidade, comportamento de consumo fora da plataforma ou características pessoais. Ainda assim, você pode pedir explicação sobre os critérios e solicitar revisão, conforme o art. 20 da LGPD, pelo canal de privacidade.'
        }
      ]
    },
    {
      id: 's-15',
      num: '15',
      title: 'E quanto a menores de 18 anos?',
      blocks: [
        {
          type: 'p',
          content:
            'A plataforma é destinada exclusivamente a maiores de 18 anos, porque indica estabelecimentos que em sua maioria comercializam bebidas alcoólicas. Não coletamos intencionalmente dados de crianças e adolescentes, e não direcionamos publicidade a esse público.'
        },
        {
          type: 'p',
          content: [
            'Se identificarmos conta criada por menor de 18 anos, encerraremos a conta e eliminaremos os dados. Se você é responsável por um adolescente e acredita que ele criou uma conta, escreva para ',
            {
              email: 'contato@onside.sh'
            },
            ' e tratamos com prioridade.'
          ]
        }
      ]
    },
    {
      id: 's-16',
      num: '16',
      title: 'Como comunicamos mudanças nesta Política?',
      blocks: [
        {
          type: 'p',
          content:
            'Podemos atualizar esta Política conforme a plataforma evolui ou a legislação muda. A versão em vigor é sempre a mais recente, e a data da última atualização fica no topo desta página.'
        },
        {
          type: 'p',
          content:
            'Mudanças relevantes — especialmente novas finalidades, novos compartilhamentos ou mudança de base legal — serão comunicadas dentro do app ou por e-mail, com antecedência razoável. Quando a lei exigir, pediremos novo consentimento em vez de presumir o antigo. Versões anteriores ficam disponíveis mediante pedido pelo canal de privacidade.'
        }
      ]
    },
    {
      id: 's-17',
      num: '17',
      title: 'Como falar com a gente e com a ANPD?',
      blocks: [
        {
          type: 'p',
          content: [
            'Para qualquer assunto de privacidade — dúvidas, pedidos de titular, denúncias —, o canal é ',
            {
              email: 'contato@onside.sh'
            },
            ', atendido pelo nosso encarregado de dados. Para assuntos gerais da plataforma, use ',
            {
              email: 'contato@onside.sh'
            },
            '.'
          ]
        },
        {
          type: 'p',
          content: [
            'Se você não ficar satisfeito com a nossa resposta, tem o direito de apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD), pelos canais oficiais em ',
            {
              mark: 'gov.br/anpd'
            },
            '. Preferimos resolver com você diretamente, mas esse direito é seu e não depende de falar com a gente antes.'
          ]
        }
      ]
    }
  ]
}
