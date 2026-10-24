import { type ReactNode, useRef, useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Actions, FollowUps } from '@/components/ai/actions'
import { ConfirmCard, DecisionLine } from '@/components/ai/confirmation'
import { AiHeader } from '@/components/ai/header'
import { Shimmer, Spinner } from '@/components/ai/loader'
import { UserMessage } from '@/components/ai/message'
import { PromptInput } from '@/components/ai/prompt-input'
import { Reasoning } from '@/components/ai/reasoning'
import {
  AnswerText,
  CitedBar,
  FilterChips,
  Sources
} from '@/components/ai/response'
import { type AiPalette, useAiPalette } from '@/components/ai/theme'
import { ToolCard } from '@/components/ai/tool'
import { BackButton, useStatusBar } from '@/components/ui'
import { followUps } from '@/lib/ai-chat'
import { dublaBars } from '@/lib/ai-dubla'
import type { FilterChip, Proposal } from '@/lib/ai-events'

/*
 * Quadro de componentes do chat da IA (t24c), só em desenvolvimento: cada
 * peça isolada, com os estados do design, no tema do sistema (troque o tema
 * para ver o outro). Navegador DEV → "Peças do chat". A rota `app/ai-pecas.tsx`
 * só carrega este arquivo com `__DEV__`.
 */

const STEPS = [
  {
    id: 's1',
    label: 'Entendi o pedido',
    state: 'done' as const,
    tags: ['Corinthians', 'Hoje']
  },
  { id: 's2', label: 'Procurando bares', state: 'run' as const }
]
const TOOL = {
  id: 't1',
  name: 'buscar_bares',
  label: 'Bares com o jogo',
  params: [
    ['jogo', 'COR × PAL · 21:30'],
    ['raio', '3 km']
  ] as [string, string][]
}
const CHIPS: FilterChip[] = [
  { key: 'teamIds:cor', label: 'Corinthians', icon: 'team' },
  { key: 'date', label: 'Hoje', icon: 'cal' },
  { key: 'amenities:1', label: 'Telão', icon: 'tv' },
  { key: 'amenities:4', label: 'Área externa', icon: 'sun' },
  { key: 'radiusKm', label: 'até 3 km', icon: 'pin' }
]
const PROPOSAL: Proposal = {
  id: 'p',
  bar: { id: 'b', name: 'Bar do Zé', photoUrl: null },
  game: { id: 'g', title: 'Corinthians × Palmeiras', startsAt: '' },
  actions: [
    { kind: 'going', label: 'Marcar “Vou assistir aqui”', on: true },
    { kind: 'call', friendId: 'f', label: 'Chamar Marina Costa', on: true }
  ]
}
const SOURCES = [
  ['Bar do Zé', 'Página do bar · agenda'],
  ['Casa 92', 'Página do bar · avaliações'],
  ['Pirajá Pinheiros', 'Página do bar · movimento']
].map(([name, why], i) => ({
  barId: String(i),
  name: name ?? '',
  photoUrl: null,
  why: why ?? ''
}))

