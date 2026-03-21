export const PRODUCTS = [
  'Solar Panels',
  'Insulation',
  'Windows & Doors',
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

export const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024 // 50MB (Supabase free plan limit)
export const INLINE_IMPORT_THRESHOLD = 5000 // Process files with <=5000 rows inline (covers Vercel deployments without import-agent)
export const IMPORT_BATCH_SIZE = 200 // Rows per batch insert to avoid Supabase payload limits
