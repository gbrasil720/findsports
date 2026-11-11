import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import { OwnerCard } from '@/components/bar-owner'
import { HardShadow } from '@/components/explore'
import { haptic } from '@/components/motion'
import { useAiButtonCenter } from '@/components/side-nav'
import { usePalette } from '@/components/theme'
import { type Box, Spotlight, targetOf, tourStyles } from '@/components/tour'
import { ACID, Icon, INK, PillButton, Text, text } from '@/components/ui'
import { weekdayName } from '@/lib/bar-owner'
import {
  GUIDE_LABELS,
  guideItems,
  type LocalSteps,
  MENU_STEPS,
  type TourStep
} from '@/lib/bar-tour'
import { formatTime } from '@/lib/explore'
import { useOwnerBar } from '@/lib/owner'
import { trpc } from '@/lib/trpc'

/*
 * O passeio do bar (rodada 11, artifact "Passeio do Bar no App"): o escuro
 * com o recorte e o anel acid do passeio do torcedor, o roteiro do passeio
 * do painel web. Oferecido, nunca forçado: começa pelo Perfil completo, pelo
 * card "Primeiros passos" de Hoje na casa ou por Configurações do bar, com
 * `?passeio=1` (do começo) ou `?passeio=continuar` (das telas não vistas).
 * Nenhum passo anda sozinho: a ação do passo (o código de exemplo, publicar
 * um jogo) só troca a frase e o botão. Tocar fora do cartão não fecha;
 * "Pular" pausa, e o card oferece continuar.
 *
 * Movimento: o escuro entra uma vez (240 ms), o cartão sobe 12 pt (200 ms);
 * o recorte anda numa mola de 300 ms sem balanço; o cartão troca em 150 ms;
 * o anel respira (2,4 s). Com menos movimento, só opacidade e nada respira.
 */

/* ─── O que fica no aparelho, por bar ─── */

const cache = new Map<string, LocalSteps>()
const subs = new Set<() => void>()
const storeKey = (barId: string) => `onside.bar-passeio.${barId}`
const notify = () => {
  for (const sub of subs) sub()
}

export function useLocalSteps(barId: string | undefined) {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    subs.add(tick)
    return () => {
      subs.delete(tick)
    }
  }, [])
  useEffect(() => {
    if (!barId || cache.has(barId)) return
    SecureStore.getItemAsync(storeKey(barId))
      .then((raw) => {
        let saved: LocalSteps = {}
        try {
          saved = JSON.parse(raw ?? '{}') ?? {}
        } catch {}
        if (!cache.has(barId)) cache.set(barId, saved)
      })
      // Sem armazenamento, tudo começa por fazer.
      .catch(() => cache.set(barId, {}))
      .finally(notify)
  }, [barId])
  const mark = useCallback(
    (patch: LocalSteps | ((now: LocalSteps) => LocalSteps)) => {
      if (!barId) return
      const now = cache.get(barId) ?? {}
      const next = {
        ...now,
        ...(typeof patch === 'function' ? patch(now) : patch)
      }
      cache.set(barId, next)
      SecureStore.setItemAsync(storeKey(barId), JSON.stringify(next)).catch(
        () => {}
      )
      notify()
    },
    [barId]
  )
  const local = barId ? cache.get(barId) : undefined
  return { local: local ?? {}, ready: local !== undefined, mark }
}

/* ─── Pedir o passeio ao layout do bar ─── */

// `setParams` de uma tela das abas nativas não chega ao layout: quem já está
// dentro (o card, Configurações do bar) pede por aqui. De fora (o Perfil
// completo, antes de as abas existirem), `?passeio=1` em /casa.
const asks = new Set<(resume: boolean) => void>()
export function askBarTour(resume: boolean) {
  for (const ask of asks) ask(resume)
}
export function useBarTourAsk(onAsk: (resume: boolean) => void) {
  useEffect(() => {
    asks.add(onAsk)
    return () => {
      asks.delete(onAsk)
    }
  }, [onAsk])
}

/* ─── O que o card e o passeio leem ─── */

