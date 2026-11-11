import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import {
  AccountField,
  AccountNote,
  AccountPage
} from '@/components/account-page'
import { ErrorText, haptic } from '@/components/motion'
import { Skeleton } from '@/components/states'
import { usePalette } from '@/components/theme'
import { useTurnstile } from '@/components/turnstile'
import {
  ACID,
  authErrorMessage,
  Icon,
  INK,
  LIVE,
  PillButton,
  Text,
  text
} from '@/components/ui'
import { settleAuth } from '@/lib/auth-attempt'
import { authClient } from '@/lib/auth-client'
import { deviceLabel, lastSeen } from '@/lib/settings'

/*
 * "Seus aparelhos" da Conta (rodada 8, tela 6c): cada aparelho com quando foi
 * visto; o atual leva o selo "ESTE" e não tem "Sair". Um botão para sair dos
 * outros de uma vez e a dica de trocar a senha se algum for estranho. Abaixo,
 * as últimas entradas (quando cada sessão começou).
 *
 * A lista pede uma entrada de menos de um dia (`freshAge` do better-auth):
 * fora disso, a tela pede a senha ali mesmo, em vez do erro do servidor.
 * A cidade de cada aparelho, que o desenho mostra, a Onside não guarda.
 */

type Session = {
  id: string
  userAgent?: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

export default function Devices() {
  const router = useRouter()
  const palette = usePalette()
  const session = authClient.useSession()
  const user = session.data?.user
  const current = session.data?.session.id
  const sessions = useQuery({
    queryKey: ['account-sessions'],
    queryFn: async () => {
      const result = await authClient.listSessions()
      if (result.error) throw result.error
      return (result.data ?? []) as Session[]
    },
    retry: false
  })
  const now = Date.now()
  const list = [...(sessions.data ?? [])].sort(
    (a, b) =>
      Number(b.id === current) - Number(a.id === current) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
  const others = list.filter((item) => item.id !== current)

  const revoke = async (ids: string[]) => {
    await Promise.all(
      ids.map((id) =>
        authClient
          .$fetch('/revoke-session-by-id', { method: 'POST', body: { id } })
          .catch(() => {})
      )
    )
    haptic.success()
    sessions.refetch()
  }
  const askOne = (item: Session) =>
    Alert.alert(
      `Sair do ${deviceLabel(item.userAgent).name}?`,
      'Esse aparelho vai precisar entrar de novo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => revoke([item.id]) }
      ]
    )
  const askAll = () =>
    Alert.alert(
      `Sair dos outros ${others.length}?`,
      'Eles vão precisar entrar de novo. Este continua conectado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair de todos',
          style: 'destructive',
          onPress: () => revoke(others.map((item) => item.id))
        }
      ]
    )

  if (sessions.isError) return <Confirm onDone={() => sessions.refetch()} />

  return (
    <AccountPage
      title="Seus "
      accent="aparelhos"
      cta={
        others.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={askAll}
            style={({ pressed }) => [
              styles.inkButton,
              { backgroundColor: palette.ink },
              pressed && { transform: [{ scale: 0.98 }] }
            ]}
          >
            <Text style={[text(16, 'Bold', 1.2), { color: palette.bg }]}>
              Sair{' '}
              {others.length === 1 ? 'do outro' : `dos outros ${others.length}`}
            </Text>
          </Pressable>
        ) : null
      }
    >
      {sessions.isPending ? (
        <Skeleton count={1} />
      ) : (
        <>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            {list.map((item, index) => {
              const device = deviceLabel(item.userAgent)
              const mine = item.id === current
              return (
                <View
                  key={item.id}
                  style={[
                    styles.row,
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.line
                    }
                  ]}
                >
                  <View
                    style={[styles.iconBox, { backgroundColor: palette.mark }]}
                  >
                    <Icon
                      name={device.computer ? 'tv' : 'you'}
                      size={20}
                      color={palette.ink}
                      accent={ACID}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <Text
                        numberOfLines={1}
                        style={[
                          text(15, 'SemiBold', 1.25),
                          { color: palette.ink, flexShrink: 1 }
                        ]}
                      >
                        {device.name}
                      </Text>
                      {mine ? (
                        <View style={styles.this}>
                          <Text style={styles.thisText}>ESTE</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        text(13, 'Regular', 1.3),
                        { color: palette.muted }
                      ]}
                    >
                      {mine
                        ? 'agora'
                        : `visto ${lastSeen(item.updatedAt, now)}`}
                    </Text>
                  </View>
                  {mine ? null : (
                    <Text
                      accessibilityRole="button"
                      onPress={() => askOne(item)}
                      suppressHighlighting
                      style={[
                        text(13, 'SemiBold', 1.2),
                        styles.out,
                        { color: palette.ink }
                      ]}
                    >
                      Sair
                    </Text>
                  )}
                </View>
              )
            })}
          </View>
          <AccountNote icon="shield">
            Não reconhece um deles? Saia dele e{' '}
            <Text
              onPress={() => router.push('/senha')}
              style={[
                text(13, 'Bold', 1.45),
                { textDecorationLine: 'underline' }
              ]}
            >
              troque a senha
            </Text>
            .
          </AccountNote>
          <Text style={[styles.kicker, { color: palette.muted }]}>
            ÚLTIMAS ENTRADAS
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            {[...list]
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime()
              )
              .map((item, index) => {
                const at = new Date(item.createdAt)
                const seen = lastSeen(at, now)
                const today = seen === 'agora' || seen.startsWith('hoje')
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.row,
                      index > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: palette.line
                      }
                    ]}
                  >
                    <Text style={[styles.when, { color: palette.muted }]}>
                      {today
                        ? 'HOJE'
                        : at.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            timeZone: 'America/Sao_Paulo'
                          })}
                      {'\n'}
                      {at.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'America/Sao_Paulo'
                      })}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          text(14, 'SemiBold', 1.25),
                          { color: palette.ink }
                        ]}
                      >
                        {deviceLabel(item.userAgent).name}
                      </Text>
                      <Text
                        style={[
                          text(12.5, 'Regular', 1.3),
                          { color: palette.muted }
                        ]}
                      >
                        {user?.twoFactorEnabled
                          ? 'senha e código do autenticador'
                          : 'senha'}
                      </Text>
                    </View>
                  </View>
                )
              })}
          </View>
          {user?.twoFactorEnabled ? (
            <View style={styles.ok}>
              <Icon name="shield" size={22} color={INK} />
              <View style={{ flex: 1 }}>
                <Text style={[text(14, 'Bold', 1.3), { color: INK }]}>
                  Duas etapas ligada
                </Text>
                <Text style={[text(12.5, 'Regular', 1.3), { color: INK }]}>
                  uma senha vazada não basta para entrar
                </Text>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/duas-etapas')}
              style={[
                styles.card,
                styles.row,
                { backgroundColor: palette.card, shadowColor: palette.drop }
              ]}
            >
              <Icon name="shield" size={22} color={palette.ink} />
              <View style={{ flex: 1 }}>
                <Text style={[text(14, 'Bold', 1.3), { color: palette.ink }]}>
                  Ligue as duas etapas
                </Text>
                <Text
                  style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
                >
                  uma senha vazada deixa de bastar para entrar
                </Text>
              </View>
              <Icon name="next" size={16} color={palette.muted} />
            </Pressable>
          )}
        </>
      )}
    </AccountPage>
  )
}

