import {
  readRoutine,
  recommendPlan
} from '@findsports_oficial/api/lib/pub-routine'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  FadeIn,
  LinearTransition,
  useReducedMotion
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { alertFailure } from '@/components/bar-owner'
import { HardShadow } from '@/components/explore'
import { EASE, haptic, SWAP } from '@/components/motion'
import { PlanMedal } from '@/components/plan-medal'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { dayMonth } from '@/lib/bar-owner'
import { PLAN_NAMES, PLAN_PRICES, type Plan, useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Escolha seu plano do teste (rodada 10, tela 6): 90 dias grátis em qualquer
 * um, trocando quando quiser. O indicado pela rotina vem aberto, com o porquê
 * e o que dá; os outros numa linha. Escolher é `pub.changeTrialPlan` (WEB-358);
 * a compra pela App Store fica desligada (dono, 11/11/2026), então o botão
 * só confirma o plano do teste.
 *
 * Movimento: a opção marcada abre no lugar (altura e opacidade, 200 ms); o
 * botão troca o nome do plano.
 */

const OPEN = LinearTransition.duration(200).easing(EASE)
const OPEN_IN = FadeIn.duration(200).easing(EASE)
const PLANS: Plan[] = ['elite', 'pro', 'starter']
const PITCH: Record<Plan, { line: string; perks: string[]; why: string }> = {
  elite: {
    line: 'Pra ser referência na cidade',
    perks: [
      'Quem vai assistir, jogo a jogo',
      'Oferta da casa e código do balcão',
      'Topo da busca nos clássicos',
      'Selo Elite no mapa e no perfil'
    ],
    why: 'Quem vai, jogo a jogo, só o Elite mostra. E a oferta que você criou só aparece nele.'
  },
  pro: {
    line: 'Pra lotar nos clássicos',
    perks: [
      'Jogos ilimitados',
      'Cardápio e preços',
      'Galeria de fotos',
      'De onde vêm as visitas'
    ],
    why: 'Você passa mais jogos do que o Starter cadastra, e quer aparecer quando buscam o seu time.'
  },
  starter: {
    line: 'Pra começar a aparecer',
    perks: [
      'Até 5 jogos por mês',
      'Contato direto',
      'Página do bar',
      'Capa no mapa'
    ],
    why: 'Poucos jogos por mês e sem extras: o Starter dá conta.'
  }
}

export default function PlanoDoTeste() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  useStatusBar('light')
  const { indicado } = useLocalSearchParams<{ indicado?: Plan }>()
  // O indicado: o que a rotina acabou de mandar, senão o da rotina gravada
  // no bar (tela aberta pelo plano), senão o Elite.
  const owner = useOwnerBar()
  const routine = readRoutine(owner.bar?.routine)
  const recommended: Plan =
    indicado && PLAN_NAMES[indicado]
      ? indicado
      : routine
        ? recommendPlan(routine).plan
        : 'elite'
  // O indicado chega com o bar: até a pessoa escolher, vale ele.
  const [picked, setChosen] = useState<Plan | null>(null)
  const chosen = picked ?? recommended
  const sub = useQuery(trpc.pub.getMySubscription.queryOptions())
  const end = sub.data?.currentPeriodEnd
    ? new Date(sub.data.currentPeriodEnd)
    : null
  const change = useMutation(
    trpc.pub.changeTrialPlan.mutationOptions({
      onError: alertFailure('Não deu para trocar o plano do teste'),
      onSuccess: () => {
        haptic.success()
        queryClient.invalidateQueries()
        router.replace('/perfil-completo')
      }
    })
  )

  return (
    <View style={{ flex: 1, backgroundColor: INK }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 150,
          paddingHorizontal: 18,
          gap: 14
        }}
      >
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            hitSlop={10}
            onPress={() => router.replace('/casa')}
          >
            <Icon name="close" size={22} color={PAPER} />
          </Pressable>
          <Text
            style={styles.mono}
          >{`TESTE${end ? ` · ATÉ ${dayMonth(end).toUpperCase()}` : ''}`}</Text>
        </View>
        <View accessible accessibilityRole="header">
          <Text style={[styles.title, { color: PAPER }]}>ESCOLHA SEU</Text>
          <Text style={[styles.title, { color: ACID }]}>PLANO DO TESTE</Text>
        </View>
        <Text style={[text(16, 'Regular', 1.45), { color: '#c9c7c0' }]}>
          90 dias grátis em qualquer um. Troca quando quiser durante o teste.
        </Text>
        {PLANS.map((plan) => {
          const on = chosen === plan
          const pitch = PITCH[plan]
          return (
            <Animated.View key={plan} layout={reduced ? undefined : OPEN}>
              {plan === recommended ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>✦ RECOMENDADO PARA VOCÊ</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  haptic.select()
                  setChosen(plan)
                }}
                style={[
                  styles.card,
                  { borderColor: on ? ACID : 'transparent' }
                ]}
              >
                <View style={styles.row}>
                  <PlanMedal plan={plan} size={46} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{PLAN_NAMES[plan]}</Text>
                    <Text
                      style={[text(14, 'Regular', 1.3), { color: '#aaa9a4' }]}
                    >
                      {pitch.line}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.price}>
                      {`R$ ${PLAN_PRICES[plan].founder}`}
                      <Text style={styles.per}>/mês</Text>
                    </Text>
                    <Text
                      style={styles.old}
                    >{`R$ ${PLAN_PRICES[plan].table}`}</Text>
                  </View>
                  <View style={[styles.radio, on && { borderColor: ACID }]}>
                    {on ? <View style={styles.radioDot} /> : null}
                  </View>
                </View>
                {on ? (
                  <Animated.View
                    entering={reduced ? undefined : OPEN_IN}
                    style={{ gap: 12 }}
                  >
                    <View style={styles.perks}>
                      {pitch.perks.map((perk) => (
                        <View key={perk} style={styles.perk}>
                          <Icon name="check" size={14} color={ACID} />
                          <Text
                            style={[
                              text(14, 'Regular', 1.3),
                              { color: '#c9c7c0', flex: 1 }
                            ]}
                          >
                            {perk}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.why}>
                      <Text
                        style={[text(15, 'Bold', 1.3), { color: ACID }]}
                      >{`Por que o ${PLAN_NAMES[plan]}?`}</Text>
                      <Text
                        style={[
                          text(14.5, 'Regular', 1.4),
                          { color: '#c9c7c0' }
                        ]}
                      >
                        {pitch.why}
                      </Text>
                    </View>
                  </Animated.View>
                ) : (
                  <Text
                    style={[
                      text(14, 'Regular', 1.3),
                      { color: '#8a8984', marginLeft: 58 }
                    ]}
                  >
                    {pitch.perks.slice(0, 2).join(' · ')}
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          )
        })}
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable
          accessibilityRole="button"
          disabled={change.isPending}
          onPress={() => change.mutate({ plan: chosen })}
        >
          <HardShadow color="#7f9a12" offset={4} radius={999} />
          <View style={[styles.cta, change.isPending && { opacity: 0.55 }]}>
            {/* O nome do plano cruza em 150 ms quando a escolha muda. */}
            <Animated.Text
              key={change.isPending ? 'pending' : chosen}
              entering={reduced ? undefined : SWAP}
              maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
              style={[text(18, 'Bold', 1.2), { color: INK }]}
            >
              {change.isPending
                ? 'Trocando…'
                : `Testar o ${PLAN_NAMES[chosen]} · R$ 0 hoje`}
            </Animated.Text>
          </View>
        </Pressable>
        <Text
          style={[
            text(12.5, 'Regular', 1.4),
            { color: '#aaa9a4', textAlign: 'center' }
          ]}
        >
          {`Sem cartão até ${end ? dayMonth(end) : 'o fim do teste'}. Para continuar depois, a assinatura chega em breve pelo app.`}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 32
  },
  mono: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12.5,
    letterSpacing: 1.1,
    color: '#aaa9a4'
  },
  title: { fontFamily: 'Anton', fontSize: 44, marginVertical: -10.7 },
  badge: {
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginBottom: -12,
    zIndex: 2,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: ACID,
    justifyContent: 'center'
  },
  badgeText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.8,
    color: INK
  },
  card: {
    backgroundColor: '#1c1c18',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2.5,
    padding: 16,
    gap: 12
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: {
    fontFamily: 'Anton',
    fontSize: 30,
    color: PAPER,
    textTransform: 'uppercase',
    marginVertical: -7.3
  },
  price: { fontFamily: 'Anton', fontSize: 26, color: PAPER },
  per: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, color: '#aaa9a4' },
  old: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    color: '#8a8984',
    textDecorationLine: 'line-through'
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#55554f',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: ACID },
  perks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  perk: {
    width: '48%',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(241,238,230,.05)',
    borderRadius: 12,
    padding: 10
  },
  why: {
    backgroundColor: 'rgba(201,241,53,.12)',
    borderRadius: 14,
    padding: 12,
    gap: 4
  },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 8,
    backgroundColor: INK
  },
  cta: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