export function useBarGuide() {
  const owner = useOwnerBar()
  const bar = owner.bar
  const novo = Boolean(bar?.routine)
  const events = useQuery(trpc.pub.getMyEvents.queryOptions())
  const photos = useQuery({
    ...trpc.pub.photos.queryOptions(),
    enabled: novo
  })
  const { local, ready, mark } = useLocalSteps(bar?.id)
  const published = (events.data ?? [])
    .filter((e) => e.publishedAt !== null)
    .sort(
      (a, b) => Date.parse(String(a.startsAt)) - Date.parse(String(b.startsAt))
    )
  const facts = {
    published: published.length,
    planChosen: bar?.trialPlanChosenAt != null,
    cover:
      Boolean(bar?.photoUrl) ||
      (photos.data ?? []).some(
        (p) => p.coverRequested && p.status !== 'rejected'
      ),
    hours: ((bar?.openingHours ?? []) as unknown[]).some(Boolean),
    elite: owner.elite
  }
  const now = Date.now()
  const game =
    published.find((e) => Date.parse(String(e.startsAt)) > now) ??
    published.at(-1)
  return {
    owner,
    name: bar?.name ?? 'seu bar',
    novo,
    ready: ready && events.isSuccess && Boolean(bar),
    facts,
    items: guideItems(facts, local),
    local,
    mark,
    game
  }
}

/** "sábado às 16:00", "hoje às 21:30". */
function whenLine(at: string | Date) {
  const day =
    brasiliaDay(at) === brasiliaDay(Date.now())
      ? 'hoje'
      : weekdayName(new Date(at).getTime()).slice(3)
  return `${day} às ${formatTime(at)}`
}

/* ─── O passeio ─── */

type Card = {
  title: string
  body: string
  seal?: string
  /** A ação do passo, como link abaixo da frase ("↳ Ver sugestões"). */
  hint?: { label: string; run: () => void }
  next?: string
}

const DIM_IN = FadeIn.duration(240)
const DIM_OUT = FadeOut.duration(150)
const CARD_RISE = FadeInDown.duration(200).withInitialValues({
  opacity: 0,
  transform: [{ translateY: 12 }]
})
const CARD_IN = FadeIn.duration(150)
const CARD_OUT = FadeOut.duration(150)

