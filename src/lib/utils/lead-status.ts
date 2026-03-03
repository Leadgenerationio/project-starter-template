import { differenceInDays } from 'date-fns'
import { AGING_THRESHOLDS } from '@/lib/constants'
import type { LeadStatus } from '@/lib/constants'

export function getLeadAgeDays(createdAt: string): number {
  return differenceInDays(new Date(), new Date(createdAt))
}

export function computeLeadStatus(createdAt: string, currentStatus: LeadStatus): LeadStatus {
  if (currentStatus === 'resold') return 'resold'
  const days = getLeadAgeDays(createdAt)
  if (days >= AGING_THRESHOLDS.ELIGIBLE_MIN_DAYS) return 'eligible'
  if (days > AGING_THRESHOLDS.NEW_MAX_DAYS) return 'aging'
  return 'new'
}

export function getAgingProgress(createdAt: string): number {
  const days = getLeadAgeDays(createdAt)
  return Math.min(100, Math.round((days / AGING_THRESHOLDS.ELIGIBLE_MIN_DAYS) * 100))
}

export function getDaysUntilEligible(createdAt: string): number {
  const days = getLeadAgeDays(createdAt)
  return Math.max(0, AGING_THRESHOLDS.ELIGIBLE_MIN_DAYS - days)
}
