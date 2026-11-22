/**
 * Nome da conta (`user.name`), num lugar só: o cadastro e o `/update-user`
 * do better-auth, o web e o app. O nome vai no e-mail de confirmação, que sai
 * do nosso remetente para qualquer endereço digitado: sem teto, ele carregava
 * um recado com link (phishing com remetente de verdade).
 * Não importa nada para poder ir ao navegador e ao app.
 */

export const USER_NAME_MAX = 80

// Quebra de linha, controle e os que viram o texto de lado (bidi).
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]/u
// URL, `www.` e domínio solto (`golpe.com`, que o cliente de e-mail vira
// link). Abreviação com ponto e espaço ("Sr. João", "J. R.") passa.
const LINK = /:\/\/|www\.|[\p{L}\p{N}-]\.[a-z]{2,}\b/iu

/** Frase da recusa, ou `null` quando o nome (já sem espaço nas pontas) vale. */
export function userNameRefusal(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Informe seu nome.'
  if (trimmed.length > USER_NAME_MAX)
    return `O nome pode ter até ${USER_NAME_MAX} caracteres.`
  if (CONTROL.test(trimmed))
    return 'O nome não pode ter quebra de linha nem caracteres especiais.'
  if (LINK.test(trimmed)) return 'O nome não pode ter endereço de site.'
  return null
}