export function BarTour({
  steps,
  onMenu,
  onClose
}: {
  steps: TourStep[]
  /** Quem vai, Meu espaço e Desempenho moram no menu do Bar. */
  onMenu: (open: boolean) => void
  onClose: () => void
}) {
  const router = useRouter()
  const palette = usePalette()
  const { width, height } = useWindowDimensions()
  const g = useBarGuide()
  const ai = useAiButtonCenter()
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = steps[index]
  const finished = index >= steps.length
  const first = useRef(true)

  // O que o dono já fez quando o passo abriu: a ação do passo troca a frase.
  const start = useRef({ published: g.facts.published, codigo: g.local.codigo })
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na troca de passo
  useEffect(() => {
    start.current = { published: g.facts.published, codigo: g.local.codigo }
    if (step)
      g.mark((now) => ({
        vistos: [...new Set([...(now.vistos ?? []), step])]
      }))
    if (finished) g.mark({ passeio: true })
    onMenu(step ? MENU_STEPS.includes(step) : false)
  }, [index])
  const added = g.facts.published > start.current.published
  const tried = g.local.codigo === true && !start.current.codigo
  useEffect(() => {
    if (added || tried) haptic.success()
  }, [added, tried])

  // biome-ignore lint/correctness/useExhaustiveDependencies: mede a cada passo e quando a tela muda
  useEffect(() => {
    if (!step) return setBox(null)
    // A barra é nativa e não se mede: o círculo vem de onde a navegação o
    // põe, e a aba Jogos fica 178 pt à esquerda dele (medido no 390 x 844).
    if (step === 'validar')
      return setBox({ x: ai.x - 39, y: ai.y - 39, w: 78, h: 78 })
    if (step === 'jogos')
      return setBox({ x: ai.x - 178 - 45, y: ai.y - 35, w: 90, h: 70 })
    const key =
      step === 'hoje'
        ? 'bar-board'
        : `menu-${step === 'quemvai' ? 'quem-vai' : step}`
    const measure = () =>
      targetOf(key)?.measureInWindow((x, y, w, h) => {
        if (h >= 8) setBox({ x, y, w, h })
      })
    measure()
    // O menu entra animado: mede de novo quando assenta.
    const later = [setTimeout(measure, 260), setTimeout(measure, 700)]
    return () => later.forEach(clearTimeout)
  }, [step, width, height])

  const card = step ? cardFor(step) : null
  function cardFor(s: TourStep): Card {
    const title = g.game ? gameTitle(g.game) : null
    const plan = g.owner.plan
    if (s === 'hoje')
      return g.game && title
        ? {
            title: 'Seu jogo já está no ar',
            body: `${Date.parse(String(g.game.startsAt)) <= Date.now() ? `${title} está no ar agora no ${g.name}.` : `${title}, ${whenLine(g.game.startsAt)}, é o próximo jogo do ${g.name}.`} ${
              g.facts.elite
                ? 'Cada “Vou assistir aqui” soma em vão assistir, e quem mostrar o código no balcão entra em Chegaram agora.'
                : 'Cada visita à página do bar soma em viram o bar, e cada toque em WhatsApp, rota ou telefone, em se interessaram.'
            }`
          }
        : {
            title: 'O jogo da casa aparece aqui',
            body: `Bar sem jogo na grade não aparece nas buscas do dia. Com o primeiro jogo, ele aparece aqui, com quem viu o ${g.name} e quem se interessou.`
          }
    if (s === 'validar')
      return g.local.codigo
        ? {
            seal: 'SÓ NO ELITE',
            title: 'O código do balcão',
            body: `É isso: no balcão, leu, validou, liberou a oferta. A visita conta para o ${g.name} e entra em Desempenho. Este, de exemplo, não conta.`
          }
        : {
            seal: 'SÓ NO ELITE',
            title: 'O código do balcão',
            body: `Quem marca “Vou assistir aqui”${title ? ` em ${title}` : ''} recebe um código de 6 letras. No balcão, toque no círculo, aponte para o QR ou digite: libera a oferta da casa e a visita conta para o bar.`,
            hint: {
              label: 'Teste com o código de exemplo',
              run: () =>
                router.push({
                  pathname: '/validar-codigo',
                  params: { exemplo: '1' }
                })
            },
            next: 'Agora não'
          }
    if (s === 'jogos')
      return added
        ? {
            title: 'Mais um na grade',
            body: `O jogo entrou na grade do ${g.name} e já aparece para quem procura esse jogo perto do bar.`
          }
        : {
            title: 'Ponha mais um jogo',
            body: `A grade tem ${g.facts.published} ${g.facts.published === 1 ? 'jogo' : 'jogos'}${title ? `, ${title}` : ''}. Em Novo jogo ficam os jogos desta semana que outros bares perto já marcaram e o ${g.name} ainda não tem. Cada jogo na grade é mais uma busca em que o bar aparece.`,
            hint: {
              label: 'Ver sugestões',
              run: () => router.push('/novo-jogo')
            },
            next: 'Agora não'
          }
    if (s === 'quemvai')
      return {
        seal: 'SÓ NO ELITE',
        title: 'Quem vai, jogo a jogo',
        body: 'Aqui aparece quem marcou que vai a cada jogo, quem já chegou e quem é a primeira vez no bar. No dia do jogo, é a lista da porta.'
      }
    if (s === 'espaco') {
      const { cover, hours } = g.facts
      return {
        title: 'Foto de capa e horário',
        body: `Hoje o card do ${g.name} sai na busca${cover ? '' : ' sem foto'}${!cover && !hours ? ' e' : ''}${hours ? '' : ' sem horário'}. A capa e o horário são o que o torcedor olha antes de escolher o bar: dá para fazer agora ou depois, em Meu espaço.${plan === 'starter' ? ' No Starter entra a capa; a galeria de fotos é do Pro.' : ''}`,
        next: 'Fazer depois'
      }
    }
    const after = g.game
      ? `Depois do jogo de ${whenLine(g.game.startsAt).split(' às ')[0]}`
      : 'Depois do primeiro jogo'
    if (plan === 'elite')
      return {
        seal: 'NO ELITE',
        title: 'Quem foi de verdade',
        body: `${after}, aparece aqui quem marcou que ia e quem validou o código no balcão${g.local.codigo ? ' (o de exemplo não entra)' : ''}. É a visita verificada, o número que mostra o retorno do Elite.`,
        next: 'Concluir'
      }
    if (plan === 'pro')
      return {
        seal: 'NO PRO',
        title: 'Por onde te procuraram',
        body: `${after}, o Pro mostra por onde o torcedor chamou o ${g.name}: WhatsApp, rota ou telefone. É assim que você vê se a grade está trazendo gente.`,
        next: 'Concluir'
      }
    return {
      title: 'Onde o jogo vira número',
      body: `${after}, aparece aqui quantas pessoas viram o ${g.name}, quantas se interessaram e a taxa, nos últimos 30 dias. Nada aqui é estimativa.`,
      next: 'Concluir'
    }
  }

  const pause = () => {
    haptic.select()
    onMenu(false)
    onClose()
  }
  const next = () => {
    haptic.select()
    first.current = false
    setIndex(index + 1)
  }
  const back = () => {
    haptic.select()
    first.current = false
    setIndex(index - 1)
  }
  const done = () => {
    haptic.success()
    onClose()
    router.navigate('/casa')
  }

  const radius =
    step === 'validar' ? 39 : step === 'jogos' ? 35 : step === 'hoje' ? 28 : 14
  const pad = step === 'validar' || step === 'jogos' ? 0 : 4
  // O cartão fica do lado oposto à peça.
  const below = box ? box.y + box.h / 2 < height / 2 : false
  const cardPos = finished
    ? { top: height / 2 - 130 }
    : !box
      ? { top: height / 3 }
      : below
        ? { top: box.y + box.h + pad + 16 }
        : { bottom: height - box.y + pad + 16 }
  const variant = `${index}-${added || tried ? 'feito' : ''}`

  return (
    <Animated.View
      entering={DIM_IN}
      exiting={DIM_OUT}
      // Por cima do menu do Bar (zIndex 30), que abre por baixo do escuro.
      style={[StyleSheet.absoluteFill, { zIndex: 40 }]}
    >
      <Spotlight
        box={finished ? null : box}
        radius={radius}
        pad={pad}
        breathe
      />
      <Animated.View
        key={variant}
        entering={first.current ? CARD_RISE : CARD_IN}
        exiting={CARD_OUT}
        accessibilityViewIsModal
        style={[
          tourStyles.card,
          cardPos,
          { backgroundColor: palette.bg },
          palette.dark && tourStyles.cardDark
        ]}
      >
        {finished ? (
          <>
            <Text style={[tourStyles.mono, { color: palette.muted }]}>
              PASSEIO FEITO
            </Text>
            <Text style={[tourStyles.title, { color: palette.ink }]}>
              O bar está pronto pro jogo
            </Text>
            <Text
              style={[text(14.5, 'Regular', 1.45), { color: palette.muted }]}
            >
              {`${
                g.facts.elite
                  ? 'Falta só o primeiro código: no dia do jogo, toque no círculo da barra e valide quem chegar.'
                  : 'Agora é encher a grade: cada jogo publicado é mais uma busca em que o bar aparece.'
              } Este passeio fica em Configurações, se quiser rever.`}
            </Text>
            <View style={{ marginTop: 6 }}>
              <PillButton
                label="Ir para Hoje na casa"
                height={48}
                onPress={done}
              />
            </View>
          </>
        ) : card ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pular o passeio"
              hitSlop={10}
              onPress={pause}
              style={tourStyles.kicker}
            >
              <Text style={[tourStyles.mono, { color: palette.muted }]}>
                {index + 1} DE {steps.length}
              </Text>
              <Text style={[tourStyles.mono, { color: palette.muted }]}>
                PULAR
              </Text>
            </Pressable>
            {card.seal ? (
              <View style={styles.seal}>
                <Text style={styles.sealText}>{card.seal}</Text>
              </View>
            ) : null}
            <Text style={[tourStyles.title, { color: palette.ink }]}>
              {card.title}
            </Text>
            <Text
              style={[
                text(14.5, 'Regular', 1.45),
                { color: palette.dark ? '#c9c7c0' : '#3a3a35' }
              ]}
            >
              {card.body}
            </Text>
            {card.hint ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  haptic.select()
                  card.hint?.run()
                }}
              >
                <Text
                  style={[
                    text(14.5, 'Bold', 1.3),
                    { color: palette.dark ? ACID : '#5b6d0c' }
                  ]}
                >
                  {`↳ ${card.hint.label}`}
                </Text>
              </Pressable>
            ) : null}
            <View style={tourStyles.foot}>
              <View style={tourStyles.dots}>
                {steps.map((s, i) => (
                  <View
                    key={s}
                    style={[
                      tourStyles.dot,
                      i === index
                        ? { width: 24, backgroundColor: palette.ink }
                        : { backgroundColor: palette.mark }
                    ]}
                  />
                ))}
              </View>
              <View style={styles.buttons}>
                {index > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={back}
                  >
                    <Text
                      style={[
                        text(14.5, 'SemiBold', 1.2),
                        { color: palette.muted }
                      ]}
                    >
                      Voltar
                    </Text>
                  </Pressable>
                ) : null}
                <PillButton
                  label={card.next ?? 'Próximo'}
                  height={40}
                  onPress={next}
                />
              </View>
            </View>
          </>
        ) : null}
      </Animated.View>
    </Animated.View>
  )
}

