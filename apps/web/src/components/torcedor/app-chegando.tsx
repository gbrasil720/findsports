/*
 * "O app da Onside está chegando" (`.appc` do protótipo). O "Me avise" pede um
 * aviso por e-mail que o servidor ainda não guarda: fica "em breve", em vez de
 * prometer um e-mail que não sai.
 */
export function AppChegando() {
  return (
    <div className="appc">
      <span className="ph2">
        <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true">
          <circle
            cx="14"
            cy="14"
            r="10.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.2"
          />
          <circle cx="22.4" cy="22.6" r="4.6" fill="#e8320c" />
        </svg>
      </span>
      <span>
        <b>O app da Onside está chegando</b>
        <span>Tudo o que você faz aqui continua lá, com a mesma conta.</span>
      </span>
      <span className="soonb">AVISO EM BREVE</span>
    </div>
  )
}
