import logo from '../../../public/onside-app-icon.png'

export function Logo({ className = 'size-10' }: { className?: string }) {
  return (
    // biome-ignore lint/performance/noImgElement: TanStack Start has no built-in optimized image component.
    <img src={logo} alt="Onside" className={className} width={48} height={48} />
  )
}
