/**
 * Better Fetch resolve o Promise em HTTP não-2xx e devolve `{ data, error }`.
 * Sem `throw: true`, o perfil tratava recusa do servidor como sucesso:
 * fechava a edição e invalidava a sessão mesmo com `error` preenchido.
 */
export const PROFILE_USER_THROW = {
  fetchOptions: { throw: true as const }
}

export async function persistProfileUser<T extends Record<string, unknown>>(
  updateUser: (input: T & typeof PROFILE_USER_THROW) => Promise<unknown>,
  fields: T
) {
  return updateUser({ ...fields, ...PROFILE_USER_THROW })
}