/* ─── Primeiros passos, em Hoje na casa ─── */

export function FirstSteps({ onTour }: { onTour: (resume: boolean) => void }) {
  const palette = usePalette()
  const g = useBarGuide()
  if (!g.novo || !g.ready || g.local.oculto) return null
  const done = g.items.filter((i) => i.done).length
  if (done === g.items.length) return null
  const resume = Boolean(g.local.vistos?.length) && !g.local.passeio
  const hide = () => {
    haptic.select()
    g.mark({ oculto: true })
  }
  return (
    <OwnerCard>
      <View style={styles.ppHead}>
        <Text style={[tourStyles.mono, { color: palette.muted, flex: 1 }]}>
          {`PRIMEIROS PASSOS · ${done} DE ${g.items.length}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Esconder primeiros passos"
          hitSlop={10}
          onPress={hide}
        >
          <Icon name="close" size={14} color={palette.muted} />
        </Pressable>
      </View>
      <Text style={[styles.ppTitle, { color: palette.ink }]}>
        O bar no ar, falta pouco
      </Text>
      <View style={{ gap: 10, paddingVertical: 6 }}>
        {g.items.map((item) => (
          <View key={item.id} style={styles.ppRow}>
            <View
              style={[
                styles.ppDot,
                item.done
                  ? { backgroundColor: ACID, borderColor: ACID }
                  : { borderColor: palette.line }
              ]}
            >
              {item.done ? <Icon name="check" size={12} color={INK} /> : null}
            </View>
            <Text
              style={[
                text(15, item.done ? 'Regular' : 'SemiBold', 1.3),
                { color: item.done ? palette.muted : palette.ink, flex: 1 }
              ]}
            >
              {GUIDE_LABELS[item.id]}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.ppFoot}>
        {g.local.passeio ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic.select()
              onTour(resume)
            }}
          >
            <HardShadow color="#7f9a12" offset={3} radius={999} />
            <View style={styles.ppCta}>
              <Text style={[text(15, 'Bold', 1.2), { color: INK }]}>
                {resume ? 'Continuar o passeio' : 'Conhecer o app'}
              </Text>
            </View>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" hitSlop={8} onPress={hide}>
          <Text style={[text(14.5, 'SemiBold', 1.2), { color: palette.muted }]}>
            Esconder
          </Text>
        </Pressable>
      </View>
    </OwnerCard>
  )
}

const styles = StyleSheet.create({
  seal: {
    alignSelf: 'flex-start',
    backgroundColor: ACID,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  sealText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    color: INK
  },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ppHead: { flexDirection: 'row', alignItems: 'center', paddingTop: 16 },
  ppTitle: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    marginTop: 4
  },
  ppRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ppDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ppFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingTop: 8,
    paddingBottom: 16
  },
  ppCta: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
