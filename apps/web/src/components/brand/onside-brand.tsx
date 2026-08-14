const ONSIDE_ICON_SRC = '/onside-icone-preto.png'
const ONSIDE_WORDMARK_SRC = '/onside-wordmark-paper.png'

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
        alt=""
        width={wordmarkWidth}
        height={wordmarkHeight}
        decoding="async"
      />
    </span>
  )
}
