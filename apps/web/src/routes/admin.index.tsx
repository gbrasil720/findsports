import { createFileRoute } from '@tanstack/react-router'
import { Hoje } from '@/components/admin/hoje'

export const Route = createFileRoute('/admin/')({
  component: Hoje
})
