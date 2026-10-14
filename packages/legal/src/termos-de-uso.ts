import type { LegalDocument } from './legal-types'

// Texto vindo do projeto "Onside landing page variation" no Claude Design
// (WEB-240). Conteúdo jurídico: não reescreva sem revisão do dono do produto.
export const TERMOS_DE_USO: LegalDocument = {
  kicker: 'Legal · Termos de Uso',
  title: 'Termos de uso',
  updated: '10 de outubro de 2026',
  reading: '19 seções · ~26 min',
  intro: [
    'Estes Termos de Uso (“Termos”) regulam o acesso e o uso da plataforma Onside (“Onside”, “plataforma”, “nós”), operada por Onside Tecnologia da Informação Ltda., inscrita no CNPJ sob o nº 69.032.124/0001-55, com sede na Rua Cláudio Soares, 72, sala 1418, Pinheiros, São Paulo/SP, CEP 05422-030.',
    'A Onside é uma plataforma de descoberta: mostramos quais bares e estabelecimentos vão transmitir quais jogos, onde e a que horas, para que o torcedor escolha onde assistir. A plataforma também permite avaliar os locais e marcar presença em uma partida.',
    'Ao criar uma conta ou usar a plataforma, você declara que leu, entendeu e concorda com estes Termos e com a nossa Política de Privacidade. Se não concordar com algum ponto, não utilize a plataforma.',
    'Estes Termos valem para os dois lados da plataforma. Algumas seções são específicas de cada perfil e estão sinalizadas.'
  ],
  company: [
    'Onside Tecnologia da Informação Ltda.',
    'CNPJ 69.032.124/0001-55',
    'Pinheiros · São Paulo/SP'
  ],
  other: {
    label: 'Política de Privacidade',
    to: '/privacidade',
    blurb: 'O que coletamos, por quê e por quanto tempo — em português claro.'
  },
  sections: [
    {
      id: 's-0',
      num: '00',
      title: 'Definições',
      blocks: [
        {
          type: 'ul',
          items: [
            [
              {
                b: 'Torcedor:'
              },
              ' pessoa física que usa a plataforma para encontrar onde assistir a um jogo. O uso é gratuito.'
            ],
            [
              {
                b: 'Estabelecimento Parceiro:'
              },
              ' bar, restaurante, casa noturna ou espaço similar que cadastra sua agenda de transmissões na plataforma, com ou sem plano pago.'
            ],
            [
              {
                b: 'Conteúdo do Usuário:'
              },
              ' avaliações, notas, comentários, correções de informação e check-ins publicados por você.'
            ],
            [
              {
                b: 'Check-in de intenção:'
              },
              ' sinalização de que você pretende ir a um estabelecimento assistir a determinada partida. Serve para o bar se preparar e para outros torcedores verem o movimento.'
            ],
            [
              {
                b: 'Check-in de presença:'
              },
              ' confirmação, feita no local e durante a partida, de que você está no estabelecimento. É esse check-in — e só ele — que libera benefícios e habilita você a avaliar o lugar.'
            ]
          ]
        }
      ]
    },
    {
      id: 's-1',
      num: '01',
      title: 'Quem pode usar',
      blocks: [
        {
          type: 'p',
          content:
            'A Onside indica estabelecimentos que, em sua maioria, comercializam bebidas alcoólicas. Por isso, o uso da plataforma é restrito a maiores de 18 anos.'
        },
        {
          type: 'p',
          content: 'Para criar uma conta de Torcedor, você precisa:'
        },
        {
          type: 'ul',
          items: [
            'ter 18 anos completos ou mais;',
            'fornecer informações verdadeiras, exatas e atualizadas no cadastro;',
            'usar um endereço de e-mail ou número de telefone que pertença efetivamente a você.'
          ]
        },
        {
          type: 'p',
          content:
            'Não permitimos contas de menores de 18 anos. Se identificarmos uma conta criada em desacordo com esta regra, ela poderá ser encerrada e os dados eliminados. Se você é responsável por um adolescente e quer solicitar a exclusão de uma conta, escreva para o e-mail de contato no fim desta página.'
        },
        {
          type: 'p',
          content:
            'Nada nestes Termos ou na plataforma constitui incentivo ao consumo de bebida alcoólica. Vender ou fornecer bebida alcoólica a menor de 18 anos é crime (art. 243 do Estatuto da Criança e do Adolescente, Lei nº 8.069/1990), e a verificação de idade na porta e no balcão é dever exclusivo do estabelecimento.'
        }
      ]
    },
    {
      id: 's-2',
      num: '02',
      title: 'O que a Onside é — e o que ela não é',
      blocks: [
        {
          type: 'p',
          content:
            'A Onside reúne, organiza e exibe informações sobre partidas e sobre quais estabelecimentos pretendem transmiti-las. Essas informações vêm de três fontes: (i) do próprio Estabelecimento Parceiro, que cadastra e atualiza sua agenda; (ii) de fontes públicas de programação esportiva; e (iii) de contribuições e correções enviadas pela comunidade de usuários.'
        },
        {
          type: 'p',
          content: 'Deixando explícito, a Onside:'
        },
        {
          type: 'ul',
          items: [
            'não é um bar, restaurante ou casa noturna — não vendemos, preparamos nem servimos comida e bebida, e não temos controle sobre preço, cardápio, fila, lotação, reserva, atendimento, som, tamanho de telão ou qualquer outra condição do local;',
            'não transmite jogos e não detém direitos de transmissão. A responsabilidade por exibir a partida de forma regular — incluindo pacotes comerciais, licenças e autorizações dos detentores dos direitos — é exclusiva do estabelecimento;',
            'não é parte da relação entre você e o estabelecimento. O consumo no local é um contrato direto entre vocês dois, com as garantias e responsabilidades que a lei atribui a quem fornece o produto ou serviço;',
            'não garante que a transmissão vai acontecer. A grade muda, o jogo troca de horário ou de emissora, o pacote do bar cai, o equipamento falha, o local lota. Confirme com o estabelecimento antes de se deslocar;',
            'não é agência de reservas e não assegura mesa, lugar ou entrada, ainda que você tenha feito check-in na plataforma.'
          ]
        },
        {
          type: 'p',
          content:
            'Trabalhamos para manter as informações corretas e atualizadas, mas não conseguimos garantir exatidão em tempo real. Se você encontrar uma informação errada, avise pelo próprio app — isso melhora a plataforma para todo mundo.'
        }
      ]
    },
    {
      id: 's-3',
      num: '03',
      title: 'Sua conta',
      blocks: [
        {
          type: 'p',
          content:
            'Cada pessoa deve ter apenas uma conta, de uso pessoal e intransferível. Não compartilhe seu login nem use a conta de outra pessoa.'
        },
        {
          type: 'p',
          content:
            'Você é responsável por manter suas credenciais em sigilo e por toda atividade realizada na sua conta. Se suspeitar de acesso indevido, troque a senha e avise-nos.'
        },
        {
          type: 'p',
          content: [
            'Você pode encerrar sua conta a qualquer momento, sem custo, em Configurações → Excluir minha conta ou escrevendo para ',
            {
              email: 'contato@onside.sh'
            },
            '.'
          ]
        },
        {
          type: 'p',
          content:
            'A exclusão apaga seu perfil, suas preferências, seu histórico de check-ins e seus favoritos. As avaliações que você já publicou podem ser mantidas de forma anonimizada — desvinculadas do seu nome e do seu perfil —, porque integram o histórico coletivo de um estabelecimento e sua manutenção anonimizada atende ao legítimo interesse da comunidade de usuários em uma base de avaliações íntegra e ao direito à informação do consumidor (art. 6º, III, do Código de Defesa do Consumidor); se preferir removê-las também, é só pedir antes de excluir a conta ou escrever para o nosso contato.'
        },
        {
          type: 'p',
          content:
            'Alguns registros permanecem conosco mesmo após a exclusão, pelo tempo e nas hipóteses que a lei determina ou autoriza: os registros de acesso à aplicação, que somos obrigados a guardar por 6 meses (art. 15 do Marco Civil da Internet); documentos fiscais e contábeis relativos a pagamentos; e dados necessários ao exercício regular de direitos em processo judicial, administrativo ou arbitral, ou à prevenção de fraude. Findos esses prazos e finalidades, os dados são eliminados.'
        }
      ]
    },
    {
      id: 's-4',
      num: '04',
      title: 'Localização e notificações',
      blocks: [
        {
          type: 'p',
          content:
            'A plataforma funciona melhor com acesso à sua localização aproximada, porque é assim que mostramos os estabelecimentos perto de você. Esse acesso é opcional e pode ser concedido ou revogado a qualquer momento nas configurações do seu aparelho — sem ele, algumas funções ficam limitadas e você precisará informar o bairro ou a cidade manualmente.'
        },
        {
          type: 'p',
          content:
            'Também podemos enviar notificações sobre jogos, estabelecimentos que você segue e novidades da plataforma.'
        },
        {
          type: 'p',
          content:
            'Você escolhe quais receber em Configurações ou no próprio sistema operacional. O que coletamos, por quanto tempo guardamos e como você se opõe está detalhado na Política de Privacidade.'
        }
      ]
    },
    {
      id: 's-5',
      num: '05',
      title: 'Benefícios oferecidos pelos estabelecimentos',
      blocks: [
        {
          type: 'p',
          content:
            'Alguns estabelecimentos oferecem uma vantagem ao torcedor que chega até eles pela Onside — uma bebida, um prato, um desconto ou outra cortesia. Quando existe, o benefício aparece de forma clara na página do estabelecimento, com as condições e a validade.'
        },
        {
          type: 'p',
          content:
            'O benefício é oferecido, definido e custeado exclusivamente pelo estabelecimento, não pela Onside. A Onside atua apenas como veiculadora da oferta de terceiro, divulgando-a nos termos em que o Estabelecimento Parceiro a cadastrou, e não é fornecedora do benefício nem parte na relação de consumo dela decorrente. A eventual vinculação do estabelecimento à oferta anunciada — de modo que, cumprida a condição, o benefício seja devido — decorre da legislação consumerista aplicável à relação entre o torcedor e o estabelecimento, à qual a Onside é estranha.'
        },
        {
          type: 'h3',
          text: 'Como funciona'
        },
        {
          type: 'ul',
          items: [
            'O benefício é liberado pelo check-in de presença — feito no local, durante a partida anunciada — e é apresentado no balcão pelo próprio app. Check-in de intenção, sozinho, não dá direito ao benefício.',
            'O benefício não reserva nem garante mesa, lugar ou entrada: se o estabelecimento estiver lotado ou fechado, não há benefício a entregar.',
            'Vale um benefício por torcedor, por partida, salvo se a oferta disser expressamente o contrário.',
            'O benefício é pessoal e intransferível, não é cumulativo com outras promoções do estabelecimento salvo indicação em contrário, e não pode ser convertido em dinheiro nem trocado por outro item.',
            'O estabelecimento pode alterar ou encerrar a oferta, mas a mudança só vale para check-ins feitos depois da atualização — quem já fez o check-in sob a oferta antiga tem direito a ela.',
            'O consumo de qualquer outro item no local é uma compra comum entre você e o estabelecimento, com preço e condições dele.'
          ]
        },
        {
          type: 'h3',
          text: 'Bebida alcoólica como benefício'
        },
        {
          type: 'p',
          content:
            'Quando o benefício for uma bebida alcoólica, a entrega fica condicionada à conferência de idade no local e ao dever legal do estabelecimento de não servir a quem seja menor de 18 anos ou esteja visivelmente embriagado. A recusa nessas hipóteses é legítima e não gera direito a compensação. Sempre que possível, orientamos os estabelecimentos a oferecer alternativa não alcoólica de valor equivalente.'
        },
        {
          type: 'h3',
          text: 'Se o benefício não for honrado'
        },
        {
          type: 'p',
          content: [
            'Se o estabelecimento se recusar a entregar um benefício anunciado e você cumpriu as condições, avise-nos pelo app ou por ',
            {
              email: 'contato@onside.sh'
            },
            '. Apuramos o caso e podemos remover a oferta, retirar o selo de benefício, suspender ou encerrar a parceria. A relação de consumo, contudo, é entre você e o estabelecimento — é a ele que cabe resolver o caso concreto (entrega, desconto, devolução), inclusive perante o ',
            {
              mark: 'consumidor.gov.br'
            },
            ' ou o Procon de sua cidade. A atuação da Onside nesta apuração tem natureza de curadoria da qualidade da plataforma, e não configura assunção de responsabilidade pela oferta de terceiro.'
          ]
        },
        {
          type: 'p',
          content:
            'É vedado ao torcedor fazer check-in sem estar no local, usar contas de terceiros ou qualquer artifício para obter o benefício indevidamente. Check-in fraudulento pode levar à perda do acesso a benefícios e ao encerramento da conta.'
        }
      ]
    },
    {
      id: 's-6',
      num: '06',
      title: 'Avaliações, notas e check-ins',
      blocks: [
        {
          type: 'p',
          content:
            'Você é responsável pelo conteúdo que publica na plataforma. Ao avaliar um estabelecimento ou fazer check-in, você concorda em:'
        },
        {
          type: 'ul',
          items: [
            'avaliar apenas lugares em que você realmente esteve, com base na sua experiência real — a avaliação é habilitada pelo check-in de presença;',
            'não publicar avaliação falsa, encomendada, paga, feita por concorrente ou criada para prejudicar ou inflar a reputação de alguém;',
            'não usar a avaliação como instrumento de pressão ou chantagem para obter desconto, cortesia ou vantagem;',
            'não publicar conteúdo ofensivo, discriminatório, difamatório, que exponha dados pessoais de terceiros ou que impute crime sem qualquer base;',
            'não fazer check-in em nome de outra pessoa, não registrar presença sem estar no local e não automatizar check-ins.'
          ]
        },
        {
          type: 'h3',
          text: 'Moderação'
        },
        {
          type: 'p',
          content:
            'A Onside não edita o mérito das avaliações e não remove uma avaliação apenas porque ela é negativa ou porque o estabelecimento pediu. O regime de responsabilidade por conteúdo publicado por usuários segue a legislação aplicável e a interpretação vinculante do Supremo Tribunal Federal (Temas 987 e 533 de repercussão geral), que estabelece regimes diferenciados conforme a natureza do conteúdo: (i) para ofensas à honra, a remoção pode ser exigida judicialmente, e a Onside responde apenas se descumprir ordem judicial nesse sentido; (ii) para os demais atos ilícitos, a Onside atua mediante notificação, judicial ou extrajudicial, fundamentada e específica; (iii) para conteúdo manifestamente ilícito e grave (nos termos da legislação e da orientação do STF), a Onside atua de forma proativa e imediata, independentemente de notificação prévia. Sempre que possível e razoável, avisaremos antes de remover ou ocultar conteúdo, e você pode contestar a decisão pelo e-mail de contato. O Estabelecimento Parceiro tem direito de resposta pública na própria avaliação. Esta cláusula será atualizada sempre que a regulamentação ou a jurisprudência do tema evoluir.'
        },
        {
          type: 'p',
          content: [
            'Qualquer pessoa pode denunciar conteúdo pelo próprio app ou pelo e-mail ',
            {
              email: 'contato@onside.sh'
            },
            '. Analisamos as denúncias em prazo razoável e agimos conforme o regime aplicável ao caso, descrito acima, sem prejuízo do cumprimento de ordens judiciais.'
          ]
        },
        {
          type: 'h3',
          text: 'Licença sobre o que você publica'
        },
        {
          type: 'p',
          content:
            'O conteúdo que você publica continua sendo seu. Você nos concede uma licença não exclusiva, gratuita, mundial e limitada para exibir, armazenar, reproduzir e adaptar o formato desse conteúdo dentro da plataforma e na divulgação da própria Onside, enquanto ele estiver publicado. Ao excluir o conteúdo, essa licença termina — ressalvadas cópias temporárias de backup e o uso em dados agregados e anonimizados, que não identificam você.'
        }
      ]
    },
    {
      id: 's-7',
      num: '07',
      title: 'Uso aceitável',
      blocks: [
        {
          type: 'p',
          content:
            'A operação da plataforma envolve infraestrutura, curadoria de dados e custo real. Para manter o serviço disponível e confiável para todos, você concorda em não:'
        },
        {
          type: 'ul',
          items: [
            'criar contas em massa, contas falsas ou usar a identidade de outra pessoa ou de um estabelecimento que você não representa;',
            'manipular avaliações, notas, check-ins ou a ordem de exibição dos estabelecimentos, por qualquer meio;',
            'automatizar o uso da plataforma por meio de bots, scripts, scrapers ou qualquer acesso não autorizado por interface automatizada;',
            'extrair, copiar ou reutilizar a base de estabelecimentos, a agenda de transmissões, as avaliações ou a estrutura da plataforma para criar produto ou serviço concorrente;',
            'burlar, desativar ou tentar contornar limites de uso, mecanismos de segurança, autenticação ou verificação anti-robô;',
            'tentar obter acesso não autorizado a contas, sistemas, dados de outros usuários ou à infraestrutura da plataforma;',
            'realizar engenharia reversa do software ou dos nossos sistemas;',
            'sobrecarregar deliberadamente a infraestrutura (ataques de negação de serviço, requisições em volume anormal);',
            'inserir na plataforma conteúdo ilegal, ofensivo, discriminatório, que viole direitos de terceiros ou dados pessoais sensíveis de outras pessoas;',
            'usar a plataforma para intermediar apostas, revenda irregular de ingressos ou qualquer finalidade ilícita.'
          ]
        },
        {
          type: 'p',
          content:
            'Contas que violem estas regras podem ter o acesso limitado, suspenso ou encerrado. Sempre que possível e razoável, avisaremos antes; em casos de risco à segurança, à integridade da plataforma ou a outros usuários, a medida pode ser imediata. Você pode contestar a decisão pelo e-mail de contato.'
        }
      ]
    },
    {
      id: 's-8',
      num: '08',
      title: 'Estabelecimentos Parceiros',
      blocks: [
        {
          type: 'p',
          content:
            'Esta seção se aplica apenas a bares, restaurantes e demais estabelecimentos cadastrados na plataforma.'
        },
        {
          type: 'h3',
          text: 'Cadastro e responsabilidade pela informação'
        },
        {
          type: 'p',
          content:
            'Ao cadastrar um estabelecimento, você declara ter poderes para representá-lo. A pessoa que faz o cadastro — sócio, administrador, representante ou preposto autorizado — é o Responsável Legal pela conta, e seus dados (nome, CPF, e-mail e telefone) são tratados conforme a Política de Privacidade. O Estabelecimento Parceiro é o único responsável pela veracidade e pela atualização das informações que publica — endereço, horário de funcionamento, estrutura, fotos e, principalmente, a agenda de partidas que pretende transmitir.'
        },
        {
          type: 'p',
          content:
            'Anunciar a transmissão de um jogo e não exibi-lo frustra o torcedor e compromete a plataforma inteira.'
        },
        {
          type: 'p',
          content:
            'Informação comprovadamente falsa ou desatualização reiterada da agenda podem levar à perda de destaque, à suspensão do perfil ou ao encerramento da parceria.'
        },
        {
          type: 'p',
          content:
            'O Estabelecimento Parceiro declara ainda que possui todas as licenças, alvarás e autorizações exigidas para sua atividade, inclusive as necessárias à exibição pública de conteúdo esportivo e à execução sonora. A Onside não fiscaliza nem se responsabiliza por essa regularidade.'
        },
        {
          type: 'p',
          content:
            'Caso a Onside seja demandada, judicial ou extrajudicialmente, em razão do descumprimento pelo Estabelecimento Parceiro de qualquer declaração desta cláusula — incluindo ausência de licenças, alvarás ou autorizações, e uso não autorizado de imagens de terceiros —, o Estabelecimento Parceiro obriga-se a: (i) reembolsar integralmente a Onside, em até 15 dias corridos contados da notificação, por todas as perdas, danos, multas, indenizações, custas judiciais e honorários advocatícios daí decorrentes; (ii) assumir a defesa da Onside no processo, às suas expensas, caso esta assim solicite; e (iii) manter a Onside informada sobre o andamento de qualquer procedimento relacionado. Para garantir o cumprimento desta obrigação, a Onside poderá reter, até a integral quitação do débito, valores devidos ao Estabelecimento Parceiro a título de destaque pago ou repasse, sem prejuízo do exercício de ação de regresso.'
        },
        {
          type: 'p',
          content:
            'Quanto às imagens que enviar, o Estabelecimento Parceiro declara ser titular dos direitos sobre elas ou ter autorização para usá-las, e ter obtido autorização de uso de imagem das pessoas identificáveis que apareçam nas fotos. Fotos com clientes ou funcionários reconhecíveis sem autorização não devem ser publicadas. O parceiro responde por reclamações de terceiros relacionadas às imagens que enviou, nos termos da cláusula de reembolso acima, e podemos remover a qualquer tempo imagem que gere dúvida fundada.'
        },
        {
          type: 'h3',
          text: 'Marca e imagem do estabelecimento'
        },
        {
          type: 'p',
          content:
            'O Estabelecimento Parceiro autoriza a Onside a exibir seu nome, marca, logotipo e fotos do local dentro da plataforma e em material de divulgação da própria Onside, enquanto durar a parceria. A autorização é revogável a qualquer momento por escrito, com efeito a partir da retirada do perfil.'
        },
        {
          type: 'p',
          content:
            'Ao responder publicamente às avaliações dos torcedores, o Estabelecimento Parceiro autoriza a Onside a exibir e reproduzir essas respostas na plataforma e em materiais de comunicação, com identificação do estabelecimento.'
        },
        {
          type: 'h3',
          text: 'Dados dos torcedores'
        },
        {
          type: 'p',
          content:
            'O Estabelecimento Parceiro tem acesso a métricas agregadas do seu perfil (visualizações, check-ins, avaliações) e, quando houver benefício ativo, ao mínimo necessário para identificar no balcão o torcedor que fez check-in e validar a entrega da cortesia.'
        },
        {
          type: 'p',
          content:
            'Esses dados só podem ser usados para operar a parceria e atender o torcedor no local. É vedado ao estabelecimento reaproveitá-los para marketing próprio, cadastro em lista de e-mails ou WhatsApp, ou repassá- los a terceiros, sem base legal e consentimento obtidos por ele. Ao receber esses dados, o estabelecimento assume a posição de controlador quanto ao uso que fizer deles e responde por esse uso.'
        },
        {
          type: 'h3',
          text: 'Fase de entrada: parceria sem mensalidade'
        },
        {
          type: 'p',
          content:
            'No início das operações em cada cidade, a Onside não cobra mensalidade dos primeiros estabelecimentos. Em contrapartida, o parceiro se compromete a oferecer um benefício ao torcedor que chegar até ele pela plataforma — uma bebida, um prato, um desconto ou cortesia equivalente, à escolha do estabelecimento e nas condições da seção “Benefícios oferecidos pelos estabelecimentos”.'
        },
        {
          type: 'p',
          content:
            'A contrapartida é o benefício ao torcedor. Não há pagamento em dinheiro à Onside durante essa fase, e a Onside não recebe percentual sobre o consumo.'
        },
        {
          type: 'p',
          content:
            'O benefício é custeado integralmente pelo estabelecimento, que também responde pelas obrigações fiscais decorrentes da cortesia que concede.'
        },
        {
          type: 'p',
          content:
            'A fase sem mensalidade dura 120 dias corridos, contados da data em que o estabelecimento conclui o cadastro na plataforma. A data de término fica visível para o parceiro na página de plano. Ao fim do prazo não há cobrança automática: a cobrança só começa se o parceiro contratar um plano, e na data informada no momento da contratação. Sem contratação, o estabelecimento deixa de ser exibido na plataforma após o fim do prazo.'
        },
        {
          type: 'p',
          content:
            'Qualquer das partes pode encerrar a parceria nessa fase a qualquer momento, sem multa, com aviso de 7 dias.'
        },
        {
          type: 'h3',
          text: 'Planos e preços'
        },
        {
          type: 'p',
          content:
            'Encerrada a fase de entrada, o estabelecimento escolhe um dos planos abaixo. Os recursos de cada plano estão descritos na página de planos no momento da contratação.'
        },
        {
          type: 'table',
          head: ['Plano', 'Desconto de fundador', 'Lançamento', 'Tabela cheia'],
          rows: [
            ['Starter', 'R$ 28,00/mês', 'R$ 69,00/mês', 'R$ 97,00/mês'],
            ['Pro', 'R$ 28,00/mês', 'R$ 119,00/mês', 'R$ 147,00/mês'],
            ['Elite', 'R$ 28,00/mês', 'R$ 269,00/mês', 'R$ 297,00/mês']
          ]
        },
        {
          type: 'p',
          content:
            'Os valores acima são as condições de lançamento vigentes na data desta versão.'
        },
        {
          type: 'h3',
          text: 'Desconto de fundador'
        },
        {
          type: 'p',
          content:
            'O estabelecimento que aderir durante o lançamento mantém, enquanto permanecer ativo e adimplente, um desconto fixo de R$ 28,00 por mês sobre a tabela vigente do seu plano, igual em todos os planos. O desconto é um valor em reais, e não um percentual: se a tabela subir, o parceiro continua pagando R$ 28,00 por mês a menos que a tabela cheia e nunca volta a pagar preço cheio, ressalvada a hipótese de revisão excepcional prevista adiante.'
        },
        {
          type: 'p',
          content: [
            {
              b: 'Na prática:'
            },
            ' um parceiro Starter que aderiu a R$ 69,00 sobre uma tabela de R$ 97,00 continuará pagando R$ 28,00 abaixo da tabela do Starter, qualquer que seja ela. O valor resultante é informado com antecedência a cada reajuste.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Revisão excepcional por onerosidade superveniente.'
            },
            ' Em caso de variação atípica e superveniente de custos essenciais à operação da plataforma — câmbio, infraestrutura de nuvem, tributos incidentes sobre o serviço — que torne a manutenção do desconto de fundador excessivamente onerosa para a Onside, nos termos do art. 478 do Código Civil, a Onside poderá propor, de boa-fé, a revisão do valor do desconto, mediante aviso por escrito com 90 dias corridos de antecedência e justificativa objetiva dos fatores que motivaram a proposta. Caso não haja acordo nesse prazo, o Estabelecimento Parceiro poderá rescindir a parceria sem multa, mantendo-se as condições vigentes até o fim do aviso.'
          ]
        },
        {
          type: 'h3',
          text: 'Troca de plano'
        },
        {
          type: 'p',
          content:
            'A condição de fundador é do estabelecimento, não do plano: trocar de plano não faz o parceiro perdê-la. Ao subir ou descer de plano, ele passa a pagar a tabela vigente do plano de destino com o mesmo desconto de fundador de R$ 28,00 por mês, e nunca a tabela cheia. Pode trocar quantas vezes quiser, inclusive voltar ao plano anterior, sempre sob a mesma regra.'
        },
        {
          type: 'p',
          content:
            'A troca vale na hora: os recursos do novo plano ficam disponíveis assim que o parceiro confirma. Na subida de plano, a diferença de preço referente ao tempo que resta do ciclo em curso é cobrada no ato, de forma proporcional. Na descida, o valor proporcional já pago e não utilizado vira crédito na conta do parceiro e é abatido das mensalidades seguintes; esse crédito não é devolvido em dinheiro nem estornado no cartão. Durante o período de teste gratuito, trocar de plano não gera cobrança nem crédito, e a primeira cobrança continua na data em que o teste termina.'
        },
        {
          type: 'h3',
          text: 'Quando a condição de fundador se perde'
        },
        {
          type: 'p',
          content:
            'A condição de fundador se perde apenas se a assinatura for cancelada pelo parceiro, rescindida por descumprimento destes Termos ou ficar inadimplente por mais de 60 dias. Nesses casos, uma nova adesão posterior segue a tabela e as condições comerciais vigentes na data, sem direito ao desconto de fundador.'
        },
        {
          type: 'p',
          content:
            'Reajustes de tabela, quando houver, observarão periodicidade mínima anual, conforme a Lei nº 10.192/2001, tomarão por base a variação do IPCA/IBGE no período e serão comunicados com, no mínimo, 30 dias de antecedência. Você pode cancelar sem multa antes da entrada em vigor de qualquer reajuste.'
        },
        {
          type: 'h3',
          text: 'Cobrança, cancelamento e arrependimento'
        },
        {
          type: 'p',
          content:
            'A cobrança é recorrente, no ciclo escolhido (mensal ou anual), com renovação automática até o cancelamento.'
        },
        {
          type: 'p',
          content:
            'O cancelamento pode ser feito a qualquer momento, pelo painel ou pelo nosso contato, e produz efeito ao fim do ciclo já pago, sem novas cobranças e sem multa.'
        },
        {
          type: 'p',
          content:
            'Em caso de inadimplência, os recursos pagos podem ser suspensos após aviso, permanecendo o cadastro básico gratuito do estabelecimento.'
        },
        {
          type: 'p',
          content:
            'Como política comercial de satisfação — independentemente da natureza jurídica da relação entre a Onside e o Estabelecimento Parceiro —, devolvemos integralmente o valor da primeira contratação se o cancelamento for solicitado em até 7 dias corridos, sem necessidade de justificativa.'
        },
        {
          type: 'h3',
          text: 'O que o plano não garante'
        },
        {
          type: 'p',
          content:
            'O plano garante presença e recursos na plataforma; não garante público, movimento, faturamento, número de check-ins nem posição fixa na listagem. A ordem de exibição é definida por critérios automatizados de relevância — proximidade do usuário, aderência ao jogo pesquisado, avaliações e atualização da agenda —, que podem incluir recursos de inteligência artificial, combinados com posições de destaque pago, sempre identificadas como tal.'
        }
      ]
    },
    {
      id: 's-9',
      num: '09',
      title: 'Publicidade e conteúdo patrocinado',
      blocks: [
        {
          type: 'p',
          content:
            'A plataforma pode exibir anúncios, posições de destaque e conteúdo patrocinado. Todo conteúdo dessa natureza é identificado de forma clara e ostensiva, como exige o art. 36 do Código de Defesa do Consumidor, e segue as normas éticas do CONAR.'
        },
        {
          type: 'p',
          content:
            'Destaque pago é espaço publicitário, não recomendação editorial da Onside nem atestado de qualidade do estabelecimento.'
        },
        {
          type: 'p',
          content:
            'O anunciante é responsável pelo conteúdo e pelas promessas do seu anúncio, inclusive por promoções, preços e condições divulgadas.'
        },
        {
          type: 'p',
          content:
            'Publicidade de bebida alcoólica observa a Lei nº 9.294/1996 e as normas aplicáveis, e não é direcionada a menores de 18 anos.'
        }
      ]
    },
    {
      id: 's-10',
      num: '10',
      title: 'Consumo responsável',
      blocks: [
        {
          type: 'p',
          content:
            'A Onside existe para você assistir ao jogo em boa companhia — não para incentivar consumo de álcool. Beba com moderação, respeite os limites do local e, se for beber, não dirija: dirigir sob influência de álcool é infração gravíssima e, conforme o caso, crime (Lei nº 11.705/2008 e Código de Trânsito Brasileiro).'
        }
      ]
    },
    {
      id: 's-11',
      num: '11',
      title: 'Propriedade intelectual',
      blocks: [
        {
          type: 'p',
          content: [
            {
              b: 'Nosso:'
            },
            ' a marca Onside, o logotipo, o design, o software, a organização da base de estabelecimentos e agendas, a curadoria e os critérios de relevância são de nossa titularidade ou licenciados a nós, e protegidos pela legislação de propriedade intelectual. Estes Termos não transferem nenhum desses direitos a você — concedemos apenas uma licença pessoal, limitada, não exclusiva, revogável e intransferível de uso da plataforma para a finalidade prevista.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'De terceiros:'
            },
            ' nomes de clubes, campeonatos, ligas, competições e emissoras aparecem na plataforma exclusivamente para identificar as partidas e informar o usuário, no exercício regular do direito de informação. A Onside não é afiliada, patrocinada, licenciada nem endossada por essas entidades, e não utiliza seus sinais distintivos para sugerir qualquer vínculo.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Seu:'
            },
            ' o conteúdo que você publica segue as regras da seção “Avaliações, notas e check-ins”.'
          ]
        },
        {
          type: 'p',
          content:
            'Podemos usar dados agregados e anonimizados, que não identificam você, para entender o uso da plataforma, produzir estatísticas e melhorar o produto.'
        }
      ]
    },
    {
      id: 's-12',
      num: '12',
      title: 'Disponibilidade, mudanças e interrupções',
      blocks: [
        {
          type: 'p',
          content:
            'A Onside está em desenvolvimento contínuo. Fazemos esforços razoáveis para manter a plataforma disponível e funcionando, mas não garantimos operação ininterrupta ou livre de falhas. O serviço pode ficar indisponível por manutenção, atualizações, falhas de fornecedores terceiros (hospedagem, mapas, login social, meios de pagamento, provedores de dados esportivos) ou eventos fora do nosso controle.'
        },
        {
          type: 'p',
          content:
            'Podemos alterar, suspender ou descontinuar funcionalidades a qualquer momento. Se formos descontinuar a plataforma como um todo, avisaremos com antecedência razoável pelos canais do próprio app ou por e-mail, para que você possa solicitar uma cópia dos seus dados antes. Planos pagos vigentes serão reembolsados proporcionalmente ao período não usufruído.'
        }
      ]
    },
    {
      id: 's-13',
      num: '13',
      title: 'Responsabilidade',
      blocks: [
        {
          type: 'p',
          content:
            'Respondemos pelos danos que causarmos por defeito na prestação do nosso serviço, nos termos do Código de Defesa do Consumidor e da legislação aplicável. Nada nestes Termos exclui ou limita direitos que a lei garante a você como consumidor.'
        },
        {
          type: 'p',
          content:
            'Dentro desses limites, esclarecemos que não nos responsabilizamos por:'
        },
        {
          type: 'ul',
          items: [
            'qualidade, preço, higiene, segurança, atendimento, lotação ou qualquer condição do estabelecimento que você escolheu visitar;',
            'transmissão que não ocorreu, foi interrompida, mudou de horário ou não correspondeu ao anunciado pelo estabelecimento;',
            'benefícios e cortesias anunciados pelos estabelecimentos, cuja definição, custeio, qualidade e entrega são de responsabilidade de quem os ofereceu;',
            'despesas de deslocamento, consumo ou oportunidade decorrentes de uma visita frustrada;',
            'conduta de outros usuários, do estabelecimento ou de terceiros dentro ou fora do local;',
            'conteúdo publicado por usuários, observado o regime de responsabilidade civil de provedores de aplicações de internet fixado pelo Supremo Tribunal Federal no julgamento dos Temas 987 e 533 de repercussão geral, que substituiu a sistemática original do art. 19 do Marco Civil da Internet por regimes diferenciados conforme a gravidade e a natureza do conteúdo, tal como detalhado na seção “Moderação” acima, e o nosso dever de atuar diante de denúncia ou notificação;',
            'indisponibilidade, falha ou alteração de serviços de terceiros dos quais a plataforma depende;',
            'uso da sua conta por terceiro em razão de você não ter guardado suas credenciais em sigilo.'
          ]
        }
      ]
    },
    {
      id: 's-14',
      num: '14',
      title: 'Privacidade e proteção de dados',
      blocks: [
        {
          type: 'p',
          content:
            'O tratamento dos seus dados pessoais — o que coletamos, com que base legal, com quem compartilhamos, por quanto tempo guardamos e como você exerce seus direitos de titular — está descrito na Política de Privacidade, que integra estes Termos. Em caso de conflito entre os dois documentos sobre tratamento de dados pessoais, prevalece a Política de Privacidade.'
        }
      ]
    },
    {
      id: 's-15',
      num: '15',
      title: 'Alterações nestes Termos',
      blocks: [
        {
          type: 'p',
          content:
            'Podemos atualizar estes Termos conforme a plataforma evolui ou a legislação muda. A data da última atualização fica sempre no topo desta página. Mudanças relevantes serão comunicadas dentro do app ou por e-mail, com antecedência razoável quando possível. Ao continuar usando a plataforma após a entrada em vigor, você aceita a versão atualizada; se não concordar, pode encerrar sua conta a qualquer momento.'
        },
        {
          type: 'p',
          content: [
            {
              b: 'Exceção:'
            },
            ' mudanças que reduzam direitos do Estabelecimento Parceiro ou alterem a regra do desconto de fundador exigem aceite ativo e específico do Responsável Legal (e não apenas o uso continuado da plataforma), sem prejuízo do disposto na cláusula de revisão excepcional prevista na seção 8.'
          ]
        }
      ]
    },
    {
      id: 's-16',
      num: '16',
      title: 'Disposições gerais',
      blocks: [
        {
          type: 'p',
          content: [
            {
              b: 'Aceite e versões.'
            },
            ' O aceite destes Termos é manifestado no cadastro. As versões anteriores ficam disponíveis mediante pedido pelo nosso canal de contato.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Comunicações.'
            },
            ' O e-mail informado no seu cadastro é o canal oficial de comunicação entre nós. Mantenha-o atualizado — avisos enviados para ele são considerados entregues. Comunicações operacionais (confirmações, avisos de cobrança, mudanças nestes Termos, incidentes de segurança) são inerentes ao serviço e não podem ser desativadas enquanto a conta existir; comunicações de marketing são opcionais e você escolhe recebê-las ou não.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Independência das cláusulas.'
            },
            ' Se qualquer disposição destes Termos for considerada inválida ou inexequível, as demais permanecem em pleno vigor.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Tolerância.'
            },
            ' O fato de não exigirmos, em determinado momento, o cumprimento de alguma disposição destes Termos não significa renúncia ao direito de exigi-lo depois.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Cessão.'
            },
            ' Você não pode transferir sua conta ou seus direitos sob estes Termos a terceiros. Nós podemos ceder estes Termos no contexto de reorganização societária, fusão, aquisição ou venda de ativos, mediante aviso prévio, preservados os seus direitos.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Mediação prévia entre a Onside e Estabelecimentos Parceiros pessoas jurídicas.'
            },
            ' Antes de recorrer ao Poder Judiciário para dirimir controvérsias decorrentes da relação comercial de parceria, a Onside e o Estabelecimento Parceiro pessoa jurídica envidarão esforços de boa-fé para resolver a questão por mediação, pelo prazo de até 30 dias corridos a contar da notificação da controvérsia, sem prejuízo do acesso direto ao Judiciário em casos de urgência ou de tutela cautelar.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Território e idioma.'
            },
            ' A plataforma é destinada ao território brasileiro e estes Termos são redigidos em português do Brasil, que prevalece sobre eventuais traduções.'
          ]
        },
        {
          type: 'p',
          content: [
            {
              b: 'Integralidade.'
            },
            ' Estes Termos, somados à Política de Privacidade e às condições comerciais específicas de planos pagos, constituem o acordo integral entre você e a Onside quanto ao uso da plataforma.'
          ]
        }
      ]
    },
    {
      id: 's-17',
      num: '17',
      title: 'Lei aplicável e foro',
      blocks: [
        {
          type: 'p',
          content:
            'Estes Termos são regidos pelas leis da República Federativa do Brasil, em especial o Código de Defesa do Consumidor (Lei nº 8.078/1990), o Marco Civil da Internet (Lei nº 12.965/2014) e a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).'
        },
        {
          type: 'p',
          content: [
            'Buscaremos sempre resolver qualquer questão de forma amigável pelo canal de contato. Você também pode registrar sua demanda na plataforma pública ',
            {
              mark: 'consumidor.gov.br'
            },
            ', onde nos comprometemos a responder.'
          ]
        },
        {
          type: 'p',
          content:
            'Não havendo acordo, fica eleito o foro do domicílio do usuário consumidor, conforme o art. 101, inciso I, do Código de Defesa do Consumidor.'
        },
        {
          type: 'p',
          content:
            'Para controvérsias com Estabelecimentos Parceiros pessoas jurídicas, decorrentes da relação comercial de parceria, fica eleito o foro da Comarca de São Paulo/SP, observado o procedimento de mediação prévia da seção 16. O Responsável Legal declara ciência expressa e destacada desta cláusula de eleição de foro no momento do cadastro do estabelecimento, nos termos do art. 63 do Código de Processo Civil.'
        }
      ]
    },
    {
      id: 's-18',
      num: '18',
      title: 'Contato',
      blocks: [
        {
          type: 'p',
          content: [
            'Dúvidas, reclamações, denúncias de conteúdo ou solicitações sobre estes Termos? Escreva para ',
            {
              email: 'contato@onside.sh'
            },
            '. Respondemos em até 15 dias corridos.'
          ]
        }
      ]
    }
  ]
}
