import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import type { ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  open: boolean
  onClose: () => void
}

export function Modal({ title, children, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Portals mount outside `.onside-app`; keep both classes so tokens and form styles still apply. */}
      <DialogContent className="onside-app onside-dialog max-h-[min(90dvh,900px)] min-h-0 max-w-[calc(100vw-2rem)] overflow-hidden overscroll-contain rounded-none border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] p-0 text-[var(--onside-ink)] shadow-[8px_8px_0_var(--onside-ink)] sm:max-w-lg">
        <div className="flex items-center justify-between border-[var(--onside-line)] border-b p-6 pb-4">
          <DialogTitle className="onside-display text-2xl">{title}</DialogTitle>
          <DialogClose
            onClick={onClose}
            className="grid min-h-11 min-w-11 place-items-center"
          />
        </div>
        <div className="max-h-[calc(90dvh-5rem)] overflow-y-auto overscroll-contain px-6 pb-6">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