export default function AiPieces() {
  const palette = useAiPalette()
  const insets = useSafeAreaInsets()
  useStatusBar('auto')
  const input = useRef<TextInput>(null)
  const [now] = useState(() => Date.now())
  const [bar] = dublaBars(now)
  const noop = () => {}

  return (
    <ScrollView
      style={{ backgroundColor: palette.sheet }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 40,
        gap: 28
      }}
    >
      <View style={{ paddingHorizontal: 16 }}>
        <BackButton />
      </View>

      <Piece title="Cabeçalho" palette={palette}>
        <State label="Parado" palette={palette} bleed>
          <AiHeader
            status="Achei 3 bares para você"
            busy={false}
            palette={palette}
            onNew={noop}
            onClose={noop}
          />
        </State>
        <State label="Ocupado" palette={palette} bleed>
          <AiHeader
            status="Procurando…"
            busy
            palette={palette}
            onNew={noop}
            onClose={noop}
          />
        </State>
      </Piece>

      <Piece title="Mensagem do usuário" palette={palette}>
        <State label="Curta" palette={palette}>
          <UserMessage palette={palette}>E amanhã?</UserMessage>
        </State>
        <State label="Longa" palette={palette}>
          <UserMessage palette={palette}>
            Quero ver o Corinthians hoje num lugar com telão e área externa,
            perto de Pinheiros
          </UserMessage>
        </State>
      </Piece>

      <Piece title="Raciocínio" palette={palette}>
        <State label="Pensando" palette={palette}>
          <Reasoning
            steps={STEPS}
            tools={[]}
            thinking
            label=""
            palette={palette}
          />
        </State>
        <State label="Fechado" palette={palette}>
          <Reasoning
            steps={STEPS.map((s) => ({ ...s, state: 'done' as const }))}
            tools={[
              { ...TOOL, state: 'done', output: '3 bares · 0,8 a 2,3 km' }
            ]}
            thinking={false}
            label="Pensou por 4 s · 2 buscas"
            palette={palette}
          />
        </State>
      </Piece>

      <Piece title="Ferramenta" palette={palette}>
        <State label="Rodando" palette={palette}>
          <ToolCard
            tool={{
              ...TOOL,
              state: 'run',
              output: '14 encontrados, filtrando…'
            }}
            palette={palette}
          />
        </State>
        <State label="Pronta" palette={palette}>
          <ToolCard
            tool={{ ...TOOL, state: 'done', output: '3 bares · 0,8 a 2,3 km' }}
            palette={palette}
          />
        </State>
        <State label="Aguardando você" palette={palette}>
          <ToolCard
            tool={{
              id: 't2',
              name: 'marcar_vou_assistir',
              label: 'Marcar presença',
              state: 'wait'
            }}
            palette={palette}
          />
        </State>
      </Piece>

      <Piece title="Resposta e citações" palette={palette}>
        <State label="Texto" palette={palette}>
          <AnswerText
            text="O **Bar do Zé** [[1]] é o mais perto, a 800 m. O **Casa 92** [[2]] tem a melhor nota."
            count={2}
            palette={palette}
            onCite={noop}
          />
        </State>
        <State label="Card citado" palette={palette}>
          {bar ? (
            <CitedBar
              bar={bar}
              n={1}
              now={now}
              palette={palette}
              onPress={noop}
            />
          ) : null}
        </State>
      </Piece>

      <Piece title="Fontes" palette={palette}>
        <State label="Fechado" palette={palette}>
          <Sources
            label="Usei 3 bares e a agenda de hoje"
            sources={SOURCES}
            numberOf={(id) => Number(id) + 1}
            palette={palette}
            onOpen={noop}
          />
        </State>
        <State label="Aberto" palette={palette}>
          <Sources
            label="Usei 3 bares e a agenda de hoje"
            sources={SOURCES}
            numberOf={(id) => Number(id) + 1}
            palette={palette}
            onOpen={noop}
            initiallyOpen
          />
        </State>
      </Piece>

      <Piece title="Filtros entendidos" palette={palette}>
        <State label="Chips" palette={palette}>
          <FilterChips chips={CHIPS} palette={palette} onRemove={noop} />
        </State>
      </Piece>

      <Piece title="Seguimento" palette={palette}>
        <State label="Pílulas" palette={palette} bleed>
          <FollowUps
            items={followUps(['Só com oferta da casa', 'E amanhã?'], true)}
            onAsk={noop}
            onMap={noop}
          />
        </State>
      </Piece>

      <Piece title="Ações e versões" palette={palette}>
        <State label="Padrão" palette={palette}>
          <Actions
            feedback={null}
            version={null}
            palette={palette}
            onCopy={noop}
            onRedo={noop}
            onRate={noop}
            onShare={noop}
            onVersion={noop}
          />
        </State>
        <State label="Avaliada · 2 versões" palette={palette}>
          <Actions
            feedback={1}
            version="2/2"
            palette={palette}
            onCopy={noop}
            onRedo={noop}
            onRate={noop}
            onShare={noop}
            onVersion={noop}
          />
        </State>
      </Piece>

      <Piece title="Campo" palette={palette}>
        {(
          [
            ['Vazio', '', false],
            ['Com texto', 'Tem algum com oferta da casa?', false],
            ['Respondendo', '', true]
          ] as const
        ).map(([label, draft, busy]) => (
          <State key={label} label={label} palette={palette} bleed>
            <PromptInput
              inputRef={input}
              draft={draft}
              onDraft={noop}
              placeholder={
                busy
                  ? 'Responda ou espere eu terminar…'
                  : 'Pergunte sobre bares, jogos ou bairros…'
              }
              busy={busy}
              editable={false}
              place={
                busy ? null : { label: 'Vila Madalena · 5 km', onRemove: noop }
              }
              day={busy ? null : { label: 'Hoje', onRemove: noop }}
              tastes
              palette={palette}
              onTastes={noop}
              onAdd={noop}
              onSend={noop}
              onStop={noop}
            />
          </State>
        ))}
      </Piece>

      <Piece title="Confirmação" palette={palette}>
        <State label="Pendente" palette={palette}>
          <ConfirmCard
            proposal={PROPOSAL}
            values={[true, true]}
            when="hoje 21:30"
            sending={false}
            palette={palette}
            onToggle={noop}
            onConfirm={noop}
            onRefuse={noop}
          />
        </State>
        <State label="Aprovada" palette={palette}>
          <DecisionLine
            approved
            label="Você aprovou · presença marcada"
            at="19:02"
            palette={palette}
          />
        </State>
        <State label="Recusada" palette={palette}>
          <DecisionLine
            approved={false}
            label="Você recusou · nada foi feito"
            at="19:02"
            palette={palette}
          />
        </State>
      </Piece>

      <Piece title="Carregando" palette={palette}>
        <State label="Giro" palette={palette}>
          <View style={styles.spins}>
            <Spinner size={11} palette={palette} />
            <Spinner size={14} palette={palette} />
            <Spinner size={18} palette={palette} />
          </View>
        </State>
        <State label="Texto" palette={palette}>
          <Shimmer size={15} palette={palette}>
            Procurando bares que vão passar o jogo…
          </Shimmer>
        </State>
      </Piece>
    </ScrollView>
  )
}

function Piece({
  title,
  palette,
  children
}: {
  title: string
  palette: AiPalette
  children: ReactNode
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.title, { color: palette.ink }]}>{title}</Text>
      {children}
    </View>
  )
}

/** Um estado: a etiqueta em mono e a peça. `bleed` vai de borda a borda. */
function State({
  label,
  palette,
  bleed,
  children
}: {
  label: string
  palette: AiPalette
  bleed?: boolean
  children: ReactNode
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.state, { color: palette.muted }]}>
        {label.toLocaleUpperCase('pt-BR')}
      </Text>
      <View style={bleed ? null : { paddingHorizontal: 16 }}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  title: {
    fontFamily: 'Anton',
    fontSize: 26,
    marginVertical: -0.2425 * 26,
    textTransform: 'uppercase',
    paddingHorizontal: 16
  },
  state: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    lineHeight: 12,
    letterSpacing: 0.6,
    paddingHorizontal: 16
  },
  spins: { flexDirection: 'row', alignItems: 'center', gap: 14 }
})
