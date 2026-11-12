import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OwnerCard, OwnerLabel, OwnerRow } from '@/components/bar-owner'
import { HardShadow } from '@/components/explore'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  ErrorState,
  errorMessage,
  Icon,
  INK,
  Text,
  TextInput,
  text,
  useStatusBar
} from '@/components/ui'
import {
  LATE_LABELS,
  type LateStatus,
  retryableCodes,
  shortDate,
  splitLateCodes
} from '@/lib/bar-owner'
import { formatTime } from '@/lib/explore'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Lançar códigos da comanda (WEB-412; decisão do dono, 11/11/2026: o app faz
 * o que o painel faz). Bar Elite que confere "pela comanda": o garçom anota o
 * código e o dono lança aqui até 48 h depois do jogo. "Faltou lançar?" diz
 * pelo nome quem marcou e ainda não foi lançado, por jogo
 * (`reservationValidation.notLogged`); lançar é `logLate`, até 80 por vez, e
 * cada código volta com o que aconteceu. O que dá para corrigir volta para a
 * caixa. Cada um conta como visita no dia do jogo.
 */

const MAX_CODES = 80

export default function Comanda() {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const [draft, setDraft] = useState('')
  const [results, setResults] = useState<
    { code: string; status: LateStatus; guestName?: string }[] | null
  >(null)
  const missing = useQuery(trpc.reservationValidation.notLogged.queryOptions())
  const log = useMutation(
    trpc.reservationValidation.logLate.mutationOptions({
      onSuccess: (data) => {
        const rows = data as {
          code: string
          status: LateStatus
          guestName?: string
        }[]
        setResults(rows)
        setDraft(retryableCodes(rows).join('\n'))
        haptic[
          rows.some((r) => r.status === 'logged') ? 'success' : 'warning'
        ]()
        queryClient.invalidateQueries()
      },
      onError: () => haptic.error()
    })
  )
  const codes = splitLateCodes(draft)
  const over = codes.length > MAX_CODES
  const logged = results?.filter((r) => r.status === 'logged') ?? []
  const problems = results?.filter((r) => r.status !== 'logged') ?? []
  const now = Date.now()

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 16,
          gap: 14
        }}
      >
        <BackButton />
        <View>
          <Text style={[styles.kicker, { color: palette.muted }]}>
            ATÉ 48 H DEPOIS DO JOGO
          </Text>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.title, { color: palette.ink }]}
          >
            Lançar a comanda
          </Text>
        </View>
        <Text style={[text(15, 'Regular', 1.45), { color: palette.muted }]}>
          O garçom anotou o código na comanda: digite os códigos, um por linha.
          Cada um conta como visita no dia do jogo.
        </Text>

        {missing.isError ? (
          <ErrorState
            kind="block"
            error={missing.error}
            onRetry={() => missing.refetch()}
            retrying={missing.isFetching}
          />
        ) : missing.data?.length ? (
          <>
            <OwnerLabel>Faltou lançar?</OwnerLabel>
            <OwnerCard>
              {missing.data.map((game, index) => (
                <OwnerRow key={game.id} first={index === 0}>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text
                      numberOfLines={2}
                      style={[text(16, 'Bold', 1.25), { color: palette.ink }]}
                    >
                      {`${gameTitle({ ...game, participants: [] })} · ${shortDate(game.startsAt).toLowerCase()} ${formatTime(game.startsAt)}`}
                    </Text>
                    <Text
                      style={[
                        text(14.5, 'Regular', 1.4),
                        { color: palette.ink }
                      ]}
                    >
                      {game.names.join(', ')}
                    </Text>
                    <Text
                      style={[
                        text(13, 'Regular', 1.3),
                        { color: palette.muted }
                      ]}
                    >
                      {`Dá para lançar até ${shortDate(game.closesAt).toLowerCase()} ${formatTime(game.closesAt)}.`}
                    </Text>
                  </View>
                </OwnerRow>
              ))}
            </OwnerCard>
          </>
        ) : missing.data ? (
          <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
            Ninguém esperando lançamento nos jogos das últimas 48 h.
          </Text>
        ) : null}

        <OwnerLabel>Códigos anotados</OwnerLabel>
        <View
          style={[
            styles.area,
            {
              backgroundColor: palette.card,
              borderColor: over ? palette.ink : palette.line
            }
          ]}
        >
          <TextInput
            accessibilityLabel="Códigos anotados, um por linha"
            multiline
            value={draft}
            onChangeText={(value) => {
              setDraft(value)
              setResults(null)
            }}
            placeholder={'K7M·R4P\nH3X·W9T'}
            placeholderTextColor={palette.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            style={[styles.input, { color: palette.ink }]}
          />
        </View>
        <Text style={[text(13, 'Regular', 1.35), { color: palette.muted }]}>
          {over
            ? `Até ${MAX_CODES} códigos por vez. Tire ${codes.length - MAX_CODES}.`
            : 'Não precisa do ponto do meio nem de maiúscula.'}
        </Text>
        {log.error ? (
          <Text
            accessibilityRole="alert"
            style={[text(14, 'SemiBold', 1.4), { color: palette.ink }]}
          >
            {errorMessage(log.error, 'Não foi possível lançar. Tente de novo.')}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: !codes.length || over || log.isPending
          }}
          disabled={!codes.length || over || log.isPending}
          onPress={() => log.mutate({ codes })}
        >
          <HardShadow color="#7f9a12" offset={4} radius={999} />
          <View
            style={[
              styles.cta,
              (!codes.length || over || log.isPending) && { opacity: 0.55 }
            ]}
          >
            <Text style={[text(17, 'Bold', 1.2), { color: INK }]}>
              {log.isPending
                ? 'Lançando…'
                : codes.length
                  ? `Lançar ${codes.length} ${codes.length === 1 ? 'código' : 'códigos'}`
                  : 'Digite os códigos acima'}
            </Text>
          </View>
        </Pressable>

        {results ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 10 }}>
            {logged.length ? (
              <>
                <OwnerLabel>
                  {logged.length === 1
                    ? '1 código lançado'
                    : `${logged.length} códigos lançados`}
                </OwnerLabel>
                <OwnerCard>
                  {logged.map((r, i) => (
                    <Result
                      key={r.code}
                      first={i === 0}
                      code={r.code}
                      line={r.guestName ?? 'Lançado'}
                      ok
                      now={now}
                    />
                  ))}
                </OwnerCard>
              </>
            ) : null}
            {problems.length ? (
              <>
                <OwnerLabel>Não lançados</OwnerLabel>
                <OwnerCard>
                  {problems.map((r, i) => (
                    <Result
                      key={r.code}
                      first={i === 0}
                      code={r.code}
                      line={LATE_LABELS[r.status]}
                      now={now}
                    />
                  ))}
                </OwnerCard>
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function Result({
  code,
  line,
  ok,
  first
}: {
  code: string
  line: string
  ok?: boolean
  first: boolean
  now: number
}) {
  const palette = usePalette()
  return (
    <OwnerRow first={first}>
      <View
        style={[styles.mark, { backgroundColor: ok ? ACID : palette.mark }]}
      >
        <Icon
          name={ok ? 'check' : 'close'}
          size={14}
          color={ok ? INK : palette.ink}
        />
      </View>
      <Text style={[styles.code, { color: palette.ink }]}>
        {code.toUpperCase()}
      </Text>
      <Text
        style={[text(14, 'Regular', 1.35), { color: palette.muted, flex: 1 }]}
      >
        {line}
      </Text>
    </OwnerRow>
  )
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 8
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 46,
    textTransform: 'uppercase',
    marginVertical: -11
  },
  area: { borderRadius: 20, borderWidth: 1.5, padding: 14 },
  input: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 18,
    minHeight: 120,
    textAlignVertical: 'top'
  },
  cta: {
    height: 56,
    borderRadius: 999,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  code: { fontFamily: 'GeistMono-SemiBold', fontSize: 15, minWidth: 70 }
})
