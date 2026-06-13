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
      <DialogContent className="p-0 overflow-hidden max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <div className="flex items-center justify-between p-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose onClick={onClose} />
        </div>
        <div className="px-6 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
