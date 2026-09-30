/**
 * Código de reserva e chegada (WEB-126): o que a página de validação do bar e
 * a API precisam saber igual.
 *
 * Vive no pacote do banco pelo mesmo motivo de `house-offer.ts`: o CHECK da
 * coluna `reservation_code.code`, o procedimento que resolve o código e o
 * campo da tela usam o mesmo formato. Este arquivo não importa nada do Drizzle
 * para poder ir ao navegador.
 */

/** Formato do código: maiúsculas e dígitos, curto o bastante para ditar. */
export const RESERVATION_CODE_PATTERN = '^[A-Z0-9]{4,12}$'

/**
 * Tamanho do código na página de validação: o campo tem uma casa por
 * caractere, e casa exige número fixo. O formato da coluna aceita de 4 a 12;
 * quem define o tamanho emitido é a geração do código (WEB-124), que precisa
 * usar este mesmo número.
 */
export const RESERVATION_CODE_LENGTH = 6

const RESERVATION_CODE_REGEX = new RegExp(RESERVATION_CODE_PATTERN)

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
// Maior múltiplo do alfabeto que cabe num byte: bytes acima disso são
// descartados, senão `byte % 36` favoreceria os primeiros caracteres.
const UNBIASED_BYTE_LIMIT = 256 - (256 % CODE_ALPHABET.length)

/**
 * Código novo para uma reserva (WEB-124), com `RESERVATION_CODE_LENGTH`
 * caracteres do gerador criptográfico. Único entre os ativos só o banco
 * garante: quem grava tenta de novo quando esbarra no índice.
 */
export function generateReservationCode(): string {
  let code = ''
  while (code.length < RESERVATION_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < UNBIASED_BYTE_LIMIT && code.length < RESERVATION_CODE_LENGTH)
        code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
    }
  }
  return code
}

/**
 * Forma gravada do que foi digitado: sem espaço, sem hífen, em maiúsculas.
 * Quem lê o código do celular do torcedor digita "ab3-k9 x" sem errar nada —
 * separador e caixa não fazem parte do código.
 */
export function normalizeReservationCode(input: string): string {
  return input.replace(/[\s\-_.]/g, '').toUpperCase()
}

/** Recebe o código JÁ normalizado. */
export function isReservationCodeShaped(code: string): boolean {
  return RESERVATION_CODE_REGEX.test(code)
}

/** Código completo para a página de validação. Recebe o código normalizado. */
export function isReservationCodeComplete(code: string): boolean {
  return (
    code.length === RESERVATION_CODE_LENGTH && isReservationCodeShaped(code)
  )
}

/**
 * Por quanto tempo uma chegada registrada pode ser desfeita. Curto de
 * propósito: desfazer corrige o toque errado de agora, não reescreve o
 * comparecimento de ontem.
 */
export const ARRIVAL_UNDO_WINDOW_MS = 45_000
