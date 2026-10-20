const ONSIDE_ICON_SRC = '/onside-icone-preto.png'
const ONSIDE_WORDMARK_SRC = '/onside-wordmark-paper.png'
/**
 * O wordmark aparece com 28 a 32 px de altura em toda tela; o arquivo cheio
 * (845×256, também o logo dos e-mails) é 6x isso. Por densidade, cada tela
 * baixa a altura de 32 px vezes a própria densidade.
 */
const ONSIDE_WORDMARK_SRCSET = [32, 64, 96]
  .map((altura, i) => `/onside-wordmark-paper-${altura}.png ${i + 1}x`)
  .join(', ')

type MarkProps = {
  className?: string
  size?: number
}

export function OnsideMark({ className = '', size = 44 }: MarkProps) {
  return (
    // biome-ignore lint/performance/noImgElement: static public brand asset
    <img
      className={`onside-brand-mark ${className}`.trim()}
      src={ONSIDE_ICON_SRC}
      alt=""
      width={size}
      height={size}
      decoding="async"
      aria-hidden="true"
    />
  )
}

type BrandProps = {
  className?: string
  /** Visual treatment for dark (ink) backgrounds */
  onInk?: boolean
  wordmarkWidth?: number
  wordmarkHeight?: number
}

export function OnsideBrand({
  className = '',
  onInk = false,
  wordmarkWidth = 166,
  wordmarkHeight = 50
}: BrandProps) {
  return (
    <span
      className={`onside-brand${onInk ? ' onside-brand-on-ink' : ''} ${className}`.trim()}
      translate="no"
    >
      {/* biome-ignore lint/performance/noImgElement: static public brand asset */}
      <img
        className="onside-brand-wordmark"
        src={ONSIDE_WORDMARK_SRC}
        srcSet={ONSIDE_WORDMARK_SRCSET}
        alt=""
        width={wordmarkWidth}
        height={wordmarkHeight}
        decoding="async"
      />
    </span>
  )
}