/**
 * "Confirme que é você" (6c, entrada de mais de um dia): a senha ali mesmo
 * abre uma entrada nova, e a lista aparece.
 */
function Confirm({ onDone }: { onDone: () => void }) {
  const palette = usePalette()
  const router = useRouter()
  const user = authClient.useSession().data?.user
  const turnstile = useTurnstile()
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (pending || !user) return
    setError(null)
    setPending(true)
    const result = await settleAuth(
      authClient.signIn.email({
        email: user.email,
        password,
        fetchOptions: turnstile.fetchOptions
      })
    )
    turnstile.reset()
    setPending(false)
    if (result.error)
      return setError(
        result.error.code === 'INVALID_EMAIL_OR_PASSWORD'
          ? 'A senha não confere.'
          : authErrorMessage(result.error, 'Não deu certo. Tente de novo.')
      )
    if (result.data && 'twoFactorRedirect' in result.data) {
      router.push('/two-factor')
      return
    }
    haptic.success()
    onDone()
  }
  return (
    <AccountPage
      title="Seus "
      accent="aparelhos"
      cta={
        <PillButton
          label={pending ? 'Conferindo…' : 'Confirmar e ver aparelhos'}
          busy={pending}
          onPress={submit}
        />
      }
    >
      <View
        style={[
          styles.confirm,
          { backgroundColor: palette.card, shadowColor: palette.drop }
        ]}
      >
        <Icon name="lock" size={40} color={palette.ink} accent={LIVE} />
        <Text style={[styles.confirmTitle, { color: palette.ink }]}>
          Confirme que é você
        </Text>
        <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
          A lista de aparelhos pede uma entrada de menos de um dia. Confirme a
          senha e ela abre.
        </Text>
      </View>
      {user ? (
        <View
          style={[
            styles.me,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={[styles.meName, { color: palette.ink }]}
            >
              {user.name}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.meMail, { color: palette.muted }]}
            >
              {user.email}
            </Text>
          </View>
        </View>
      ) : null}
      <AccountField
        label="Senha"
        autoComplete="current-password"
        textContentType="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      <AccountNote icon="shield">
        Pedimos porque daqui dá para tirar outros aparelhos da conta. Vale por
        um dia.
      </AccountNote>
      {error ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>{error}</ErrorText>
      ) : null}
      {turnstile.widget}
    </AccountPage>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    minHeight: 52
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  this: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: ACID
  },
  thisText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.66,
    color: INK
  },
  out: { textDecorationLine: 'underline' },
  kicker: {
    fontFamily: 'GeistMono-Bold',
    fontSize: 13,
    letterSpacing: 0.78,
    marginBottom: -4
  },
  when: {
    width: 46,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    lineHeight: 14.4
  },
  ok: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: ACID
  },
  inkButton: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  confirm: {
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 18,
    gap: 10,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  // Anton 26: margem negativa no lugar do entrelinha curto.
  confirmTitle: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    marginVertical: -6.3
  },
  me: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: INK
  },
  avatarText: { fontFamily: 'Anton', fontSize: 22, color: INK },
  // Anton 22: margem negativa no lugar do entrelinha curto.
  meName: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase',
    marginVertical: -5.3
  },
  meMail: { fontFamily: 'GeistMono-SemiBold', fontSize: 13, marginTop: 4 }
})
