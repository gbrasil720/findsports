import { ROUTINE_STEPS, WANTS } from '@findsports_oficial/api/lib/pub-routine'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HardShadow } from '@/components/explore'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, Text, text, useStatusBar } from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * Sua rotina, a última pergunta (rodada 10, tela 6): o bar já está no ar;
 * jogos por mês, gasto médio por cliente e o que o dono quer da Onside, sem
 * dizer qual plano dá o quê. A indicação vem na tela seguinte, pela mesma
 * regra do cadastro do web (`recommendPlan`).
 */

export default function Rotina() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const [games, setGames] = useState(8)
  const [spend, setSpend] = useState(60)
  const [wants, setWants] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const save = useMutation(
    trpc.pub.updateRoutine.mutationOptions({
      onSuccess: (data) =>
        router.replace({
          pathname: '/plano-do-teste',
          params: { indicado: data.recommended.plan }
        }),
      onError: (error) =>
        setProblem(error.message || 'Não deu para salvar. Tente de novo.')
    })
  )

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 20,
          gap: 16
        }}
      >
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={10}
            onPress={() => router.back()}
          >
            <Icon name="back" size={22} color={palette.ink} />
          </Pressable>
          <Text style={[styles.mono, { color: palette.muted }]}>
            ÚLTIMA PERGUNTA
          </Text>
        </View>
        <View style={[styles.progress, { backgroundColor: palette.mark }]}>
          <View
            style={[
              styles.progressFill,
              { width: '92%', backgroundColor: palette.ink }
            ]}
          />
        </View>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: palette.ink }]}
        >
          {'SUA '}
          <Text style={{ color: palette.dark ? ACID : palette.live }}>
            ROTINA
          </Text>
        </Text>
        <Text style={[text(16, 'Regular', 1.45), { color: palette.muted }]}>
          Seu bar já está no ar. Conta como é a casa e a gente indica o plano do
          seu teste.
        </Text>
        <Stepper
          title="Jogos por mês"
          sub="Brasileirão, Champions, NBA…"
          value={String(games)}
          onMinus={() =>
            setGames((n) =>
              Math.max(ROUTINE_STEPS.games.min, n - ROUTINE_STEPS.games.step)
            )
          }
          onPlus={() =>
            setGames((n) =>
              Math.min(ROUTINE_STEPS.games.max, n + ROUTINE_STEPS.games.step)
            )
          }
        />
        <Stepper
          title="Gasto médio por cliente"
          sub="comida e bebida numa noite de jogo"
          value={`R$ ${spend}`}
          onMinus={() =>
            setSpend((n) =>
              Math.max(ROUTINE_STEPS.spend.min, n - ROUTINE_STEPS.spend.step)
            )
          }
          onPlus={() =>
            setSpend((n) =>
              Math.min(ROUTINE_STEPS.spend.max, n + ROUTINE_STEPS.spend.step)
            )
          }
        />
        <Text style={[styles.mono, { color: palette.muted }]}>
          O QUE VOCÊ QUER DA ONSIDE
        </Text>
        <View>
          <HardShadow color={palette.drop} offset={4} radius={20} />
          <View style={[styles.box, { backgroundColor: palette.card }]}>
            {WANTS.map((want, i) => {
              const on = wants.includes(want.id)
              return (
                <Pressable
                  key={want.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    haptic.select()
                    setWants((now) =>
                      on ? now.filter((w) => w !== want.id) : [...now, want.id]
                    )
                  }}
                  style={[
                    styles.want,
                    i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
                  ]}
                >
                  <View
                    style={[
                      styles.box2,
                      {
                        borderColor: palette.line,
                        backgroundColor: on ? palette.ink : 'transparent'
                      }
                    ]}
                  >
                    {on ? (
                      <Icon name="check" size={14} color={palette.bg} />
                    ) : null}
                  </View>
                  <Text
                    style={[
                      text(15.5, 'SemiBold', 1.3),
                      { color: palette.ink, flex: 1 }
                    ]}
                  >
                    {want.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
        {problem ? (
          <Text style={[text(14, 'SemiBold', 1.4), { color: palette.live }]}>
            {problem}
          </Text>
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.foot,
          { paddingBottom: insets.bottom + 10, backgroundColor: palette.bg }
        ]}
      >
        <Pressable
          accessibilityRole="button"
          disabled={save.isPending}
          onPress={() => save.mutate({ games, spend, wants: wants as never })}
        >
          <HardShadow color="#7f9a12" offset={4} radius={999} />
          <View style={[styles.cta, save.isPending && { opacity: 0.55 }]}>
            <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
              {save.isPending ? 'Calculando…' : 'Ver o plano indicado'}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  )
}

function Stepper({
  title,
  sub,
  value,
  onMinus,
  onPlus
}: {
  title: string
  sub: string
  value: string
  onMinus: () => void
  onPlus: () => void
}) {
  const palette = usePalette()
  return (
    <View>
      <HardShadow color={palette.drop} offset={4} radius={20} />
      <View style={[styles.stepper, { backgroundColor: palette.card }]}>
        <View style={{ flex: 1 }}>
          <Text style={[text(17, 'Bold', 1.25), { color: palette.ink }]}>
            {title}
          </Text>
          <Text style={[text(14, 'Regular', 1.3), { color: palette.muted }]}>
            {sub}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Menos ${title}`}
          onPress={() => {
            haptic.select()
            onMinus()
          }}
          style={[styles.round, { backgroundColor: palette.mark }]}
        >
          <Text style={[text(20, 'Bold', 1.1), { color: palette.ink }]}>−</Text>
        </Pressable>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.value, { color: palette.ink }]}
        >
          {value}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mais ${title}`}
          onPress={() => {
            haptic.select()
            onPlus()
          }}
          style={[styles.round, { backgroundColor: palette.mark }]}
        >
          <Text style={[text(20, 'Bold', 1.1), { color: palette.ink }]}>+</Text>
        </Pressable>
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
    letterSpacing: 1.1
  },
  progress: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  title: { fontFamily: 'Anton', fontSize: 44, marginVertical: -10.7 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 20
  },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center'
  },
  value: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 20,
    minWidth: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums']
  },
  box: { borderRadius: 20, paddingHorizontal: 16 },
  want: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14
  },
  box2: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12
  },
  cta: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
