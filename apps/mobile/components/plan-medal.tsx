import Svg, { G, Path } from 'react-native-svg'

/*
 * As medalhas dos planos (rodada 10, "Plano e cobrança"; as mesmas do web):
 * chama no Starter, estrela no Pro, coroa no Elite. Acid com contorno de
 * tinta e a sombra dura deslocada, no quadro de 256 do desenho.
 */

const INK = '#121210'
const ACID = '#C8F52A'
const PAPER = '#F2F0E7'

const FLAME =
  'M188 24C143 28 107 50 96 85C90 104 88 119 72 128C66 113 69 99 78 83C43 103 34 131 43 158C47 171 49 178 42 189C31 207 48 228 76 234C118 244 173 227 198 194C225 159 219 126 203 103C204 134 194 146 178 154C183 129 172 112 166 96C154 65 164 43 188 24Z'
const STAR =
  'M133 28L153 98L234 89L177 142L196 220L128 182L65 239L76 154L20 119L106 107Z'
const CROWN =
  'M24 78L88 127L128 26L170 124L236 66L207 169L207 213Q127 242 47 218L47 175Z'

export function PlanMedal({
  plan,
  size = 48
}: {
  plan: 'starter' | 'pro' | 'elite'
  size?: number
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      {plan === 'starter' ? (
        <G>
          <Path
            d={FLAME}
            transform="translate(3 5)"
            fill={INK}
            stroke={INK}
            strokeWidth={10}
            strokeLinejoin="round"
          />
          <Path
            d={FLAME}
            fill={ACID}
            stroke={INK}
            strokeWidth={7}
            strokeLinejoin="round"
          />
          <Path
            fill={PAPER}
            d="M165 40C135 53 117 73 109 97C102 117 97 131 81 144C111 133 123 110 128 91C134 68 147 52 165 40Z"
          />
          <Path
            fill={PAPER}
            d="M202 125C201 142 193 153 181 161C194 160 207 149 202 125Z"
          />
          <Path
            fill={INK}
            d="M137 146C137 173 120 178 116 195C124 195 132 191 138 184C143 202 129 221 109 224C88 227 70 216 69 201C68 189 76 179 87 168C83 184 88 192 96 194C97 176 121 166 137 146Z"
          />
          <Path
            fill={PAPER}
            d="M128 165C123 183 103 187 101 207C92 207 86 202 83 196C78 209 91 219 106 217C121 216 132 205 132 196L116 203C115 192 128 179 128 165Z"
          />
        </G>
      ) : plan === 'pro' ? (
        <G>
          <G fill={ACID} stroke={INK} strokeWidth={7} strokeLinejoin="round">
            <Path d="M69 35L85 25L100 64L87 70Z" />
            <Path d="M53 72L61 61L82 79L75 90Z" />
          </G>
          <Path
            d={STAR}
            transform="translate(2 6)"
            fill={INK}
            stroke={INK}
            strokeWidth={9}
            strokeLinejoin="round"
          />
          <Path
            d={STAR}
            fill={ACID}
            stroke={INK}
            strokeWidth={7}
            strokeLinejoin="round"
          />
          <Path fill={PAPER} d="M134 50L144 112L208 99L150 123Z" />
          <Path fill={PAPER} d="M91 180L82 209L111 186L95 191Z" />
        </G>
      ) : (
        <G>
          <Path
            d={CROWN}
            transform="translate(1 6)"
            fill={INK}
            stroke={INK}
            strokeWidth={10}
            strokeLinejoin="round"
          />
          <Path
            d={CROWN}
            fill={ACID}
            stroke={INK}
            strokeWidth={8}
            strokeLinejoin="round"
          />
          <Path
            d="M47 175Q125 148 207 169M47 200Q125 174 207 192"
            fill="none"
            stroke={INK}
            strokeWidth={7}
            strokeLinecap="round"
          />
          <Path fill={PAPER} d="M128 47L117 108L98 128Z" />
          <Path fill={PAPER} d="M37 95L70 128L61 151Z" />
          <Path fill={PAPER} d="M219 89L207 121L188 126Z" />
          <Path fill={PAPER} d="M59 179Q106 164 155 169Q105 171 60 189Z" />
          <Path
            d="M64 215Q129 232 194 211"
            fill="none"
            stroke={INK}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </G>
      )}
    </Svg>
  )
}
