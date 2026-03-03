import { getAgingProgress, getLeadAgeDays, getDaysUntilEligible } from '@/lib/utils/lead-status'
import { cn } from '@/lib/utils/cn'

interface LeadAgingBarProps {
  createdAt: string
  status: string
}

export function LeadAgingBar({ createdAt, status }: LeadAgingBarProps) {
  const progress = getAgingProgress(createdAt)
  const ageDays = getLeadAgeDays(createdAt)
  const daysLeft = getDaysUntilEligible(createdAt)

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Age: {ageDays} days</span>
        <span className="text-muted-foreground">
          {status === 'eligible' || status === 'resold'
            ? 'Eligible for resale'
            : `${daysLeft} days until eligible`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-blue-500'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Day 0</span>
        <span>Day 14</span>
        <span>Day 30</span>
      </div>
    </div>
  )
}
