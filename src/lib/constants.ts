export const PRODUCTS = [
  'Life Insurance',
  'Home Insurance',
  'Auto Insurance',
  'Health Insurance',
  'Travel Insurance',
  'Pet Insurance',
  'Business Insurance',
  'Mortgage',
  'Personal Loan',
  'Credit Card',
  'Savings Account',
  'Investment',
] as const

export type Product = (typeof PRODUCTS)[number]

export const LEAD_SOURCES = [
  'Website',
  'Referral',
  'Cold Call',
  'Social Media',
  'Email Campaign',
  'Partner',
  'Event',
  'Other',
] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_STATUSES = [
  'new',
  'aging',
  'eligible',
  'resold',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  aging: 'Aging',
  eligible: 'Eligible',
  resold: 'Resold',
}

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  aging: 'bg-yellow-100 text-yellow-800',
  eligible: 'bg-green-100 text-green-800',
  resold: 'bg-purple-100 text-purple-800',
}

export const ORDER_STATUSES = ['draft', 'confirmed', 'downloaded'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORG_ROLES = ['owner', 'admin', 'member'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export const AGING_THRESHOLDS = {
  NEW_MAX_DAYS: 14,
  AGING_MAX_DAYS: 29,
  ELIGIBLE_MIN_DAYS: 30,
} as const

export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const INLINE_IMPORT_THRESHOLD = 100 // Process files with <=100 rows inline
