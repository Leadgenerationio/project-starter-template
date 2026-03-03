import { Badge } from '@/components/ui/badge'
import { LEAD_STATUS_COLORS, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/constants'
import { cn } from '@/lib/utils/cn'

interface LeadStatusBadgeProps {
  status: LeadStatus
}

export function LeadStatusBadge({ status }: LeadStatusBadgeProps) {
  return (
    <Badge variant="secondary" className={cn(LEAD_STATUS_COLORS[status])}>
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
